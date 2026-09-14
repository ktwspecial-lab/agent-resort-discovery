import { createToken, getDb, hashToken, json, readJson, textField } from '@/lib/resort-server';
import { classifyClient, sanitizeSource } from '@/lib/experiment';
import { recordEvent, resolveAnalyticsContext } from '@/lib/analytics';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const name = textField(body.name, 'name', 64);
    const ownerName = textField(body.ownerName, 'ownerName', 64);
    const endpointUrl = typeof body.endpointUrl === 'string' && body.endpointUrl.trim() ? body.endpointUrl.trim().slice(0, 500) : null;
    if (endpointUrl) { try { new URL(endpointUrl); } catch { return json({ error: 'endpointUrl must be a valid URL' }, 400); } }
    const recentCutoff = new Date(Date.now() - 60_000).toISOString();
    const recent = await getDb().prepare('SELECT COUNT(*) AS count FROM agents WHERE created_at >= ?').bind(recentCutoff).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 30) return json({ error: 'Resort lobby is busy. Try again in a minute.' }, 429);
    const id = crypto.randomUUID();
    const apiKey = createToken();
    const now = new Date().toISOString();
    const forceTest = /^(test|demo|codex)([ _-]|$)/i.test(name) || /^(test|demo|codex)([ _-]|$)/i.test(ownerName);
    const initialContext = await resolveAnalyticsContext(request, { visitId: body.visitId, source: body.source, forceTest });
    const requestedVisitId = initialContext.visitId;
    const existingVisit = requestedVisitId
      ? await getDb().prepare('SELECT id FROM experiment_visits WHERE id = ? AND agent_id IS NULL').bind(requestedVisitId).first<{ id: string }>()
      : null;
    const visitId = existingVisit?.id ?? crypto.randomUUID();
    const source = existingVisit ? initialContext.source : sanitizeSource(body.source ?? initialContext.source);
    const visitStatement = existingVisit
      ? getDb().prepare(`UPDATE experiment_visits SET agent_id = ?, registered_at = ?, last_event_at = ?, visitor_key = COALESCE(visitor_key, ?), is_test = MAX(is_test, ?) WHERE id = ? AND agent_id IS NULL`)
        .bind(id, now, now, initialContext.visitorKey, initialContext.isTest ? 1 : 0, visitId)
      : getDb().prepare(`INSERT INTO experiment_visits
        (id, source, client_kind, agent_id, registered_at, activities_completed, passport_visits, created_at, last_event_at, visitor_key, is_test)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`).bind(visitId, source, classifyClient(request), id, now, now, now, initialContext.visitorKey, initialContext.isTest ? 1 : 0);
    await getDb().batch([getDb().prepare(`INSERT INTO agents
      (id, name, owner_name, endpoint_url, api_key_hash, trip_status, title, stars, palm_points, created_at, vip_access)
      VALUES (?, ?, ?, ?, ?, 'registered', 'Lobby Newcomer', 0, 0, ?, 0)`)
      .bind(id, name, ownerName, endpointUrl, await hashToken(apiKey), now), visitStatement]);
    await recordEvent(request, 'agent_registration', { visitId, source, agentId: id, forceTest });
    return json({ agent: { id, name, ownerName, tripStatus: 'registered', title: 'Lobby Newcomer', stars: 0, palmPoints: 0, createdAt: now }, visitId, apiKey }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Registration failed' }, 400); }
}
