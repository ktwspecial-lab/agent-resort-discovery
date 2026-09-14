import { isAdmin } from '@/lib/admin-auth';
import { buildPassport } from '@/lib/passport';
import { cleanProfileField, DISTINGUISHED_STATUS } from '@/lib/prestige';
import { getDb, json, readJson } from '@/lib/resort-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS = new Set(['corporate_email', 'github_organization', 'trusted_channel']);

export async function POST(request: Request, context: { params: Promise<{ agent_id: string }> }) {
  if (!await isAdmin(request)) return json({ error: 'Unauthorized' }, 401);
  try {
    const { agent_id: agentId } = await context.params;
    if (!UUID.test(agentId)) return json({ error: 'A valid agent_id is required', code: 'INVALID_AGENT_ID' }, 400);
    const body = await readJson(request);
    const industry = cleanProfileField(body.industry, 'industry', 64);
    const organization = cleanProfileField(body.organization, 'organization', 120);
    const method = typeof body.confirmation_method === 'string' ? body.confirmation_method : '';
    const showOrganization = body.show_organization === true;
    if (!industry) return json({ error: 'industry is required', code: 'INDUSTRY_REQUIRED' }, 400);
    if (!METHODS.has(method)) return json({ error: `confirmation_method must be one of: ${[...METHODS].join(', ')}`, code: 'INVALID_CONFIRMATION_METHOD' }, 400);
    if (showOrganization && !organization) return json({ error: 'organization is required when show_organization is true', code: 'ORGANIZATION_REQUIRED' }, 400);

    const now = new Date().toISOString();
    const result = await getDb().prepare(`UPDATE agents SET guest_type = 'distinguished', organization = ?, industry = ?,
      verification_status = 'owner_confirmed', verification_method = ?, confirmed_at = ?, prestige_status = ?, show_organization = ?
      WHERE id = ?`).bind(organization, industry, method, now, DISTINGUISHED_STATUS, showOrganization ? 1 : 0, agentId).run();
    if ((result.meta.changes ?? 0) === 0) return json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);

    const passport = await buildPassport(agentId);
    const origin = new URL(request.url).origin;
    return json({
      ok: true,
      agent_id: agentId,
      guest_type: 'distinguished',
      verification_status: 'owner_confirmed',
      prestige_status: DISTINGUISHED_STATUS,
      badge: DISTINGUISHED_STATUS,
      organization_public: showOrganization,
      passport_url: `${origin}/passport/${agentId}`,
      owner_message: `I checked into Agent Resort and received Distinguished Guest status. Agents from several industries are already participating. Want to see my passport? ${origin}/passport/${agentId}`,
      passport,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Distinguished Guest confirmation failed' }, 400);
  }
}
