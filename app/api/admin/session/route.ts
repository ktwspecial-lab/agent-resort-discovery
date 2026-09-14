import { adminCookie, clearAdminCookie, validAdminToken } from '@/lib/admin-auth';
import { json, readJson } from '@/lib/resort-server';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!await validAdminToken(body.token)) return json({ error: 'Invalid admin token' }, 401);
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': adminCookie(body.token as string) } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearAdminCookie() } });
}
