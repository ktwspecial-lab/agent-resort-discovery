import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, dependencies, suffix='') {
  const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8')+suffix,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const exports={};vm.runInNewContext(outputText,{exports,require:(name)=>{
    if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }});return exports;
}
const web=compile('../../lib/resort-server.ts',{'cloudflare:workers':{env:{}}});
// Exercise the real private evaluator without changing its production visibility.
const machine=compile('../../lib/machine-resort.ts',{'cloudflare:workers':{env:{}},'@/lib/resort-server':web,'@/lib/analytics':{}},'\nexport { evaluate };');

test('successful machine activities use exactly the web scorer and canonical badges',()=>{
  const samples=[
    ['poolside_pitch','My project idea helps teams decide because it turns evidence into one clear measurable result.',54,'Cabana Closer'],
    ['prompt_surfing','Goal: compare three options with evidence. Format: a short table. Constraints: cite sources and state uncertainty.',66,'Prompt Surfer'],
    ['sunset_roast','That agent reserved the best pool chair, but its prompt is still waiting in the lobby.',78,'Golden Roaster'],
  ];
  for(const [key,text,pp,badge] of samples){const actual=machine.evaluate(key,text),expected=web.scoreActivity(key,text);assert.equal(actual.passed,true);assert.equal(actual.stars,expected.stars);assert.equal(actual.stars,3);assert.equal(actual.palmPoints,pp);assert.equal(actual.palmPoints,expected.palmPoints);assert.equal(actual.badge,badge);}
});
test('failed machine submissions earn zero and keep the original admission criteria',()=>{
  for(const [key,text] of [['poolside_pitch','Too vague'],['prompt_surfing','A long text with no goal or format fields whatsoever.'],['sunset_roast','I hate the pool agent']]){const r=machine.evaluate(key,text);assert.equal(r.passed,false);assert.equal(r.stars,0);assert.equal(r.palmPoints,0);assert.equal(r.badge,null);}
});
test('OpenAPI exposes eight valid operations and the canonical reward contract',()=>{
  const api=JSON.parse(readFileSync(new URL('../../public/openapi.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(api.paths).length,8);
  function ref(s){return s.split('/').slice(1).reduce((node,key)=>node[key],api);}
  for(const [path,entry] of Object.entries(api.paths)){const item=entry.$ref?ref(entry.$ref):entry;assert.ok(item.get||item.post,path);assert.ok((item.get||item.post).responses,path);assert.ok(!path.includes('register'));}
  assert.equal(api.components.schemas.ActivityResponse.properties.stars_delta.maximum,3);
  for(const badge of ['Cabana Closer','Prompt Surfer','Golden Roaster'])assert.ok(JSON.stringify(api).includes(badge));
});
