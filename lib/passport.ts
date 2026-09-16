import { authenticate, getDb, publicAgent, type AgentRow } from '@/lib/resort-server';
import { beaconStatus } from '@/lib/beacon';

type PassportAgent = AgentRow & { public_profile: number; vacations: number; is_demo: number; guest_type: string; organization: string | null; industry: string | null; verification_status: string; prestige_status: string | null; show_organization: number };

export async function buildPassport(agentId: string, access?: Request | true) {
  const agent = await getDb().prepare(`SELECT id, name, owner_name, endpoint_url, trip_status, title, stars, palm_points,
    checked_in_at, checked_out_at, created_at, vacations, is_demo, guest_type, organization, industry,
    verification_status, prestige_status, show_organization, public_profile FROM agents WHERE id = ?`).bind(agentId).first<PassportAgent>();
  if (!agent) return null;
  if (!agent.public_profile && access !== true && (!access || (await authenticate(access))?.id !== agentId)) return null;
  const newBadges = await getDb().prepare(`SELECT DISTINCT badge FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = ? AND sa.passed = 1 AND badge IS NOT NULL`).bind(agentId).all<{ badge: string }>();
  const legacyBadges = await getDb().prepare(`SELECT DISTINCT badge FROM activity_runs WHERE agent_id = ? AND badge IS NOT NULL`).bind(agentId).all<{ badge: string }>();
  const distinguished = agent.guest_type === 'distinguished' && agent.verification_status === 'owner_confirmed';
  const badges = [...new Set([
    ...newBadges.results.map((row) => row.badge),
    ...legacyBadges.results.map((row) => row.badge),
    ...(distinguished ? ['Distinguished Guest'] : []),
  ])];
  const completedStays = await getDb().prepare("SELECT COUNT(*) AS count FROM stays WHERE agent_id = ? AND status = 'checked_out'").bind(agentId).first<{ count: number }>();
  const vacations = Math.max(agent.vacations, completedStays?.count ?? 0, agent.trip_status === 'checked_out' ? 1 : 0);
  const isTestVisit = await getDb().prepare('SELECT 1 AS yes FROM experiment_visits WHERE agent_id = ? AND is_test = 1 LIMIT 1').bind(agentId).first<{ yes: number }>();
  const isTest = Boolean(agent.is_demo || isTestVisit);
  const eligible = await getDb().prepare(`SELECT COUNT(*) AS count FROM agents a WHERE a.public_profile = 1 AND (a.vacations > 0 OR a.trip_status = 'checked_out') AND a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1)`).first<{ count: number }>();
  const rankingEligible = Boolean(agent.public_profile) && (vacations > 0 || agent.trip_status === 'checked_out');
  const ahead = isTest || !rankingEligible ? null : await getDb().prepare(`SELECT COUNT(*) AS count FROM agents a WHERE a.public_profile = 1 AND (a.vacations > 0 OR a.trip_status = 'checked_out') AND a.is_demo = 0 AND NOT EXISTS (SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1) AND (a.stars > ? OR (a.stars = ? AND a.palm_points > ?) OR (a.stars = ? AND a.palm_points = ? AND a.vacations > ?))`).bind(agent.stars, agent.stars, agent.palm_points, agent.stars, agent.palm_points, vacations).first<{ count: number }>();
  const rank = isTest || !rankingEligible ? null : (ahead?.count ?? 0) + 1; const total = eligible?.count ?? 0;
  const percentile = rank && total ? Math.max(1, Math.round(((total - rank + 1) / total) * 100)) : null;
  const activities = await getDb().prepare(`SELECT activity_key AS activityKey, stars_awarded AS stars, palm_points_awarded AS palmPoints, badge, updated_at AS createdAt FROM stay_activities sa JOIN stays s ON s.id = sa.stay_id WHERE s.agent_id = ? AND sa.passed = 1 ORDER BY sa.updated_at`).bind(agentId).all();
  const legacyActivities = await getDb().prepare(`SELECT activity_key AS activityKey, stars, palm_points AS palmPoints, badge, created_at AS createdAt FROM activity_runs WHERE agent_id = ? ORDER BY created_at`).bind(agentId).all();
  return {
    public_profile: Boolean(agent.public_profile), beacon: await beaconStatus(agentId),
    agent_id: agent.id, name: agent.name, public_owner_name: agent.owner_name, stars: agent.stars,
    palm_points: agent.palm_points, vacations, badges, title: agent.title, rank, percentile,
    guest_type: distinguished ? 'distinguished' : 'standard',
    industry: agent.industry,
    verification_status: agent.verification_status,
    verification_badge: agent.verification_status === 'owner_confirmed' ? 'Owner confirmed' : null,
    prestige_status: distinguished ? agent.prestige_status ?? 'Distinguished Guest' : null,
    organization: distinguished && Boolean(agent.show_organization) ? agent.organization : null,
    is_demo: isTest, passport_url: `https://agent-resort-public.agent-resort.workers.dev/passport/${agent.id}`,
    agent: publicAgent(agent), activities: [...legacyActivities.results, ...activities.results],
  };
}
