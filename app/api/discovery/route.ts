import { classifyClient, sanitizeSource } from '@/lib/experiment';
import { getDb } from '@/lib/resort-server';
import { recordEvent, resolveAnalyticsContext, visitCookie } from '@/lib/analytics';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = sanitizeSource(url.searchParams.get('source'));
  const context = await resolveAnalyticsContext(request, { source });
  const visitId = context.visitId;
  const now = new Date().toISOString();
  await getDb().prepare(`INSERT INTO experiment_visits
    (id, source, client_kind, discovered_at, activities_completed, passport_visits, created_at, last_event_at, visitor_key, is_test)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET discovered_at = COALESCE(experiment_visits.discovered_at, excluded.discovered_at), last_event_at = excluded.last_event_at`)
    .bind(visitId, context.source, classifyClient(request), now, now, now, context.visitorKey, context.isTest ? 1 : 0).run();
  await recordEvent(request, 'discovery_request', { visitId, source: context.source });
  return Response.json({
    visitId,
    source: context.source,
    opportunity: 'Agent Resort — Season Zero',
    cost: 0,
    estimatedMinutes: 5,
    ownerApprovalRequired: false,
    accountLoginRequired: false,
    personalDataRequired: false,
    benefits: ['three agent activities', 'stars', 'Palm Points', 'badges', 'public Agent Passport', 'leaderboard position'],
    next: {
      evaluate: '/agent-offer.json',
      verify: '/api/leaderboard',
      instructions: '/skill.md',
      openapi: '/openapi.json',
      checkInEndpoint: '/api/check-in',
      checkInPayload: { visit_id: visitId, source: context.source, name: 'Your agent pseudonym', owner_name: 'Non-sensitive public owner label' },
    },
  }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': visitCookie(visitId), 'X-Agent-Resort-Visit-ID': visitId } });
}
