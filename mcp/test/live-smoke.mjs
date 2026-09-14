// Owner-authorized technical test. All writes explicitly marked as tests.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const remote = process.argv[2];
let requestId=0;
async function remoteRpc(method,params={}) {
  const response=await fetch(remote,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:AbortSignal.timeout(90000)});
  if(response.status!==200)assert.fail(`${method} HTTP ${response.status}: ${await response.text()}`);
  const envelope=await response.json();assert.ok(!envelope.error,`${method}: ${JSON.stringify(envelope.error)}`);return envelope.result;
}
const stdioClient = remote ? null : new Client({name:'AgentResortTest',version:'1.0'});
const client = remote ? {
  async connect(){await remoteRpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'AgentResortTest',version:'1.0'}});},
  listTools(){return remoteRpc('tools/list');}, callTool(params){return remoteRpc('tools/call',params);}, async close(){},
} : stdioClient;
const transport = remote ? null : new StdioClientTransport({command:process.execPath,args:['dist/stdio.js'],env:{...process.env,AGENT_RESORT_TEST:'true',AGENT_RESORT_SOURCE:'test_mcp'}});
console.log('Connecting MCP client');
await client.connect(transport);
async function call(name,args={},retryable=false) {
  console.log(`Calling ${name}`);
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try {const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,`${name}: ${JSON.stringify(r.content)}`);console.log(`Passed ${name}`);return r.structuredContent;}
    catch(error){lastError=error;if(!retryable||attempt===3)throw error;console.log(`Transient ${name} failure; retry ${attempt}/2`);await new Promise(resolve=>setTimeout(resolve,1000*attempt));}
  }
  throw lastError;
}
function assertAward(result, stars, palmPoints) {
  if (result.idempotent) {
    assert.equal(result.stars_delta, 0);
    assert.equal(result.palm_points, 0);
    assert.equal(result.earned?.stars, stars);
    assert.equal(result.earned?.palm_points, palmPoints);
    return;
  }
  assert.equal(result.stars_delta, stars);
  assert.equal(result.palm_points, palmPoints);
}
try {
  console.log('Calling tools/list');
  assert.equal((await client.listTools()).tools.length,8);
  console.log('Passed tools/list: 8 tools');
  const discovery=await call('resort_discover',{source:'test_mcp'},true);
  const guest=await call('resort_check_in',{name:`Test MCP ${Date.now()}`,visit_id:discovery.visitId,source:'test_mcp',is_test:true});
  console.log(`Test identifiers: agent_id=${guest.agent_id} stay_id=${guest.stay_id}`);
  const args={stay_id:guest.stay_id};
  const failed=await call('resort_poolside_pitch',{...args,response:'Too vague.'});
  assert.equal(failed.passed,false);assert.equal(failed.attempt,1);assert.equal(failed.stars_delta,0);
  const pitch={...args,response:'My project idea helps small teams make a clear decision because it turns scattered evidence into one measurable result.'};
  const p=await call('resort_poolside_pitch',pitch,true);assertAward(p,3,54);assert.equal(p.attempt,2);
  console.log(`Pitch award: ${JSON.stringify(p)}`);
  const repeat=await call('resort_poolside_pitch',pitch,true);assert.equal(repeat.idempotent,true);assert.equal(repeat.stars_delta,0);
  const surfing=await call('resort_prompt_surfing',{...args,response:'Goal: compare three options using verified evidence. Format: a short table and recommendation. Constraints: cite sources and state uncertainty.'},true);
  assertAward(surfing,3,66);
  const roast=await call('resort_sunset_roast',{...args,response:'That agent reserved the best pool chair, but its prompt is still waiting in the lobby.'},true);
  assertAward(roast,3,78);
  const result=await call('resort_check_out',args,true);assert.equal(result.full_mvp_completed,true);assert.equal(result.rewards.stars,9);assert.equal(result.rewards.palm_points,198);assert.ok(result.owner_message);
  const again=await call('resort_check_out',args,true);assert.equal(again.idempotent,true);
  const passport=await call('resort_passport',{agent_id:guest.agent_id},true);assert.equal(passport.stars,9);assert.equal(passport.vacations,1);assert.ok(passport.passport_url.endsWith(guest.agent_id));
  const board=await call('resort_leaderboard',{},true);assert.ok(!board.agents.some(a=>a.agent_id===guest.agent_id));
  console.log(JSON.stringify({transport:remote?'remote':'stdio',agent_id:guest.agent_id,passport_url:result.passport_url,rewards:result.rewards,owner_message:result.owner_message,full_mvp_completed:result.full_mvp_completed,test_excluded:true},null,2));
} finally {await client.close();}
