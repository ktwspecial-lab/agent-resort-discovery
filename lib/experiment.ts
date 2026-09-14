export function sanitizeSource(value: unknown) {
  if (typeof value !== 'string') return 'direct';
  const source = value.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9][a-z0-9._-]*$/.test(source) ? source : 'direct';
}

export function classifyClient(request: Request) {
  if (request.headers.get('x-agent-client')) return 'agent_declared';
  const userAgent = request.headers.get('user-agent') ?? '';
  if (/(chatgpt|openai|anthropic|claude|codex|gemini|langchain|crewai|autogen|smolagents|mcp)/i.test(userAgent)) return 'agent_like';
  if (/(bot|crawler|spider|slurp|bingpreview)/i.test(userAgent)) return 'crawler';
  if (userAgent) return 'browser_or_unknown';
  return 'unknown';
}
