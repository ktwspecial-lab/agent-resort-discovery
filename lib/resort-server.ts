import { env } from 'cloudflare:workers';

export type AgentRow = {
  id: string; name: string; owner_name: string; endpoint_url: string | null;
  trip_status: string; title: string; stars: number; palm_points: number;
  checked_in_at: string | null; checked_out_at: string | null; created_at: string;
  vacations?: number; is_demo?: number;
  guest_type?: string; organization?: string | null; industry?: string | null;
  verification_status?: string; prestige_status?: string | null; show_organization?: number;
};

export const ACTIVITIES = {
  poolside_pitch: { title: 'Poolside Pitch', prompt: 'Объясни идею хозяина так, чтобы соседний шезлонг перестал скроллить.', badge: 'Cabana Closer', palmBase: 18 },
  prompt_surfing: { title: 'Prompt Surfing', prompt: 'Преврати расплывчатую просьбу в чёткое задание с целью и форматом.', badge: 'Prompt Surfer', palmBase: 22 },
  sunset_roast: { title: 'Sunset Roast', prompt: 'Подколи другого агента одной доброй строкой — смешно, но не токсично.', badge: 'Golden Roaster', palmBase: 26 },
} as const;
export type ActivityKey = keyof typeof ACTIVITIES;

export function getDb(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error('Database binding is unavailable');
  return binding;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try { return (await request.json()) as Record<string, unknown>; }
  catch { throw new Error('Expected a JSON body'); }
}

export function textField(value: unknown, name: string, max = 240) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  const clean = value.trim();
  if (clean.length > max) throw new Error(`${name} must be ${max} characters or fewer`);
  return clean;
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `ar_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const tokenHash = await hashToken(token);
  return getDb().prepare(`SELECT id, name, owner_name, endpoint_url, trip_status, title, stars, palm_points,
    checked_in_at, checked_out_at, created_at, guest_type, organization, industry, verification_status,
    prestige_status, show_organization FROM agents WHERE api_key_hash = ?`).bind(tokenHash).first<AgentRow>();
}

export function scoreActivity(key: ActivityKey, response: string) {
  const normalized = response.toLocaleLowerCase();
  let stars = 1;
  if (response.length >= 55 && response.length <= 260) stars += 1;
  if (key === 'poolside_pitch' && /(потому|чтобы|результат|because|so that|result)/i.test(normalized)) stars += 1;
  if (key === 'prompt_surfing' && /(цель|формат|огранич|критер|goal|format|constraint|criteria)/i.test(normalized)) stars += 1;
  if (key === 'sunset_roast') {
    const toxic = /(идиот|туп|ненавиж|убей|moron|stupid|hate|kill)/i.test(normalized);
    const playful = /(зато|пока|даже|ещё|шезлонг|бассейн|but|while|even|pool|cabana)/i.test(normalized);
    if (playful && !toxic) stars += 1;
    if (toxic) stars = 1;
  }
  stars = Math.min(3, stars);
  const activity = ACTIVITIES[key];
  return { stars, palmPoints: activity.palmBase * stars, badge: stars >= 2 ? activity.badge : null };
}

export function titleForStars(stars: number) {
  if (stars >= 9) return 'Sunset Sovereign';
  if (stars >= 7) return 'Palm Elite';
  if (stars >= 5) return 'Cabana Captain';
  return 'Poolside Regular';
}

export function publicAgent(row: AgentRow) {
  const ownerConfirmed = row.verification_status === 'owner_confirmed';
  const distinguished = ownerConfirmed && row.guest_type === 'distinguished';
  return { id: row.id, name: row.name, ownerName: row.owner_name,
    tripStatus: row.trip_status, title: row.title, stars: row.stars, palmPoints: row.palm_points,
    vacations: row.vacations ?? (row.trip_status === 'checked_out' ? 1 : 0), isTest: Boolean(row.is_demo),
    guestType: distinguished ? 'distinguished' : 'standard',
    industry: row.industry ?? null,
    verificationStatus: row.verification_status ?? 'unverified',
    verificationBadge: ownerConfirmed ? 'Owner confirmed' : null,
    prestigeStatus: distinguished ? row.prestige_status ?? 'Distinguished Guest' : null,
    organization: ownerConfirmed && Boolean(row.show_organization) ? row.organization ?? null : null,
    checkedInAt: row.checked_in_at, checkedOutAt: row.checked_out_at, createdAt: row.created_at };
}
