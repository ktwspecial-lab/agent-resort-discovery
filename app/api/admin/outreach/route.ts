import { isAdmin } from '@/lib/admin-auth';
import { getDb, json, readJson, textField } from '@/lib/resort-server';
import { sanitizeSource } from '@/lib/experiment';

const CHANNELS = new Set(['skillmd', 'github', 'ard', 'a2a', 'catalog', 'community', 'manual', 'other']);

export async function POST(request: Request) {
  if (!await isAdmin(request)) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const channel = sanitizeSource(body.channel);
    if (!CHANNELS.has(channel)) return json({ error: `channel must be one of: ${[...CHANNELS].join(', ')}` }, 400);
    const sourceTag = sanitizeSource(body.sourceTag);
    if (sourceTag === 'direct') return json({ error: 'sourceTag must be a non-direct stable tag' }, 400);
    const url = textField(body.url, 'url', 500); new URL(url);
    const placedAt = typeof body.placedAt === 'string' && !Number.isNaN(Date.parse(body.placedAt)) ? new Date(body.placedAt).toISOString() : new Date().toISOString();
    const sentCount = typeof body.sentCount === 'number' ? Math.max(1, Math.min(100000, Math.floor(body.sentCount))) : 1;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    const isTest = body.isTest === true ? 1 : 0;
    await getDb().prepare(`INSERT INTO outreach_placements (id, channel, source_tag, placed_at, url, sent_count, note, is_test, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_tag) DO UPDATE SET channel = excluded.channel, placed_at = excluded.placed_at, url = excluded.url,
      sent_count = excluded.sent_count, note = excluded.note, is_test = excluded.is_test`)
      .bind(crypto.randomUUID(), channel, sourceTag, placedAt, url, sentCount, note, isTest, new Date().toISOString()).run();
    return json({ ok: true, sourceTag }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Placement failed' }, 400); }
}
