import { env } from 'cloudflare:workers';
import { getDb } from '@/lib/resort-server';
import { classifyClient, sanitizeSource } from '@/lib/experiment';

export const EVENT_TYPES = [
  'discovery_request', 'agent_registration', 'check_in', 'activity_completed',
  'completed_stay', 'passport_open', 'leaderboard_view', 'outreach_click',
] as const;
export type EventType = typeof EVENT_TYPES[number];

type VisitRow = { id: string; source: string; visitor_key: string | null; is_test: number };
type ContextOptions = { source?: unknown; visitId?: unknown; agentId?: string | null; forceTest?: boolean };

const VISIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SOURCES = /^(test|internal_test|verification|codex|demo|smoke|technical|access-audit|indexnow-test)([._-].*)?$/;

function bounded(value: string | null, max: number) {
  return value?.trim() ? value.trim().slice(0, max) : null;
}

function cookie(request: Request, name: string) {
  const part = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

export function requestedVisitId(request: Request, bodyVisitId?: unknown) {
  const url = new URL(request.url);
  const candidates = [bodyVisitId, url.searchParams.get('visit_id'), request.headers.get('x-agent-resort-visit-id'), cookie(request, 'ar_visit')];
  return candidates.find((value): value is string => typeof value === 'string' && VISIT_ID.test(value)) ?? null;
}

export function sourceForRequest(request: Request, explicit?: unknown) {
  const url = new URL(request.url);
  if (explicit || url.searchParams.has('source')) return sanitizeSource(explicit ?? url.searchParams.get('source'));
  const referrer = request.headers.get('referer');
  if (!referrer) return 'direct';
  try { return sanitizeSource(`ref_${new URL(referrer).hostname.replace(/^www\./, '')}`); }
  catch { return 'direct'; }
}

export function isTestRequest(request: Request, source: string, force = false) {
  if (force || TEST_SOURCES.test(source)) return true;
  const url = new URL(request.url);
  if (/^(1|true|yes)$/i.test(url.searchParams.get('test') ?? '')) return true;
  if (/^(1|true|yes)$/i.test(request.headers.get('x-agent-resort-test') ?? '')) return true;
  return /\b(codex|agentresorttest|demo-agent|smoke-test)\b/i.test(request.headers.get('user-agent') ?? '');
}

async function hmac(value: string) {
  const salt = (env as unknown as { ANALYTICS_SALT?: string }).ANALYTICS_SALT;
  if (!salt) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function visitorKey(request: Request, visitId: string) {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ua = request.headers.get('user-agent') ?? '';
  return (await hmac(`${ip}\n${ua}`)) ?? `visit:${visitId}`;
}

export async function resolveAnalyticsContext(request: Request, options: ContextOptions = {}) {
  let visit: VisitRow | null = null;
  const requested = requestedVisitId(request, options.visitId);
  if (requested) {
    visit = await getDb().prepare('SELECT id, source, visitor_key, is_test FROM experiment_visits WHERE id = ?')
      .bind(requested).first<VisitRow>();
  }
  if (!visit && options.agentId) {
    visit = await getDb().prepare('SELECT id, source, visitor_key, is_test FROM experiment_visits WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(options.agentId).first<VisitRow>();
  }
  const visitId = visit?.id ?? requested ?? crypto.randomUUID();
  const source = visit?.source ?? sourceForRequest(request, options.source);
  const key = visit?.visitor_key ?? await visitorKey(request, visitId);
  const isTest = Boolean(visit?.is_test) || isTestRequest(request, source, options.forceTest);
  return {
    visitId, source, visitorKey: key, isTest,
    referrer: bounded(request.headers.get('referer'), 500),
    userAgent: bounded(request.headers.get('user-agent'), 256),
    endpoint: new URL(request.url).pathname.slice(0, 200),
    clientKind: classifyClient(request),
  };
}

export async function recordEvent(request: Request, eventType: EventType, options: ContextOptions = {}) {
  const context = await resolveAnalyticsContext(request, options);
  try {
    await getDb().prepare(`INSERT INTO analytics_events
      (id, occurred_at, event_type, visit_id, visitor_key, agent_id, source, referrer, user_agent, endpoint, is_test)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), new Date().toISOString(), eventType, context.visitId, context.visitorKey,
        options.agentId ?? null, context.source, context.referrer, context.userAgent, context.endpoint, context.isTest ? 1 : 0,
      ).run();
  } catch (error) {
    console.error('analytics_write_failed', { eventType, endpoint: context.endpoint, error: error instanceof Error ? error.message : String(error) });
  }
  return context;
}

export function visitCookie(visitId: string) {
  return `ar_visit=${encodeURIComponent(visitId)}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`;
}
