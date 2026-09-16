import { getDb, json } from '@/lib/resort-server';
export async function GET() {
  const events = await getDb().prepare(`SELECT e.occurred_at AS timestamp, e.event_type AS event, a.id AS agent_id, a.name
    FROM analytics_events e JOIN beacon_agents b ON b.agent_id = e.agent_id JOIN agents a ON a.id = b.agent_id
    WHERE a.public_profile = 1 AND a.is_demo = 0 AND e.is_test = 0
      AND NOT EXISTS(SELECT 1 FROM experiment_visits ev WHERE ev.agent_id = a.id AND ev.is_test = 1)
      AND e.event_type IN ('beacon_passport_issued', 'check_in', 'activity_completed', 'completed_stay')
    ORDER BY e.occurred_at DESC LIMIT 30`).all();
  return json({ events: events.results, note: 'Only public, non-test Beacon profiles. No submissions, session IDs or credentials.' });
}
