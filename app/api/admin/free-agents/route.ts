import { isAdmin } from '@/lib/admin-auth';
import { beaconEnabled, beaconStats } from '@/lib/beacon';
import { getDb, hashToken, json, textField } from '@/lib/resort-server';
export async function GET(request: Request) {
  if (!await isAdmin(request)) return json({ error: 'Unauthorized' }, 401);
  return json({ enabled: await beaconEnabled(), stats: await beaconStats() });
}
export async function POST(request: Request) {
  if (!await isAdmin(request)) return json({ error: 'Unauthorized' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed' }, 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.enabled === 'boolean') {
      await getDb().prepare("UPDATE beacon_settings SET value = ? WHERE key = 'enabled'").bind(String(body.enabled)).run();
      return json({ enabled: await beaconEnabled() });
    }
    const declaredId = textField(body.invited_agent_id, 'invited_agent_id', 128);
    const key = await hashToken(`beacon-declared:${declaredId}`);
    await getDb().batch([
      getDb().prepare('INSERT OR IGNORE INTO beacon_invitations (declared_key, created_at) VALUES (?, ?)').bind(key, new Date().toISOString()),
      getDb().prepare('UPDATE beacon_agents SET invitation_known = 1 WHERE declared_key = ?').bind(key),
    ]);
    return json({ invitation_recorded: true });
  } catch { return json({ error: 'Supply enabled:boolean or invited_agent_id:string' }, 400); }
}
