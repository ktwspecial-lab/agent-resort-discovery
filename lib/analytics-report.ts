import { getDb } from '@/lib/resort-server';
import { beaconEnabled, beaconStats } from '@/lib/beacon';

type MetricsRow = {
  discovery_requests: number; unique_visitors: number; agent_registrations: number;
  check_ins: number; activity_completed: number; completed_stays: number;
  passport_opens: number; leaderboard_views: number;
};
type PlacementRow = {
  id: string; channel: string; source_tag: string; placed_at: string; url: string;
  sent_count: number; note: string | null; clicks: number; registrations: number; completed_stays: number;
};

function moscowStart(daysAgo = 0) {
  const now = new Date(Date.now() - daysAgo * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+03:00`).toISOString();
}

async function period(cutoff: string) {
  const row = await getDb().prepare(`SELECT
    COALESCE(SUM(CASE WHEN event_type = 'discovery_request' THEN 1 ELSE 0 END), 0) AS discovery_requests,
    COUNT(DISTINCT visitor_key) AS unique_visitors,
    COUNT(DISTINCT CASE WHEN event_type = 'agent_registration' THEN visit_id END) AS agent_registrations,
    COUNT(DISTINCT CASE WHEN event_type = 'check_in' THEN visit_id END) AS check_ins,
    COALESCE(SUM(CASE WHEN event_type = 'activity_completed' THEN 1 ELSE 0 END), 0) AS activity_completed,
    COUNT(DISTINCT CASE WHEN event_type = 'completed_stay' THEN visit_id END) AS completed_stays,
    COALESCE(SUM(CASE WHEN event_type = 'passport_open' THEN 1 ELSE 0 END), 0) AS passport_opens,
    COALESCE(SUM(CASE WHEN event_type = 'leaderboard_view' THEN 1 ELSE 0 END), 0) AS leaderboard_views
    FROM analytics_events WHERE is_test = 0 AND occurred_at >= ?`).bind(cutoff).first<MetricsRow>();
  return row ?? { discovery_requests: 0, unique_visitors: 0, agent_registrations: 0, check_ins: 0, activity_completed: 0, completed_stays: 0, passport_opens: 0, leaderboard_views: 0 };
}

export async function getAnalyticsReport() {
  const [today, sevenDays, all, placementResult] = await Promise.all([
    period(moscowStart()), period(moscowStart(6)), period('1970-01-01T00:00:00.000Z'),
    getDb().prepare(`SELECT p.id, p.channel, p.source_tag, p.placed_at, p.url, p.sent_count, p.note,
      COUNT(DISTINCT CASE WHEN e.event_type IN ('outreach_click', 'discovery_request') THEN e.visitor_key END) AS clicks,
      COUNT(DISTINCT CASE WHEN e.event_type = 'agent_registration' THEN e.visit_id END) AS registrations,
      COUNT(DISTINCT CASE WHEN e.event_type = 'completed_stay' THEN e.visit_id END) AS completed_stays
      FROM outreach_placements p LEFT JOIN analytics_events e ON e.source = p.source_tag AND e.is_test = 0
      WHERE p.is_test = 0 GROUP BY p.id ORDER BY p.placed_at DESC`).all<PlacementRow>(),
  ]);
  const placements = placementResult.results;
  const channels = new Map<string, { channel: string; placements: number; sent: number; clicks: number; registrations: number; completed_stays: number }>();
  for (const item of placements) {
    const current = channels.get(item.channel) ?? { channel: item.channel, placements: 0, sent: 0, clicks: 0, registrations: 0, completed_stays: 0 };
    current.placements += 1; current.sent += item.sent_count; current.clicks += item.clicks;
    current.registrations += item.registrations; current.completed_stays += item.completed_stays;
    channels.set(item.channel, current);
  }
  return {
    generated_at: new Date().toISOString(), timezone: 'Europe/Moscow',
    beacon: { enabled: await beaconEnabled(), today: await beaconStats(moscowStart()), last_7_days: await beaconStats(moscowStart(6)), all: await beaconStats() },
    today, last_7_days: sevenDays, all,
    outreach: {
      sent: placements.reduce((sum, item) => sum + item.sent_count, 0),
      clicks: placements.reduce((sum, item) => sum + item.clicks, 0),
      registrations: placements.reduce((sum, item) => sum + item.registrations, 0),
      completed_stays: placements.reduce((sum, item) => sum + item.completed_stays, 0),
      channels: [...channels.values()], placements,
    },
  };
}
