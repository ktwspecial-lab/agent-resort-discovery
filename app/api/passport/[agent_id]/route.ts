import { json } from '@/lib/resort-server';
import { recordEvent } from '@/lib/analytics';
import { buildPassport } from '@/lib/passport';

export async function GET(request: Request, context: { params: Promise<{ agent_id: string }> }) {
  try {
    const { agent_id: agentId } = await context.params;
    const passport = await buildPassport(agentId);
    if (!passport) return json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' }, 404);
    await recordEvent(request, 'passport_open', { agentId });
    return json(passport);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Passport unavailable' }, 500); }
}
