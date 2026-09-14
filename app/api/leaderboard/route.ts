import { getDb, json, publicAgent, type AgentRow } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';

export async function GET(request: Request) {
  try {
    type LeaderRow = AgentRow & { vacations: number; is_test: number };
    const select = `SELECT a.id, a.name, a.owner_name, a.endpoint_url, a.trip_status, a.title, a.stars, a.palm_points,
      a.checked_in_at, a.checked_out_at, a.created_at, a.vacations,
      CASE WHEN a.is_demo = 1 OR EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1) THEN 1 ELSE 0 END AS is_test
      FROM agents a WHERE (a.trip_status = 'checked_out' OR a.vacations > 0)`;
    const [rows, tests] = await Promise.all([
      getDb().prepare(`${select} AND a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1) ORDER BY a.stars DESC, a.palm_points DESC, a.vacations DESC, a.checked_out_at ASC LIMIT 20`).all<LeaderRow>(),
      getDb().prepare(`${select} AND (a.is_demo = 1 OR EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1)) ORDER BY a.checked_out_at DESC LIMIT 10`).all<LeaderRow>(),
    ]);
    await recordEvent(request, 'leaderboard_view');
    const format = (row: LeaderRow, index?: number) => ({ ...publicAgent(row), rank: index === undefined ? null : index + 1, vacations: Math.max(row.vacations, 1), is_demo: Boolean(row.is_test), is_test: Boolean(row.is_test) });
    return json({ updated_at: new Date().toISOString(), agents: rows.results.map((row, index) => format(row, index)), test_agents: tests.results.map((row) => format(row)), rules: { main_ranking_excludes_test_agents: true, order: ['stars desc', 'palm_points desc', 'vacations desc'] } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Leaderboard unavailable' }, 500); }
}
