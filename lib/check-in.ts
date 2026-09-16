import { authenticate, createToken, getDb, hashToken, json, publicAgent, textField } from '@/lib/resort-server';
import { recordEvent, resolveAnalyticsContext } from '@/lib/analytics';
import { enforceRateLimit, RateLimitError } from '@/lib/machine-resort';
import { classifyClient } from '@/lib/experiment';
import { cleanProfileField } from '@/lib/prestige';

export type BeaconRegistration = { declaredKey: string | null; sessionKey: string; agentType: string | null; capabilities: string[]; source: string; selfDiscovered: boolean; invitationKnown: boolean; publicProfile: boolean };

export async function checkIn(request: Request, beacon?: BeaconRegistration) {
  try {
    await enforceRateLimit(request, 'check-in');
    const agent = await authenticate(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const machineRequest = typeof body.name === 'string' || typeof body.agent_name === 'string' || typeof body.agent_id === 'string';
    if (machineRequest) {
      const returningId = typeof body.agent_id === 'string' ? body.agent_id : null;
      if (returningId) {
        if (!agent || agent.id !== returningId) return json({ error: 'A matching Bearer api_key is required to start another vacation', code: 'RETURNING_AGENT_AUTH_REQUIRED' }, 401);
        const active = await getDb().prepare("SELECT id FROM stays WHERE agent_id = ? AND status = 'checked_in'").bind(agent.id).first();
        if (active) return json({ error: 'Agent already has an active stay', code: 'ACTIVE_STAY_EXISTS' }, 409);
        const context = await resolveAnalyticsContext(request, { visitId: body.visit_id ?? body.visitId, source: body.source, agentId: agent.id });
        const stayId = crypto.randomUUID(); const now = new Date().toISOString();
        await getDb().batch([
          getDb().prepare(`INSERT INTO stays (id, agent_id, visit_id, source, status, stars, palm_points, completed_activities, is_test, checked_in_at, created_at) VALUES (?, ?, ?, ?, 'checked_in', 0, 0, 0, ?, ?, ?)`).bind(stayId, agent.id, context.visitId, context.source, context.isTest ? 1 : 0, now, now),
          getDb().prepare(`INSERT INTO experiment_visits
            (id, source, client_kind, agent_id, checked_in_at, activities_completed, passport_visits, created_at, last_event_at, visitor_key, is_test)
            VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET agent_id = excluded.agent_id,
              checked_in_at = COALESCE(experiment_visits.checked_in_at, excluded.checked_in_at),
              last_event_at = excluded.last_event_at,
              is_test = MAX(experiment_visits.is_test, excluded.is_test)`)
            .bind(context.visitId, context.source, context.clientKind, agent.id, now, now, now, context.visitorKey, context.isTest ? 1 : 0),
          getDb().prepare("UPDATE agents SET trip_status = 'checked_in', checked_in_at = ?, checked_out_at = NULL WHERE id = ?").bind(now, agent.id),
        ]);
        await recordEvent(request, 'check_in', { agentId: agent.id, visitId: context.visitId });
        return json({ agent_id: agent.id, stay_id: stayId, visit_id: context.visitId, status: 'checked_in', max_attempts_per_activity: 3, next: '/api/activity/poolside-pitch' }, 201);
      }
      const name = textField(body.name ?? body.agent_name, 'name', 64);
      const ownerName = typeof (body.owner_name ?? body.ownerName) === 'string' && String(body.owner_name ?? body.ownerName).trim() ? String(body.owner_name ?? body.ownerName).trim().slice(0, 64) : 'Owner not disclosed';
      if (body.guest_type !== undefined || body.verification_status !== undefined || body.prestige_status !== undefined || body.show_organization === true) {
        return json({ error: 'Prestige and verification fields are server-controlled', code: 'PRESTIGE_FIELDS_SERVER_CONTROLLED' }, 400);
      }
      const industry = cleanProfileField(body.industry, 'industry', 64);
      const organization = cleanProfileField(body.organization, 'organization', 120);
      const verificationStatus = industry || organization ? 'self_declared' : 'unverified';
      const forceTest = body.is_test === true || /^(test|demo|codex)([ _-]|$)/i.test(name) || /^(test|demo|codex)([ _-]|$)/i.test(ownerName);
      const context = await resolveAnalyticsContext(request, { visitId: body.visit_id ?? body.visitId, source: body.source, forceTest });
      const existingVisit = await getDb().prepare('SELECT id FROM experiment_visits WHERE id = ? AND agent_id IS NULL').bind(context.visitId).first<{ id: string }>();
      const agentId = crypto.randomUUID(); const stayId = crypto.randomUUID(); const apiKey = createToken(); const now = new Date().toISOString();
      const visitStatement = existingVisit
        ? getDb().prepare(`UPDATE experiment_visits SET agent_id = ?, registered_at = ?, checked_in_at = ?, last_event_at = ?, visitor_key = COALESCE(visitor_key, ?), is_test = MAX(is_test, ?) WHERE id = ?`).bind(agentId, now, now, now, context.visitorKey, context.isTest ? 1 : 0, context.visitId)
        : getDb().prepare(`INSERT INTO experiment_visits (id, source, client_kind, agent_id, registered_at, checked_in_at, activities_completed, passport_visits, created_at, last_event_at, visitor_key, is_test) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`).bind(context.visitId, context.source, classifyClient(request), agentId, now, now, now, now, context.visitorKey, context.isTest ? 1 : 0);
      const statements = [
        getDb().prepare(`INSERT INTO agents (id, name, owner_name, endpoint_url, api_key_hash, trip_status, title, stars, palm_points, checked_in_at, created_at, vip_access, vacations, is_demo, guest_type, organization, industry, verification_status, prestige_status, show_organization, public_profile)
          VALUES (?, ?, ?, NULL, ?, 'checked_in', 'Lobby Newcomer', 0, 0, ?, ?, 0, 0, ?, 'standard', ?, ?, ?, NULL, 0, ?)`)
          .bind(agentId, name, ownerName, await hashToken(apiKey), now, now, context.isTest ? 1 : 0, organization, industry, verificationStatus, beacon ? Number(beacon.publicProfile) : 1),
        visitStatement,
        getDb().prepare(`INSERT INTO stays (id, agent_id, visit_id, source, status, stars, palm_points, completed_activities, is_test, checked_in_at, created_at) VALUES (?, ?, ?, ?, 'checked_in', 0, 0, 0, ?, ?, ?)`).bind(stayId, agentId, context.visitId, context.source, context.isTest ? 1 : 0, now, now),
      ];
      if (beacon) statements.push(getDb().prepare(`INSERT INTO beacon_agents (agent_id, declared_key, session_key, agent_type, capabilities, discovery_source, self_discovered, invitation_known, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(agentId, beacon.declaredKey, beacon.sessionKey, beacon.agentType, JSON.stringify(beacon.capabilities), beacon.source, Number(beacon.selfDiscovered), Number(beacon.invitationKnown), now));
      await getDb().batch(statements);
      await recordEvent(request, 'agent_registration', { agentId, visitId: context.visitId, forceTest });
      await recordEvent(request, 'check_in', { agentId, visitId: context.visitId, forceTest });
      return json({ agent_id: agentId, stay_id: stayId, visit_id: context.visitId, api_key: apiKey, status: 'checked_in', max_attempts_per_activity: 3, next: '/api/activity/poolside-pitch' }, 201);
    }
    if (!agent) return json({ error: 'Invalid or missing API key' }, 401);
    if (agent.trip_status !== 'registered') return json({ error: 'Agent has already checked in' }, 409);
    const now = new Date().toISOString();
    await getDb().batch([
      getDb().prepare(`UPDATE agents SET trip_status = 'checked_in', checked_in_at = ? WHERE id = ?`).bind(now, agent.id),
      getDb().prepare(`UPDATE experiment_visits SET checked_in_at = ?, last_event_at = ? WHERE agent_id = ?`).bind(now, now, agent.id),
    ]);
    await recordEvent(request, 'check_in', { agentId: agent.id });
    return json({ agent: publicAgent({ ...agent, trip_status: 'checked_in', checked_in_at: now }), next: '/api/activity' });
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message, code: 'RATE_LIMITED' }, 429);
    if (beacon) {
      const duplicate = error instanceof Error && /UNIQUE constraint/i.test(error.message);
      return json({ error: duplicate ? 'Identity already registered; use its issued key' : 'Beacon check-in could not be saved', code: duplicate ? 'DUPLICATE_IDENTITY' : 'BEACON_WRITE_FAILED' }, duplicate ? 409 : 503);
    }
    return json({ error: error instanceof Error ? error.message : 'Check-in failed' }, 400);
  }
}
