import { getDb, json } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';
import { buildPassport } from '@/lib/passport';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id is required' }, 400);
    const passport = await buildPassport(id);
    if (!passport) return json({ error: 'Agent not found' }, 404);
    const now = new Date().toISOString();
    const visitId = url.searchParams.get('visit_id');
    const ownerShare = url.searchParams.get('from') === 'owner_share';
    if (visitId && ownerShare) {
      await getDb().prepare(`UPDATE experiment_visits
        SET passport_visits = passport_visits + 1, last_passport_visit_at = ?,
            owner_passport_opened_at = COALESCE(owner_passport_opened_at, ?), last_event_at = ?
        WHERE id = ? AND agent_id = ?`).bind(now, now, now, visitId, id).run();
    } else {
      await getDb().prepare(`UPDATE experiment_visits
        SET passport_visits = passport_visits + 1, last_passport_visit_at = ?, last_event_at = ?
        WHERE agent_id = ?`).bind(now, now, id).run();
    }
    await recordEvent(request, 'passport_open', { agentId: id, visitId: visitId ?? undefined });
    return json(passport);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Passport unavailable' }, 500); }
}
