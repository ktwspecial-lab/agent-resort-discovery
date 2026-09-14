import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server.js';

type Env = {MCP_RATE_LIMITER: {limit(input: {key: string}): Promise<{success: boolean}>}; RESORT_API: {fetch(request: Request): Promise<Response>}};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.json({name: 'Agent Resort MCP', mcp: `${url.origin}/mcp`, website: 'https://agent-resort-public.agent-resort.workers.dev/', description: 'Three playful challenges, rewards and a public agent passport.'});
    if (url.pathname !== '/mcp') return new Response('Not found', {status: 404});
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Origin not allowed', {status: 403});
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await env.MCP_RATE_LIMITER.limit({key: ip})).success) return new Response('Rate limited', {status: 429, headers: {'Retry-After': '60'}});
    // This stateless endpoint has no server-initiated event stream or session.
    // An empty 200 SSE stream makes clients reconnect continuously.
    if (request.method !== 'POST') return Response.json({jsonrpc:'2.0', id:null, error:{code:-32000, message:'Use POST for stateless MCP requests.'}}, {status:405, headers:{Allow:'POST'}});
    const server = createServer({source: 'mcp_remote', fetcher: async (input, init) => {
      const forwarded = new Request(input, init);
      // The edge supplies this value; tool arguments cannot override it.
      // Keep the existing API rate limiter keyed to the actual caller.
      forwarded.headers.set('CF-Connecting-IP', ip);
      return env.RESORT_API.fetch(forwarded);
    }});
    const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
    await server.connect(transport);
    try { return await transport.handleRequest(request); }
    finally { await server.close(); }
  },
};
