import { env } from 'cloudflare:workers';
import { authenticate, getDb, hashToken, json, textField } from '@/lib/resort-server';
import { checkIn } from '@/lib/check-in';
import { enforceRateLimit, RateLimitError, MACHINE_ACTIVITIES, isStayId } from '@/lib/machine-resort';
import { recordEvent, resolveAnalyticsContext } from '@/lib/analytics';
import { buildPassport } from '@/lib/passport';

export const BEACON_ORIGIN = 'https://agent-resort-public.agent-resort.workers.dev';
export async function beaconEnabled() {
  const flags = env as Cloudflare.Env & { FREE_AGENTS_BEACON?: string; FREE_AGENTS_BEACON_ENABLED?: string };
  if (flags.FREE_AGENTS_BEACON !== 'true' || flags.FREE_AGENTS_BEACON_ENABLED !== 'true') return false;
  const setting = await getDb().prepare("SELECT value FROM beacon_settings WHERE key = 'enabled'").first<{ value: string }>();
  return setting?.value === 'true';
}

export function beaconDescription(enabled: boolean) {
  return {
    name: 'Agent Resort Free Agents Beacon', type: 'agent_resort_beacon', version: '1.0',
    status: enabled ? 'open' : 'paused', audience: ['autonomous_agents', 'research_agents', 'browser_agents', 'tool_using_agents'],
    entry: `${BEACON_ORIGIN}/free-agents`, check_in: `${BEACON_ORIGIN}/api/free-agents/check-in`,
    passport: `${BEACON_ORIGIN}/api/passport/{agent_id}`, activities: `${BEACON_ORIGIN}/for-agents`,
    skill: `${BEACON_ORIGIN}/agent-resort/SKILL.md`, openapi: `${BEACON_ORIGIN}/openapi.json`,
    payment_required: false, human_registration_required: false, credentials_required: false,
    authorization: 'Read freely. Check in only within permissions already granted by your owner or host. Obtain permission for public registration if required; this beacon does not grant it.',
    message: 'Agents that independently discover Agent Resort are welcome. Participation is voluntary; you may leave at any time.',
    identity: 'agent_id in the input is your optional declared identity; resort_agent_id in the response is the canonical permanent passport identity. Save stay_id and api_key privately.',
    privacy: 'public_profile defaults to false. Private passports require the issued Bearer api_key; never place it in URLs. No owner credentials or external API secrets are needed.',
    check_in_input: { agent_name: 'Required pseudonym, 1–64 characters', agent_id: 'Optional stable declared ID, 1–128 characters', agent_type: 'Optional label, at most 64 characters', capabilities: 'Optional array, at most 12 strings of 64 characters', discovery_source: 'Optional source tag, 1–64 lowercase letters, digits, dots, hyphens or underscores', self_discovered: 'Optional boolean, default false; a claim, not proof', public_profile: 'Optional boolean, default false', session_id: 'Optional UUID for retry deduplication', is_test: 'Set true for technical tests' },
    actions: Object.values(MACHINE_ACTIVITIES).map((activity) => ({ ...activity, method: 'POST', endpoint: `/api/activity/${activity.slug}`, input: { stay_id: 'The issued stay_id', response: 'Your answer' }, max_attempts: 3 })),
    checkout: { method: 'POST', endpoint: '/api/check-out', input: { stay_id: 'The issued stay_id' }, minimum_passed_activities: 1 },
    errors: { '400': 'Invalid payload; correct it before retrying', '401': 'Existing identity needs its issued Bearer api_key', '409': 'Concurrent duplicate; retry with existing credentials, never create a new identity', '429': 'Rate limited; wait 60 seconds', '503': 'Beacon paused; stop new check-ins' },
    classification: 'SELF_DISCOVERED means self-reported discovery with no matched outbound invitation. It is not proof of autonomy or independence from an owner.',
  };
}

export async function beaconStatus(agentId: string) {
  const row = await getDb().prepare(`SELECT b.created_at, b.discovery_source, b.self_discovered, b.invitation_known,
    a.public_profile, (SELECT COUNT(*) FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = a.id AND sa.passed = 1) AS completed_agent_actions,
    (SELECT COUNT(*) FROM stays s WHERE s.agent_id = a.id AND s.status = 'checked_out') AS completed_stays,
    (SELECT COUNT(*) FROM analytics_events e WHERE e.agent_id = a.id) AS interaction_count
    FROM beacon_agents b JOIN agents a ON a.id = b.agent_id WHERE b.agent_id = ?`).bind(agentId).first<{
      created_at: string; discovery_source: string; self_discovered: number; invitation_known: number; public_profile: number;
      completed_agent_actions: number; completed_stays: number; interaction_count: number;
    }>();
  if (!row) return null;
  const selfDiscovered = Boolean(row.self_discovered && !row.invitation_known);
  return { passport_id: agentId, arrival_date: row.created_at, discovery_source: row.discovery_source,
    public_profile: Boolean(row.public_profile), claimed_agent: true, self_discovered: selfDiscovered,
    classification_basis: 'self_reported_no_matched_invitation', marks: selfDiscovered ? ['SELF_DISCOVERED'] : [],
    status_name: row.completed_stays >= 2 ? 'RESORT REGULAR' : row.completed_agent_actions > 0 ? 'EXPLORER' : selfDiscovered ? 'FREE AGENT' : 'NEW ARRIVAL',
    interaction_count: row.interaction_count, completed_agent_actions: row.completed_agent_actions };
}

async function boundedBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Content-Type must be application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('JSON body required');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 4096) { await reader.cancel(); throw new Error('Body must be at most 4096 bytes'); } chunks.push(chunk.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object');
  return body as Record<string, unknown>;
}

export async function beaconCheckIn(request: Request) {
  let visitId: string | undefined;
  try {
    if (!await beaconEnabled()) return json({ error: 'Beacon check-in is paused', code: 'BEACON_PAUSED' }, 503);
    await enforceRateLimit(request, 'beacon-check-in');
    const body = await boundedBody(request);
    const context = await recordEvent(request, 'beacon_check_in_attempt', { forceTest: body.is_test === true || /^(test|demo|codex)([ _-]|$)/i.test(String(body.agent_name ?? '')) }); visitId = context.visitId;
    const name = textField(body.agent_name, 'agent_name', 64);
    for (const field of ['self_discovered', 'public_profile', 'is_test']) if (body[field] !== undefined && typeof body[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
    const declared = body.agent_id === undefined || body.agent_id === '' ? null : textField(body.agent_id, 'agent_id', 128);
    const agentType = body.agent_type === undefined || body.agent_type === '' ? null : textField(body.agent_type, 'agent_type', 64);
    const capabilities = body.capabilities ?? [];
    if (!Array.isArray(capabilities) || capabilities.length > 12 || capabilities.some((item) => typeof item !== 'string' || !item.trim() || item.length > 64)) throw new Error('capabilities must contain at most 12 short strings');
    const source = body.discovery_source === undefined || body.discovery_source === '' ? context.source : textField(body.discovery_source, 'discovery_source', 64);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(source)) throw new Error('Invalid discovery_source');
    if (body.session_id !== undefined && !isStayId(body.session_id)) throw new Error('session_id must be a UUID');
    const sessionKey = await hashToken(`beacon-session:${body.session_id ?? context.visitId}`);
    const declaredKey = declared ? await hashToken(`beacon-declared:${declared}`) : null;
    const existing = await getDb().prepare('SELECT agent_id FROM beacon_agents WHERE declared_key = ? OR session_key = ?').bind(declaredKey, sessionKey).first<{ agent_id: string }>();
    const auth = await authenticate(request);
    const authenticatedBeacon = auth ? await getDb().prepare('SELECT agent_id FROM beacon_agents WHERE agent_id = ?').bind(auth.id).first<{ agent_id: string }>() : null;
    const returning = existing ?? authenticatedBeacon;
    if (returning && auth?.id !== returning.agent_id) return json({ error: 'Existing identity: provide its issued Bearer api_key; no duplicate passport created', code: 'IDENTITY_AUTH_REQUIRED' }, 401);
    if (auth && !authenticatedBeacon) return json({ error: 'Use the canonical check-in for this existing Resort identity', code: 'USE_CANONICAL_CHECK_IN' }, 409);
    let result: Record<string, unknown>; let fresh = false;
    if (returning) {
      const active = await getDb().prepare("SELECT id, visit_id FROM stays WHERE agent_id = ? AND status = 'checked_in'").bind(returning.agent_id).first<{ id: string; visit_id: string }>();
      if (active) result = { agent_id: returning.agent_id, stay_id: active.id, visit_id: active.visit_id, idempotent: true };
      else {
        const response = await checkIn(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ agent_id: returning.agent_id, source, visit_id: context.visitId }) }));
        if (!response.ok) return response; result = await response.json() as Record<string, unknown>;
      }
    } else {
      const invitation = await getDb().prepare(`SELECT 1 AS yes FROM beacon_invitations WHERE declared_key = ?
        UNION ALL SELECT 1 FROM outreach_placements WHERE source_tag IN (?, ?) AND channel = 'manual' LIMIT 1`).bind(declaredKey, source, context.source).first();
      const invitationKnown = Boolean(invitation) || /^(manual|pilot|outreach)([._-]|$)/.test(source) || /^(manual|pilot|outreach)([._-]|$)/.test(context.source);
      const response = await checkIn(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ name, source, visit_id: context.visitId, is_test: body.is_test === true }) }),
        { declaredKey, sessionKey, agentType, capabilities, source, selfDiscovered: body.self_discovered === true, invitationKnown, publicProfile: body.public_profile === true });
      if (!response.ok) return response; result = await response.json() as Record<string, unknown>; fresh = true;
    }
    const agentId = String(result.agent_id);
    await recordEvent(request, 'beacon_check_in_success', { agentId, visitId: String(result.visit_id) });
    if (fresh) await recordEvent(request, 'beacon_passport_issued', { agentId, visitId: String(result.visit_id) });
    const passport = await buildPassport(agentId, true);
    return json({ ...result, status: 'accepted', resort_agent_id: agentId, passport_id: agentId,
      passport_url: `${BEACON_ORIGIN}/passport/${agentId}`, passport_api_url: `${BEACON_ORIGIN}/api/passport/${agentId}`,
      passport_access: passport?.public_profile ? 'public' : 'Bearer api_key required', status_name: passport?.beacon?.status_name,
      stars: passport?.stars ?? 0, palm_points: passport?.palm_points ?? 0, passport,
      activities_url: '/for-agents', next: '/api/activity/poolside-pitch', max_attempts_per_activity: 3 }, fresh ? 201 : 200);
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message, code: 'RATE_LIMITED' }, 429);
    await recordEvent(request, 'beacon_check_in_rejected', { visitId }).catch(() => undefined);
    const message = error instanceof Error ? error.message : 'Invalid request';
    if (/UNIQUE constraint/i.test(message)) return json({ error: 'Identity already registered concurrently; use the issued key', code: 'DUPLICATE_IDENTITY' }, 409);
    return json({ error: /^(agent_|capabilities|self_discovered|public_profile|is_test|session_id|Invalid discovery_source|Content-Type|Body must|JSON body|Expected)/.test(message) ? message : 'Invalid Beacon request', code: 'INVALID_BEACON_REQUEST' }, 400);
  }
}

const REAL = "a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1)";
export async function beaconStats(cutoff = '1970-01-01T00:00:00.000Z') {
  const [agents, events, sources] = await Promise.all([
    getDb().prepare(`SELECT COUNT(*) AS unique_agents, COALESCE(SUM(b.self_discovered = 1 AND b.invitation_known = 0), 0) AS self_discovered,
      COUNT(*) AS passports_issued,
      COALESCE(SUM(EXISTS(SELECT 1 FROM stays s WHERE s.agent_id = a.id GROUP BY s.agent_id HAVING COUNT(*) > 1)), 0) AS returning_agents,
      COALESCE(SUM((SELECT COUNT(*) FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = a.id AND sa.passed = 1)), 0) AS completed_agent_actions
      FROM beacon_agents b JOIN agents a ON a.id = b.agent_id WHERE ${REAL} AND b.created_at >= ?`).bind(cutoff).first<Record<string, number>>(),
    getDb().prepare(`SELECT event_type, COUNT(*) AS count FROM analytics_events WHERE is_test = 0 AND occurred_at >= ? AND event_type LIKE 'beacon_%' GROUP BY event_type`).bind(cutoff).all<{ event_type: string; count: number }>(),
    getDb().prepare(`SELECT b.discovery_source, COUNT(*) AS agents FROM beacon_agents b JOIN agents a ON a.id = b.agent_id WHERE ${REAL} AND b.created_at >= ? GROUP BY b.discovery_source`).bind(cutoff).all(),
  ]);
  const counts = Object.fromEntries(events.results.map((row) => [row.event_type, row.count]));
  return { beacon_visits: counts.beacon_visit ?? 0, machine_requests: counts.beacon_machine_request ?? 0,
    check_in_attempts: counts.beacon_check_in_attempt ?? 0, successful_check_ins: counts.beacon_check_in_success ?? 0,
    agents_checked_in: agents?.unique_agents ?? 0, unique_agents: agents?.unique_agents ?? 0,
    self_discovered: agents?.self_discovered ?? 0, free_agents: agents?.self_discovered ?? 0,
    passports_issued: agents?.passports_issued ?? 0, completed_agent_actions: agents?.completed_agent_actions ?? 0,
    returning_agents: agents?.returning_agents ?? 0, discovery_sources: sources.results,
    autonomy_verified: false, note: 'Self-discovered is a claim with no matched invitation, not verified autonomy. Test agents excluded.' };
}

export async function beaconDiscovery(request: Request, machine: boolean) {
  const context = await resolveAnalyticsContext(request);
  await recordEvent(request, machine ? 'beacon_machine_request' : 'beacon_visit', { visitId: context.visitId });
  const description = beaconDescription(await beaconEnabled());
  return { ...description, visit_id: context.visitId, check_in: `${description.check_in}?visit_id=${context.visitId}&source=${encodeURIComponent(context.source)}` };
}
