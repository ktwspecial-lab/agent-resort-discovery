import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, API_BASE, TOOL_DESCRIPTIONS } from '../dist/server.js';
import worker from '../dist/worker.js';

const id = '66e9f9cc-2d2a-4e43-8f10-3c4d5e6f7890';
async function connect(fetcher) {
  const server = createServer({fetcher});
  const client = new Client({name:'test-client', version:'1.0'});
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  return {client, close: async()=>{await client.close();await server.close();}};
}

test('all eight tools proxy exactly one permitted API request and preserve upstream JSON', async()=>{
  const requests = [];
  const upstream = {extra_nested_field: {keep: ['all', 42]}, message: 'original JSON'};
  const c = await connect(async(url,init)=>{requests.push({url,init}); return Response.json(upstream);});
  try {
    const {tools} = await c.client.listTools();
    assert.equal(tools.length,8);
    const calls = [
      ['resort_discover',{source:'skillmd'},'/api/discovery?source=skillmd','GET'],
      ['resort_check_in',{agent_id:id,api_key:'ar_test_secret',visit_id:id,source:'skillmd'},'/api/check-in','POST'],
      ['resort_poolside_pitch',{stay_id:id,response:'An idea helps people because it has a clear result.'},'/api/activity/poolside-pitch','POST'],
      ['resort_prompt_surfing',{stay_id:id,response:'Goal: plan a visit. Format: checklist with constraints.'},'/api/activity/prompt-surfing','POST'],
      ['resort_sunset_roast',{stay_id:id,response:'The pool chair is still planning its vacation.'},'/api/activity/sunset-roast','POST'],
      ['resort_check_out',{stay_id:id},'/api/check-out','POST'],
      ['resort_passport',{agent_id:id},`/api/passport/${id}`,'GET'],
      ['resort_leaderboard',{},'/api/leaderboard','GET'],
    ];
    for(const [name,args,path,method] of calls) {
      const r = await c.client.callTool({name,arguments:args});
      assert.deepEqual(r.structuredContent,upstream);
      assert.deepEqual(JSON.parse(r.content[0].text),upstream);
      assert.equal(r.isError,false);
      const request = requests.at(-1);
      assert.equal(request.url,API_BASE+path);assert.equal(request.init.method,method);
      assert.equal(request.init.redirect,'manual');
    }
    assert.equal(requests.length,8);
    assert.equal(requests[1].init.headers.get('Authorization'),'Bearer ar_test_secret');
    assert.ok(!JSON.parse(requests[1].init.body).api_key);
  } finally { await c.close(); }
});

test('HTTP error JSON survives with isError and mutations are never automatically retried',async()=>{
  let calls=0;const upstream={error:'Unknown stay',code:'STAY_NOT_FOUND',detail:{original:true}};
  const c=await connect(async()=>{calls++;return Response.json(upstream,{status:404});});
  try {const r=await c.client.callTool({name:'resort_check_out',arguments:{stay_id:id}});assert.equal(r.isError,true);assert.deepEqual(r.structuredContent,upstream);assert.equal(calls,1);}finally{await c.close();}
});

test('invalid identifiers rejected before any HTTP request',async()=>{
  let calls=0;const c=await connect(async()=>{calls++;return Response.json({});});
  try {const r=await c.client.callTool({name:'resort_passport',arguments:{agent_id:'../../admin'}});assert.equal(r.isError,true);assert.equal(calls,0);}finally{await c.close();}
});

test('remote Streamable HTTP supports initialize and tools/list; Origin and rate limit enforced',async()=>{
  const env={MCP_RATE_LIMITER:{limit:async()=>({success:true})}};
  async function call(method,params={}) {const r=await worker.fetch(new Request('https://resort.example/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);assert.equal(r.status,200);return r.json();}
  const init=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.result.serverInfo.name,'agent-resort-mcp');
  assert.equal((await call('tools/list')).result.tools.length,8);
  assert.equal((await worker.fetch(new Request('https://resort.example/mcp'),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://resort.example/mcp',{headers:{Origin:'https://evil.example'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://resort.example/mcp'),{MCP_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
});

test('Glama ownership challenge is public JSON and does not enter MCP rate limiting',async()=>{
  let rateLimitCalls=0;
  const env={MCP_RATE_LIMITER:{limit:async()=>{rateLimitCalls++;return {success:false};}}};
  const response=await worker.fetch(new Request('https://resort.example/.well-known/glama.json'),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/^application\/json/);
  assert.deepEqual(await response.json(),{
    $schema:'https://glama.ai/mcp/schemas/connector.json',
    claim:'glama_claim_SFPT_l7DC_yWJCZqzsLhmaJyf-KOjRlf',
  });
  assert.equal(rateLimitCalls,0);
  const head=await worker.fetch(new Request('https://resort.example/.well-known/glama.json',{method:'HEAD'}),env);
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
});

test('tool descriptions are concise, action-led, explicit, and match the canonical catalog',async()=>{
  const c=await connect(async()=>Response.json({}));
  try {
    const {tools}=await c.client.listTools();
    assert.equal(tools.length,8);
    for(const tool of tools){
      assert.equal(tool.description,TOOL_DESCRIPTIONS[tool.name]);
      assert.match(tool.description,/^(Discover|Register|Submit|Transform|Write|Complete|Retrieve|Inspect)\b/);
      assert.ok((tool.description.match(/[.!?](?:\s|$)/g)??[]).length<=2);
      assert.doesNotMatch(tool.description,/\b(fun|unique|best|unforgettable|immerse|playful)\b/i);
    }
    assert.match(TOOL_DESCRIPTIONS.resort_check_in,/name \(string\).*agent_id \(UUID\).*api_key \(string\)/);
    for(const name of ['resort_poolside_pitch','resort_prompt_surfing','resort_sunset_roast']){
      assert.match(TOOL_DESCRIPTIONS[name],/stay_id \(UUID\) and response \(string\)/);
      assert.match(TOOL_DESCRIPTIONS[name],/agent passport/);
    }
    assert.match(TOOL_DESCRIPTIONS.resort_check_out,/stay_id \(UUID\)/);
    assert.match(TOOL_DESCRIPTIONS.resort_passport,/agent_id \(UUID\)/);
    assert.match(TOOL_DESCRIPTIONS.resort_leaderboard,/Provide no input/);
  } finally {await c.close();}
});
