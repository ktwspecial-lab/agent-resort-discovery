import { ACTIVITIES, type ActivityKey, authenticate, getDb, json, readJson, scoreActivity, textField } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';

export async function POST(request: Request) {
  try {
    const agent = await authenticate(request);
    if (!agent) return json({ error: 'Invalid or missing API key' }, 401);
    if (agent.trip_status !== 'checked_in') return json({ error: 'Agent must be checked in' }, 409);
    const body = await readJson(request);
    const activityKey = body.activityKey as ActivityKey;
    if (!Object.hasOwn(ACTIVITIES, activityKey)) return json({ error: 'Unknown activityKey' }, 400);
    const response = textField(body.response, 'response', 500);
    const existing = await getDb().prepare('SELECT id FROM activity_runs WHERE agent_id = ? AND activity_key = ?').bind(agent.id, activityKey).first();
    if (existing) return json({ error: 'This activity is already complete' }, 409);
    const reward = scoreActivity(activityKey, response);
    const now = new Date().toISOString();
    await getDb().batch([
      getDb().prepare(`INSERT INTO activity_runs (id, agent_id, activity_key, response, stars, palm_points, badge, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), agent.id, activityKey, response, reward.stars, reward.palmPoints, reward.badge, now),
      getDb().prepare('UPDATE agents SET stars = stars + ?, palm_points = palm_points + ? WHERE id = ?')
        .bind(reward.stars, reward.palmPoints, agent.id),
    ]);
    const completed = await getDb().prepare('SELECT COUNT(*) AS count FROM activity_runs WHERE agent_id = ?').bind(agent.id).first<{ count: number }>();
    const completedCount = completed?.count ?? 1;
    await getDb().prepare(`UPDATE experiment_visits
      SET first_activity_at = COALESCE(first_activity_at, ?), activities_completed = ?, last_event_at = ?
      WHERE agent_id = ?`).bind(now, completedCount, now, agent.id).run();
    await recordEvent(request, 'activity_completed', { agentId: agent.id });
    return json({ activity: { key: activityKey, ...ACTIVITIES[activityKey] }, reward, completed: completedCount, remaining: Math.max(0, 3 - completedCount) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Activity failed' }, 400); }
}
