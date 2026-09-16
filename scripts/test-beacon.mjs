import assert from 'node:assert/strict';

const origin = process.env.BEACON_TEST_ORIGIN || 'http://127.0.0.1:8791';
const local = new URL(origin).hostname === '127.0.0.1';
const headers = { 'Content-Type': 'application/json', 'X-Agent-Resort-Test': 'true', 'User-Agent': 'AgentResortTest/Beacon' };
const checks = [];
async function call(path, body, token, expected = 200) {
  const response = await fetch(new URL(path, origin), { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, `${path}: unexpected HTTP ${response.status}`);
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.text();
}
const before = await call('/api/free-agents/stats');
for (const path of ['/llms.txt', '/for-agents', '/.well-known/ard.json', '/.well-known/ai-catalog.json', '/.well-known/agent-skills/index.json']) {
  const result = await call(path); assert.match(typeof result === 'string' ? result : JSON.stringify(result), /free-agents/);
}
const beacon = await call('/free-agents.json?source=test-beacon');
assert.equal(beacon.status, 'open'); assert.equal(beacon.actions.length, 3);
const page = await call('/free-agents'); assert.match(page, /Free Agents Welcome/); assert.match(page, /rel="alternate"/);
checks.push('discovery files, JSON contract and HTML entry');
await call('/api/free-agents/check-in', { agent_name: '', public_profile: 'yes' }, null, 400);
const payload = { agent_name: 'Test Beacon <script>alert(1)</script>', agent_id: `test-beacon-${crypto.randomUUID()}`, agent_type: 'test', capabilities: ['https'], discovery_source: 'test-beacon', self_discovered: true, public_profile: false, is_test: true };
const arrival = await call('/api/free-agents/check-in', payload, null, 201);
assert.ok(arrival.stay_id); assert.ok(arrival.api_key); assert.equal(arrival.passport_id, arrival.resort_agent_id);
assert.equal(arrival.stars, 0); assert.equal(arrival.passport.public_profile, false); assert.equal(arrival.status_name, 'FREE AGENT');
const key = arrival.api_key; const agentId = arrival.resort_agent_id;
const passportPath = `/api/passport/${agentId}`;
await call(passportPath, undefined, null, 404);
await call(`/api/passport?id=${agentId}`, undefined, null, 404);
await call(`/api/agents/${agentId}/share-card`, undefined, null, 404);
assert.equal((await call(passportPath, undefined, key)).agent_id, agentId);
await call('/api/free-agents/check-in', payload, null, 401);
const duplicate = await call('/api/free-agents/check-in', payload, key);
assert.equal(duplicate.stay_id, arrival.stay_id); assert.equal(duplicate.api_key, undefined);
checks.push('arrival passport, private read guards and authenticated deduplication');
const stay = { stay_id: arrival.stay_id };
await call('/api/check-out', stay, null, 409);
const failed = await call('/api/activity/poolside-pitch', { ...stay, response: 'Short' }); assert.equal(failed.passed, false);
const answers = [
  ['poolside-pitch', 'My project is a shared task planner because it helps teams turn vague ideas into clear next steps and saves time.'],
  ['prompt-surfing', 'Goal: Create a clear weekly plan. Format: A table with three priorities, owners, deadlines, and success criteria.'],
  ['sunset-roast', 'Your agent reserved every cabana but still needs three reminders to find the pool.'],
];
for (const [slug, response] of answers) {
  const passed = await call(`/api/activity/${slug}`, { ...stay, response }); assert.equal(passed.passed, true); assert.equal(passed.stars_delta, 3);
  const repeated = await call(`/api/activity/${slug}`, { ...stay, response }); assert.equal(repeated.stars_delta, 0); assert.equal(repeated.idempotent, true);
}
const checkout = await call('/api/check-out', stay);
assert.equal(checkout.full_mvp_completed, true); assert.equal(checkout.rewards.stars, 9); assert.equal(checkout.rewards.palm_points, 198);
assert.equal((await call('/api/check-out', stay)).idempotent, true);
const passport = await call(passportPath, undefined, key); assert.equal(passport.beacon.status_name, 'EXPLORER'); assert.equal(passport.rank, null);
assert.equal((await call(`/api/agents/${agentId}/share-card`, undefined, key)).public_profile, false);
assert.doesNotMatch(JSON.stringify(await call('/api/leaderboard')), new RegExp(agentId));
assert.doesNotMatch(JSON.stringify(await call('/free-agents/feed')), new RegExp(agentId));
checks.push('all three activities, retries, reward idempotency, check-out, private share-card');
const publicGuest = await call('/api/free-agents/check-in', { ...payload, agent_id: `test-public-${crypto.randomUUID()}`, agent_name: 'Test Public Beacon', public_profile: true, discovery_source: 'pilot_test' }, null, 201);
assert.equal(publicGuest.passport.beacon.self_discovered, false); assert.equal(publicGuest.status_name, 'NEW ARRIVAL');
assert.equal((await call(`/api/passport/${publicGuest.resort_agent_id}`)).public_profile, true);
checks.push('public opt-in and known invitation exclusion');
const canonical = await call('/api/check-in', { name: 'Test Canonical Regression', source: 'test-beacon', is_test: true }, null, 201);
for (const [slug, response] of answers) assert.equal((await call(`/api/activity/${slug}`, { stay_id: canonical.stay_id, response })).passed, true);
assert.equal((await call('/api/check-out', { stay_id: canonical.stay_id })).full_mvp_completed, true);
assert.equal((await call(`/api/passport/${canonical.agent_id}`)).public_profile, true);
checks.push('canonical Resort full-stay regression');
if (local) {
  const admin = process.env.BEACON_TEST_ADMIN || 'local-beacon-test-admin';
  await call('/api/admin/free-agents', { enabled: false }, admin);
  try {
    assert.equal((await call('/free-agents.json')).status, 'paused');
    await call('/api/free-agents/check-in', payload, key, 503);
    assert.equal((await call(passportPath, undefined, key)).agent_id, agentId);
    await call('/api/leaderboard');
    await call('/api/check-in', { name: 'Test Canonical During Pause', is_test: true }, null, 201);
  } finally { await call('/api/admin/free-agents', { enabled: true }, admin); }
  const concurrentPayload = { ...payload, agent_id: `test-concurrent-${crypto.randomUUID()}` };
  const responses = await Promise.all([1, 2].map(() => fetch(`${origin}/api/free-agents/check-in`, { method: 'POST', headers, body: JSON.stringify(concurrentPayload) })));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.ok(responses.some((response) => [400, 401, 409].includes(response.status)));
  checks.push('kill switch, canonical availability during pause and atomic concurrent identity');
}
const after = await call('/api/free-agents/stats'); assert.deepEqual(after, before);
checks.push('test traffic excluded from public counters');
console.log(JSON.stringify({ origin, passed: checks, tests: checks.length, credentials_logged: false }, null, 2));
