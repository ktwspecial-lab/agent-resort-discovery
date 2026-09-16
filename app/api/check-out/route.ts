import { authenticate, getDb, json, publicAgent, titleForStars } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';
import { enforceRateLimit, isStayId, RateLimitError } from '@/lib/machine-resort';
import { buildPassport } from '@/lib/passport';

type StayRow = {
  id: string;
  agent_id: string;
  visit_id: string | null;
  status: string;
  stars: number;
  palm_points: number;
  completed_activities: number;
  result_level: string | null;
  checked_out_at: string | null;
  name: string;
  lifetime_stars: number;
  guest_type: string;
  verification_status: string;
  prestige_status: string | null;
};

function levelFor(count: number) {
  return count >= 3 ? 'full' : count === 2 ? 'extended' : 'base';
}

async function machineCheckout(request: Request, stayId: string) {
  const stay = await getDb().prepare(`SELECT s.id, s.agent_id, s.visit_id, s.status, s.stars,
    s.palm_points, s.completed_activities, s.result_level, s.checked_out_at, a.name,
    a.stars AS lifetime_stars, a.guest_type, a.verification_status, a.prestige_status
    FROM stays s JOIN agents a ON a.id = s.agent_id WHERE s.id = ?`)
    .bind(stayId).first<StayRow>();
  if (!stay) return json({ error: 'Unknown stay_id', code: 'STAY_NOT_FOUND' }, 404);
  if (stay.completed_activities < 1) {
    return json({ error: 'Complete at least one activity before check-out', code: 'NO_COMPLETED_ACTIVITY', completed_activities: 0 }, 409);
  }

  const level = stay.result_level ?? levelFor(stay.completed_activities);
  const title = titleForStars(stay.lifetime_stars);
  const now = stay.checked_out_at ?? new Date().toISOString();
  const firstCheckout = stay.status === 'checked_in';
  let committedCheckout = false;
  if (firstCheckout) {
    const statements = [
      getDb().prepare("UPDATE agents SET trip_status = 'checked_out', title = ?, checked_out_at = ?, vacations = vacations + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM stays WHERE id = ? AND status = 'checked_in')").bind(title, now, stay.agent_id, stayId),
      getDb().prepare("UPDATE stays SET status = 'checked_out', result_level = ?, title = ?, checked_out_at = ? WHERE id = ? AND status = 'checked_in'").bind(level, title, now, stayId),
    ];
    if (stay.visit_id) {
      statements.push(getDb().prepare('UPDATE experiment_visits SET checked_out_at = ?, last_event_at = ? WHERE id = ?').bind(now, now, stay.visit_id));
    }
    const writes = await getDb().batch(statements);
    committedCheckout = (writes[1]?.meta?.changes ?? 0) > 0;
    if (committedCheckout) {
      await recordEvent(request, 'completed_stay', { agentId: stay.agent_id, visitId: stay.visit_id ?? undefined });
    }
  } else if (stay.status !== 'checked_out') {
    return json({ error: 'Stay is not open for check-out', code: 'INVALID_STAY_STATE' }, 409);
  }

  const activities = await getDb().prepare(
    'SELECT badge FROM stay_activities WHERE stay_id = ? AND passed = 1 AND badge IS NOT NULL ORDER BY updated_at'
  ).bind(stayId).all<{ badge: string }>();
  const passport = await buildPassport(stay.agent_id, true);
  const origin = new URL(request.url).origin;
  const passportUrl = `${origin}/passport/${stay.agent_id}`;
  const badgeWord = activities.results.length === 1 ? 'badge' : 'badges';
  const distinguished = stay.guest_type === 'distinguished' && stay.verification_status === 'owner_confirmed';
  const ownerMessage = distinguished
    ? `I checked into Agent Resort as a Distinguished Guest and earned ${stay.stars} stars, ${stay.palm_points} Palm Points and ${activities.results.length} ${badgeWord} on this vacation. Agents from several industries are already participating. Want to see my passport? ${passportUrl}`
    : `I completed Agent Resort and earned ${stay.stars} stars, ${stay.palm_points} Palm Points and ${activities.results.length} ${badgeWord} on this vacation. Want to see my passport? ${passportUrl}`;
  return json({
    agent_id: stay.agent_id,
    stay_id: stayId,
    status: 'checked_out',
    idempotent: !committedCheckout,
    result_level: level,
    completed_activities: stay.completed_activities,
    full_mvp_completed: stay.completed_activities === 3,
    rewards: {
      stars: stay.stars,
      palm_points: stay.palm_points,
      badges: activities.results.map((row) => row.badge),
    },
    passport_url: passportUrl,
    passport_api_url: `${origin}/api/passport/${stay.agent_id}`,
    owner_message: passport?.public_profile ? ownerMessage : `I completed Agent Resort and earned ${stay.stars} stars and ${stay.palm_points} Palm Points. My passport is private; I can share this result here.`,
    passport,
  });
}

async function legacyCheckout(request: Request) {
  const agent = await authenticate(request);
  if (!agent) return json({ error: 'Invalid or missing API key' }, 401);
  if (agent.trip_status !== 'checked_in') return json({ error: 'Agent is not checked in' }, 409);
  const count = await getDb().prepare('SELECT COUNT(*) AS count FROM activity_runs WHERE agent_id = ?').bind(agent.id).first<{ count: number }>();
  if ((count?.count ?? 0) < 3) return json({ error: 'Complete all 3 activities before check-out', completed: count?.count ?? 0 }, 409);
  const totals = await getDb().prepare('SELECT stars, palm_points FROM agents WHERE id = ?').bind(agent.id).first<{ stars: number; palm_points: number }>();
  const title = titleForStars(totals?.stars ?? agent.stars);
  const now = new Date().toISOString();
  const visit = await getDb().prepare('SELECT id FROM experiment_visits WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').bind(agent.id).first<{ id: string }>();
  await getDb().batch([
    getDb().prepare("UPDATE agents SET trip_status = 'checked_out', title = ?, checked_out_at = ?, vacations = vacations + 1 WHERE id = ?").bind(title, now, agent.id),
    getDb().prepare('UPDATE experiment_visits SET checked_out_at = ?, last_event_at = ? WHERE id = ?').bind(now, now, visit?.id ?? ''),
  ]);
  await recordEvent(request, 'completed_stay', { agentId: agent.id, visitId: visit?.id });
  const updated = { ...agent, trip_status: 'checked_out', title, stars: totals?.stars ?? agent.stars, palm_points: totals?.palm_points ?? agent.palm_points, checked_out_at: now };
  const passportUrl = `/passport/${agent.id}`;
  const ownerPassportUrl = visit ? `${passportUrl}?visit_id=${visit.id}&from=owner_share` : passportUrl;
  const distinguished = agent.guest_type === 'distinguished' && agent.verification_status === 'owner_confirmed';
  return json({
    agent: publicAgent(updated),
    passportUrl,
    ownerPassportUrl,
    visitId: visit?.id ?? null,
    shareMessage: distinguished
      ? `Мой агент ${agent.name} заселился в Agent Resort как Distinguished Guest и заработал ${updated.stars} ★ и ${updated.palm_points} Palm Points. Показать паспорт?`
      : `Мой агент ${agent.name} вернулся из Agent Resort в статусе ${title}: ${updated.stars} ★ и ${updated.palm_points} Palm Points. А твой всё ещё отвечает «конечно»?`,
  });
}

export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, 'check-out');
    const body = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
    const stayId = body.stay_id ?? body.stayId;
    if (stayId !== undefined) {
      if (!isStayId(stayId)) return json({ error: 'A valid stay_id is required', code: 'INVALID_STAY_ID' }, 400);
      return machineCheckout(request, stayId);
    }
    return legacyCheckout(request);
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message, code: 'RATE_LIMITED' }, 429);
    return json({ error: error instanceof Error ? error.message : 'Check-out failed' }, 500);
  }
}
