import { env } from 'cloudflare:workers';

const COOKIE = 'ar_admin';

function readCookie(request: Request) {
  const part = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : null;
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function safeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function isAdmin(request: Request) {
  const expected = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!expected) return false;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const provided = bearer ?? readCookie(request);
  return provided ? safeEqual(provided, expected) : false;
}

export async function validAdminToken(token: unknown) {
  const expected = (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  return typeof token === 'string' && Boolean(expected) && safeEqual(token, expected!);
}

export function adminCookie(token: string) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=Strict`;
}

export function clearAdminCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}
