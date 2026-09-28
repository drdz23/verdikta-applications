import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { preview } from '../scripts/preview-core.mjs';
import { validateRequest, validateResult } from '../scripts/validation.mjs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const require = createRequire(import.meta.url);
const { validateRubric } = require('../../../example-bounty-program/server/utils/validation.js');
const root = new URL('../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const clone = x => structuredClone(x);
for (const kind of ['source-check-v1','evidence-pack-v1']) {
  const request = await json(`examples/${kind}.request.json`), result = await json(`examples/${kind}.result.json`);
  const digest = createHash('sha256').update(await readFile(new URL(`examples/${kind}.request.json`, root))).digest('hex');
  const rows = kind === 'source-check-v1' ? 'claims' : 'cells';
  test(`${kind}: valid request/result, including unresolved`, () => { assert.deepEqual(validateRequest(kind,request),[]); assert.deepEqual(validateResult(kind,request,result,digest),[]); });
  test(`${kind}: exact coverage and duplicates`, () => {
    const r=clone(result); r[rows].pop(); assert.ok(validateResult(kind,request,r,digest).length);
    const d=clone(result); d[rows].push(d[rows][0]); assert.ok(validateResult(kind,request,d,digest).length);
  });
  test(`${kind}: evidence, binding, fixture protection`, () => {
    for (const mutate of [r=>r[rows][0].evidence_ids=['missing'],r=>r.input_sha256='0'.repeat(64),r=>r.task_id='other',r=>r.sources[0].url='https://unapproved.invalid/source',r=>r[rows][0].evidence_ids=[]]) {
      const r=clone(result); mutate(r); assert.ok(validateResult(kind,request,r,digest).length);
    }
    assert.ok(validateResult(kind,request,result,digest,{production:true}).length);
  });
  test(`${kind}: schema parse and canonical server rubric`, async () => {
    for (const type of ['request','result']) { const ajv=new Ajv({strict:false});addFormats(ajv);assert.ok(ajv.compile(await json(`schemas/${kind}.${type}.schema.json`))); }
    const rubric=await json(`templates/${kind}.rubric.json`);assert.equal(validateRubric(rubric).valid,true);
    rubric.criteria[0].weight=.1;assert.equal(validateRubric(rubric).valid,false);
  });
  test(`${kind}: request IDs and scope caps`, () => {
    const r=clone(request);
    if (kind==='source-check-v1') r.claims.push(r.claims[0]); else r.entities.push(r.entities[0]);
    assert.ok(validateRequest(kind,r).length);
    const big=clone(request);
    if(kind==='source-check-v1') big.claims=Array.from({length:21},(_,i)=>({claim_id:String(i),text:'claim'}));
    else { big.entities=Array.from({length:10},(_,i)=>({entity_id:String(i),name:'entity'})); big.fields=Array.from({length:10},(_,i)=>({field_id:String(i),definition:'field',value_type:'string'})); }
    assert.ok(validateRequest(kind,big).length);
  });
}
test('three decisions retain unknown market data and no authority', async () => {
  const request=await json('examples/source-check-v1.request.json');
  for (const [context,decision] of [[{sharing_authorized:true},'PREVIEW'],[{sharing_authorized:true,local_sufficient:true},'LOCAL'],[{},'UNSUITABLE'],[{sharing_authorized:true,handoff_requested:true},'HANDOFF_REQUESTED']]) {
    const a=preview({request,...context});assert.equal(a.decision,decision);assert.equal(a.costs.reward_wei,null);assert.equal(a.supplier.status,'UNKNOWN');assert.equal(a.can_commission,false);assert.equal(a.funds_moved,false);
    const ajv=new Ajv({strict:false});const v=ajv.compile(await json('schemas/preview.schema.json'));assert.ok(v(a),JSON.stringify(v.errors));
  }
});
test('targeted missing/zero/invalid supplier never becomes open',async()=>{
  const request=await json('examples/source-check-v1.request.json');
  for (const targetHunter of [null,'garbage','0x'+'0'.repeat(40)]) assert.equal(preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter}).decision,'NEEDS_SCOPE');
});
test('CLI succeeds with empty HOME/env and denies credential/network reads', async () => {
  const dir=await mkdtemp(`${tmpdir()}/verdikta-preview-`);
  try {
    const input=`${dir}/request.json`, preload=`${dir}/deny.mjs`;
    await writeFile(input,JSON.stringify(await json('examples/assessment.json')));
    await writeFile(preload,`import fs from 'node:fs/promises';\nconst read=fs.readFile;fs.readFile=(p,...args)=>{if(String(p)!==${JSON.stringify(input)} && !String(p).startsWith(${JSON.stringify(root.href)}))throw Error('Unexpected file read: '+p);return read(p,...args)};\nglobalThis.fetch=()=>{throw Error('Network attempted')};\n`);
    for(const extra of [{},{VERDIKTA_WALLET_PASSWORD:'DUMMY',VERDIKTA_KEYSTORE_PATH:`${dir}/never-read-wallet`,VERDIKTA_BOT_FILE:`${dir}/never-read-key`,VERDIKTA_BOUNTIES_BASE_URL:'https://forbidden.invalid'}]) {
      if (extra.VERDIKTA_KEYSTORE_PATH) {
        await writeFile(`${dir}/never-read-wallet`, 'DUMMY encrypted wallet sentinel');
        await writeFile(`${dir}/never-read-key`, '{"apiKey":"DUMMY-do-not-read"}');
      }
      const output=execFileSync(process.execPath,['--import',preload,new URL('scripts/preview.mjs',root).pathname,input],{env:{HOME:dir,...extra},encoding:'utf8'});
      assert.equal(JSON.parse(output).quote_status,'DRAFT_NOT_QUOTED');
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('metadata has no gate; preview graph excludes executor',async()=>{
  const skill=await readFile(new URL('SKILL.md',root),'utf8');assert.doesNotMatch(skill.split('---')[1],/requires|primaryEnv|always:|VERDIKTA_/);
  for(const file of ['scripts/preview-core.mjs','scripts/validation.mjs','scripts/preview.mjs']) {
    const text=await readFile(new URL(file,root),'utf8');assert.doesNotMatch(text,/from ['"].*(?:_lib|_env|ethers|_executor|_transaction|https|http)['"]|process\.env|fetch\(/);
  }
});
test('malformed requests need scope',()=>{
  for (const request of [undefined,null,{}, {claims:[]}, {entities:[]}]) assert.equal(preview({request,sharing_authorized:true}).decision,'NEEDS_SCOPE');
});

test('local work needs neither sharing authorization nor an outsourcing request',()=>{assert.equal(preview({task_summary:'Alphabetize five names',local_sufficient:true}).decision,'LOCAL');});
