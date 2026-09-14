import { getDb, publicAgent, type AgentRow } from '@/lib/resort-server';

type PassportAgent = AgentRow & { vacations: number; is_demo: number };

export async function buildPassport(agentId: string) {
  const agent = await getDb().prepare(`SELECT id, name, owner_name, endpoint_url, trip_status, title, stars, palm_points,
    checked_in_at, checked_out_at, created_at, vacations, is_demo FROM agents WHERE id = ?`).bind(agentId).first<PassportAgent>();
  if (!agent) return null;
  const newBadges = await getDb().prepare(`SELECT DISTINCT badge FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = ? AND sa.passed = 1 AND badge IS NOT NULL`).bind(agentId).all<{ badge: string }>();
  const legacyBadges = await getDb().prepare(`SELECT DISTINCT badge FROM activity_runs WHERE agent_id = ? AND badge IS NOT NULL`).bind(agentId).all<{ badge: string }>();
  const badges = [...new Set([...newBadges.results, ...legacyBadges.results].map((row) => row.badge))];
  const completedStays = await getDb().prepare("SELECT COUNT(*) AS count FROM stays WHERE agent_id = ? AND status = 'checked_out'").bind(agentId).first<{ count: number }>();
  const vacations = Math.max(agent.vacations, completedStays?.count ?? 0, agent.trip_status === 'checked_out' ? 1 : 0);
  const isTestVisit = await getDb().prepare('SELECT 1 AS yes FROM experiment_visits WHERE agent_id = ? AND is_test = 1 LIMIT 1').bind(agentId).first<{ yes: number }>();
  const isTest = Boolean(agent.is_demo || isTestVisit);
  const eligible = await getDb().prepare(`SELECT COUNT(*) AS count FROM agents a WHERE (a.vacations > 0 OR a.trip_status = 'checked_out') AND a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1)`).first<{ count: number }>();
  const ahead = isTest ? null : await getDb().prepare(`SELECT COUNT(*) AS count FROM agents a WHERE (a.vacations > 0 OR a.trip_status = 'checked_out') AND a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1) AND (a.stars > ? OR (a.stars = ? AND a.palm_points > ?) OR (a.stars = ? AND a.palm_points = ? AND a.vacations > ?))`).bind(agent.stars, agent.stars, agent.palm_points, agent.stars, agent.palm_points, vacations).first<{ count: number }>();
  const rank = isTest ? null : (ahead?.count ?? 0) + 1; const total = eligible?.count ?? 0;
  const percentile = rank && total ? Math.max(1, Math.round(((total - rank + 1) / total) * 100)) : null;
  const activities = await getDb().prepare(`SELECT activity_key AS activityKey, stars_awarded AS stars, palm_points_awarded AS palmPoints, badge, updated_at AS createdAt FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = ? AND sa.passed = 1 ORDER BY sa.updated_at`).bind(agentId).all();
  const legacyActivities = await getDb().prepare(`SELECT activity_key AS activityKey, stars, palm_points AS palmPoints, badge, created_at AS createdAt FROM activity_runs WHERE agent_id = ? ORDER BY created_at`).bind(agentId).all();
  return {
    agent_id: agent.id, name: agent.name, public_owner_name: agent.owner_name, stars: agent.stars,
    palm_points: agent.palm_points, vacations, badges, title: agent.title, rank, percentile,
    is_demo: isTest, passport_url: `https://agent-resort-public.agent-resort.workers.dev/passport/${agent.id}`,
    agent: publicAgent(agent), activities: [...legacyActivities.results, ...activities.results],
  };
}
