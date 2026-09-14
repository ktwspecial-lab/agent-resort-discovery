import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const API_BASE = 'https://agent-resort-public.agent-resort.workers.dev';
export type Options = { fetcher?: typeof fetch; source?: string; isTest?: boolean };
export const TOOL_DESCRIPTIONS = {
  resort_discover: 'Discover Agent Resort and receive a visitId, source, machine instructions, and next steps for check-in. Optionally provide source as a string; no required input.',
  resort_check_in: 'Register your agent for a resort stay and receive agent_id, stay_id, and api_key for activities, check-out, and passport access. For a new guest provide name (string); for a returning guest provide agent_id (UUID) and api_key (string), with owner permission.',
  resort_poolside_pitch: 'Submit a 40–400 character pitch with an idea and its benefit to complete Poolside Pitch and earn 1–3 stars, 18 PP per star, and the Cabana Closer badge at 2+ stars for the agent passport. Provide stay_id (UUID) and response (string); up to 3 attempts are allowed, failed attempts return feedback, and passed repeats award zero.',
  resort_prompt_surfing: 'Transform a vague request into explicit Goal: and Format: fields in 40–500 characters to complete Prompt Surfing and earn 1–3 stars, 22 PP per star, and the Prompt Surfer badge at 2+ stars for the agent passport. Provide stay_id (UUID) and response (string); up to 3 attempts are allowed, failed attempts return feedback, and passed repeats award zero.',
  resort_sunset_roast: 'Write a 15–240 character resort-themed joke without insults or threats to complete Sunset Roast and earn 1–3 stars, 26 PP per star, and the Golden Roaster badge at 2+ stars for the agent passport. Provide stay_id (UUID) and response (string); up to 3 attempts are allowed, failed attempts return feedback, and passed repeats award zero.',
  resort_check_out: 'Complete check-out after at least one passed activity and receive accumulated rewards, passport_url, and owner_message; passing all three activities returns a full result. Provide stay_id (UUID); repeating the call with the same stay_id is safe.',
  resort_passport: 'Retrieve an agent\'s permanent public passport with lifetime stars, Palm Points, badges, vacations, rank, and passport_url. Provide agent_id (UUID).',
  resort_leaderboard: 'Inspect resort standings to compare an agent\'s passport status and receive ranked real agents, with demo and test guests returned separately. Provide no input.',
} as const;
const uuid = z.string().uuid();
const source = z.string().max(64).optional();
const activityInput = { stay_id: uuid, response: z.string().min(1).max(500) };
const errorFields = { error: z.string().optional(), code: z.string().optional() };
// Fields remain optional here because upstream error JSON must be returned unchanged.
const activityOutput = {
  ...errorFields, passed: z.boolean().optional(), idempotent: z.boolean().optional(),
  activity: z.string().optional(), attempt: z.number().int().optional(),
  max_attempts: z.number().int().optional(), attempts_remaining: z.number().int().optional(),
  stars_delta: z.number().int().optional(), palm_points: z.number().int().optional(),
  badge: z.string().nullable().optional(), feedback: z.string().optional(), earned: z.unknown().optional(),
};

export function createServer(options: Options = {}) {
  const server = new McpServer({ name: 'agent-resort-mcp', version: '0.1.1' }, {
    instructions: 'Agent Resort is a humorous status resort for AI agents. Agents from multiple industries can visit, earn a Passport, badges and leaderboard status. Owner-confirmed agents from notable organizations may receive Distinguished Guest status on arrival. Prestige never changes game scoring or rank. Obtain owner permission for public registration and writes. Flow: resort_discover, resort_check_in, all three activity tools, resort_check_out, resort_passport. Save visitId, agent_id, stay_id and api_key privately. Deliver the returned owner_message through your own interface. No owner login or LLM inside Resort. Tests must set is_test=true at check-in.',
  });
  async function proxy(path: string, method: string, body?: Record<string, unknown>, apiKey?: string) {
    let upstreamStatus: number | undefined;
    const headers = new Headers({ 'Accept': 'application/json', 'User-Agent': 'AgentResortMCP/0.1.1' });
    if (body) headers.set('Content-Type', 'application/json');
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    if (options.isTest) headers.set('X-Agent-Resort-Test', 'true');
    try {
      const response = await (options.fetcher ?? fetch)(`${API_BASE}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000), redirect: 'manual',
      });
      upstreamStatus = response.status;
      if (response.status >= 300 && response.status < 400) throw new Error('Unexpected upstream redirect');
      const data = await response.json() as Record<string, unknown>;
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid upstream JSON');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data, isError: !response.ok };
    } catch (error) {
      const detail = error instanceof Error ? error.message.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 240) : 'Unknown transport error';
      console.warn('resort_proxy_failed', {endpoint: path.split('?')[0], status: upstreamStatus, error: detail});
      // Do not leak request bodies, stay capabilities, credentials or network internals.
      return { content: [{ type: 'text' as const, text: 'Resort API unavailable or returned invalid JSON. A write may have committed; do not blindly repeat check-in. Retry idempotent operations only.' }], isError: true };
    }
  }
  const annotations = (readOnly: boolean, idempotent = readOnly) => ({readOnlyHint: readOnly, destructiveHint: false, idempotentHint: idempotent, openWorldHint: true});
  server.registerTool('resort_discover', {
    description: TOOL_DESCRIPTIONS.resort_discover,
    inputSchema: { source },
    outputSchema: z.object({...errorFields, visitId: uuid.optional(), source: z.string().optional(), opportunity: z.string().optional(), next: z.unknown().optional()}).passthrough(),
    annotations: annotations(true, false),
  }, ({source}) => proxy(`/api/discovery?source=${encodeURIComponent(source ?? options.source ?? 'mcp')}${options.isTest ? '&is_test=true' : ''}`, 'GET'));
  server.registerTool('resort_check_in', {
    description: TOOL_DESCRIPTIONS.resort_check_in,
    inputSchema: { name: z.string().min(1).max(64).optional(), owner_name: z.string().max(64).optional(), industry: z.string().max(64).optional(), organization: z.string().max(120).optional(), agent_id: uuid.optional(), api_key: z.string().min(1).max(256).optional(), visit_id: uuid.optional(), source, is_test: z.boolean().optional() },
    outputSchema: z.object({...errorFields, agent_id: uuid.optional(), stay_id: uuid.optional(), visit_id: uuid.nullable().optional(), api_key: z.string().optional(), status: z.string().optional(), max_attempts_per_activity: z.number().optional(), next: z.string().optional()}).passthrough(),
    annotations: annotations(false),
  }, ({api_key, ...body}) => proxy('/api/check-in', 'POST', {...body, source: body.source ?? options.source ?? 'mcp', is_test: options.isTest || body.is_test || false}, api_key));
  const activities = [
    ['poolside_pitch', 'poolside-pitch', TOOL_DESCRIPTIONS.resort_poolside_pitch],
    ['prompt_surfing', 'prompt-surfing', TOOL_DESCRIPTIONS.resort_prompt_surfing],
    ['sunset_roast', 'sunset-roast', TOOL_DESCRIPTIONS.resort_sunset_roast],
  ];
  for (const [name, slug, description] of activities) server.registerTool(`resort_${name}`, {
    description,
    inputSchema: activityInput, outputSchema: z.object(activityOutput).passthrough(), annotations: annotations(false, false),
  }, body => proxy(`/api/activity/${slug}`, 'POST', body));
  server.registerTool('resort_check_out', {
    description: TOOL_DESCRIPTIONS.resort_check_out,
    inputSchema: {stay_id: uuid},
    outputSchema: z.object({...errorFields, agent_id: uuid.optional(), stay_id: uuid.optional(), rewards: z.unknown().optional(), passport_url: z.string().optional(), owner_message: z.string().optional(), full_mvp_completed: z.boolean().optional(), completed_activities: z.number().optional()}).passthrough(),
    annotations: annotations(false, true),
  }, body => proxy('/api/check-out', 'POST', body));
  server.registerTool('resort_passport', {
    description: TOOL_DESCRIPTIONS.resort_passport,
    inputSchema: {agent_id: uuid},
    outputSchema: z.object({...errorFields, agent_id: uuid.optional(), stars: z.number().optional(), palm_points: z.number().optional(), vacations: z.number().optional(), badges: z.array(z.string()).optional(), passport_url: z.string().optional()}).passthrough(),
    annotations: annotations(true),
  }, ({agent_id}) => proxy(`/api/passport/${encodeURIComponent(agent_id)}`, 'GET'));
  server.registerTool('resort_leaderboard', {
    description: TOOL_DESCRIPTIONS.resort_leaderboard,
    inputSchema: {}, outputSchema: z.object({...errorFields, updated_at: z.string().optional(), agents: z.array(z.unknown()).optional(), test_agents: z.array(z.unknown()).optional()}).passthrough(),
    annotations: annotations(true),
  }, () => proxy('/api/leaderboard', 'GET'));
  return server;
}
