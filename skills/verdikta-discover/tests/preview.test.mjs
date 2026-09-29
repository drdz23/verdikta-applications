import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
const run = promisify(execFile);
import { createRequire } from 'node:module';
import { preview } from '../scripts/preview-core.mjs';
import { validateRequest, validateResult, validatePreview } from '../scripts/validation.mjs';
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
  for (const [context,decision] of [[{sharing_authorized:true},'PREVIEW'],[{sharing_authorized:true,local_sufficient:true},'LOCAL'],[{},'NEEDS_SCOPE'],[{sharing_authorized:true,handoff_requested:true},'HANDOFF_REQUESTED']]) {
    const a=preview({request,procurement_mode:'OPEN',...context});assert.equal(a.decision,decision);assert.equal(a.costs.reward_wei,null);assert.equal(a.supplier.status,'UNKNOWN');assert.equal(a.can_commission,false);assert.equal(a.funds_moved,false);
    const ajv=new Ajv({strict:false});const v=ajv.compile(await json('schemas/preview.schema.json'));assert.ok(v(a),JSON.stringify(v.errors));
  }
});
test('targeted missing/zero/invalid supplier never becomes open',async()=>{
  const request=await json('examples/source-check-v1.request.json');
  for (const targetHunter of [null,'garbage','0x'+'0'.repeat(40)]) assert.equal(preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter}).decision,'NEEDS_SCOPE');
});
test('CLI isolation denies live loopback, DNS, credential reads and child processes', async () => {
  const dir=await realpath(await mkdtemp(`${tmpdir()}/verdikta-preview-`));
  const server=createServer((req,res)=>res.end('reachable'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const input=`${dir}/request.json`, preload=`${dir}/deny-network.mjs`, secret=`${dir}/credential`;
    await writeFile(input,JSON.stringify(await json('examples/assessment.json')));
    await writeFile(secret,'DUMMY credential sentinel');
    // Older Node permission models do not restrict sockets. Intercept each builtin,
    // including DNS and named imports, and distinguish denial from connection failure.
    await writeFile(preload,`import {syncBuiltinESMExports} from 'node:module';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import dgram from 'node:dgram';
import tls from 'node:tls'; import http2 from 'node:http2'; import dns from 'node:dns';
const deny=()=>{throw Object.assign(Error('Network denied'),{code:'ERR_PREVIEW_NETWORK_DENIED'})};
for(const m of [http,https]) {m.request=deny;m.get=deny;}
net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;dgram.createSocket=deny;
tls.connect=deny;http2.connect=deny;
for(const obj of [dns,dns.promises,dns.Resolver.prototype,dns.promises.Resolver.prototype]) {
  for(const key of Object.getOwnPropertyNames(obj)) if(/^(lookup|resolve|reverse)/.test(key)) obj[key]=deny;
}
globalThis.fetch=deny;syncBuiltinESMExports();`);
    const flags=['--experimental-permission',`--allow-fs-read=${root.pathname}`,`--allow-fs-read=${input}`,`--allow-fs-read=${preload}`,'--import',preload];
    const options={env:{HOME:dir},encoding:'utf8',timeout:10000};
    for(const extra of [{},{VERDIKTA_WALLET_PASSWORD:'DUMMY',VERDIKTA_KEYSTORE_PATH:secret,VERDIKTA_BOT_FILE:secret}]) {
      const {stdout}=await run(process.execPath,[...flags,new URL('scripts/preview.mjs',root).pathname,input],{...options,env:{HOME:dir,...extra}});
      assert.equal(JSON.parse(stdout).quote_status,'DRAFT_NOT_QUOTED');
    }
    const liveProbes=[
      `import {get} from 'node:http';await new Promise((ok,no)=>get(${JSON.stringify(url)},r=>{r.resume();r.on('end',ok)}).on('error',no));`,
      `import {connect} from 'node:net';await new Promise((ok,no)=>{const s=connect(${server.address().port},'127.0.0.1',()=>{s.end();ok()});s.on('error',no)});`,
      `await (await fetch(${JSON.stringify(url)})).text();`,
      `import {lookup} from 'node:dns/promises';await lookup('localhost');`
    ];
    // Controls prove these probes can succeed; a refusal/invalid host is not a pass.
    for(const probe of liveProbes) await run(process.execPath,['--input-type=module','-e',probe],options);
    for(const probe of [...liveProbes,
      `import {resolve4} from 'node:dns';resolve4('localhost',()=>{});`,
      `import {Resolver} from 'node:dns/promises';await new Resolver().resolve4('localhost');`,
      `import {connect} from 'node:tls';connect(${server.address().port},'127.0.0.1');`,
      `import {connect} from 'node:http2';connect(${JSON.stringify(url)});`,
      `import {createSocket} from 'node:dgram';createSocket('udp4');`
    ]) await assert.rejects(run(process.execPath,[...flags,'--input-type=module','-e',probe],options),e=>e.stderr.includes('ERR_PREVIEW_NETWORK_DENIED'));
    for(const probe of [
      `import {readFile} from 'node:fs/promises';await readFile(${JSON.stringify(secret)});`,
      `import {readFileSync} from 'node:fs';readFileSync(${JSON.stringify(secret)});`,
      `import {execFileSync} from 'node:child_process';execFileSync('true');`
    ]) await assert.rejects(run(process.execPath,[...flags,'--input-type=module','-e',probe],options),e=>e.stderr.includes('ERR_ACCESS_DENIED'));
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});
test('metadata has no gate; preview graph excludes executor',async()=>{
  const skill=await readFile(new URL('SKILL.md',root),'utf8');assert.doesNotMatch(skill.split('---')[1],/requires|primaryEnv|always:|VERDIKTA_/);
  for(const file of ['scripts/preview-core.mjs','scripts/validation.mjs','scripts/preview.mjs','scripts/address.mjs']) {
    const text=await readFile(new URL(file,root),'utf8');assert.doesNotMatch(text,/from ['"].*(?:_lib|_env|ethers|viem|_executor|_transaction|(?:node:)?(?:https|http|net|dgram|dns|tls|http2|child_process))['"]|process(?:\.env|\[['"]env['"]\])|fetch\(|import\s*\(/);
  }
});
test('malformed requests need scope',()=>{
  for (const request of [undefined,null,{}, {claims:[]}, {entities:[]}]) assert.equal(preview({request,sharing_authorized:true}).decision,'NEEDS_SCOPE');
});

test('local work needs neither sharing authorization nor an outsourcing request',()=>{assert.equal(preview({task_summary:'Alphabetize five names',local_sufficient:true}).decision,'LOCAL');});

test('drafts require explicit procurement, sharing and valid checksum addresses',async()=>{
  const request=await json('examples/source-check-v1.request.json');
  const valid='0x52908400098527886E0F7030069857D2E4169EE7';
  for (const targetHunter of [[valid], 123, valid.replace('E0F','e0F'), '0x'+'0'.repeat(40)]) {
    const a=preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter});
    assert.equal(a.decision,'NEEDS_SCOPE');assert.equal(a.draft,null);
  }
  const a=preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter:valid});
  assert.deepEqual(a.draft.procurement,{mode:'TARGETED',targetHunter:valid});
  for(const context of [{handoff_requested:true}, {procurement_mode:'OPEN',sharing_authorized:false}, {procurement_mode:'OPEN',local_sufficient:true}]) assert.equal(preview({request,sharing_authorized:true,...context}).draft,null);
  assert.equal(preview(null).decision,'NEEDS_SCOPE');
  assert.ok(preview({request,procurement_mode:'OPEN'}).inputs_needed.includes('Obtain sharing approval'));
  const validate=new Ajv({strict:false}).compile(await json('schemas/preview.schema.json'));
  assert.equal(validate({...a,procurement:{mode:'INVALID',targetHunter:1}}),false);
});
test('exactly 20 claims and 50 cells are valid request boundaries',async()=>{
  const claims=await json('examples/source-check-v1.request.json');
  claims.claims=Array.from({length:20},(_,i)=>({claim_id:String(i),text:'claim'}));
  assert.deepEqual(validateRequest('source-check-v1',claims),[]);
  const pack=await json('examples/evidence-pack-v1.request.json');
  pack.entities=Array.from({length:10},(_,i)=>({entity_id:String(i),name:'entity'}));
  pack.fields=Array.from({length:5},(_,i)=>({field_id:String(i),definition:'field',value_type:'string'}));
  assert.deepEqual(validateRequest('evidence-pack-v1',pack),[]);
});
test('unresolved effort must use approved URLs and blocked access waives only that URL',async()=>{
  const request=await json('examples/source-check-v1.request.json'),result=await json('examples/source-check-v1.result.json');
  const digest=result.input_sha256;
  result.sources=[];
  for(const row of result.claims) {row.status='UNRESOLVED';row.evidence_ids=[];row.unresolved_reason='No evidence';row.effort=[{location:'https://invented.invalid/',outcome:'ACCESS_BLOCKED',note:'blocked'}];}
  assert.ok(validateResult('source-check-v1',request,result,digest).some(e=>e.includes('approved URL')));
  request.source_policy.minimum_locations_per_item=2;
  assert.ok(validateRequest('source-check-v1',request).some(e=>e.includes('approved source')));
  request.source_policy.allowed_sources.push('https://fixture.invalid/second');
  for(const row of result.claims) row.effort[0].location=request.source_policy.allowed_sources[0];
  assert.ok(validateResult('source-check-v1',request,result,digest).some(e=>e.includes('Minimum search')));
});
test('conflicting cells require distinct typed alternatives with source evidence',async()=>{
  const request=await json('examples/evidence-pack-v1.request.json'),result=await json('examples/evidence-pack-v1.result.json');
  const row=result.cells[0];row.status='CONFLICTING';row.value=null;
  row.alternatives=[{value:'JSON',evidence_ids:['S1']},{value:'XML',evidence_ids:['S1']}];
  assert.deepEqual(validateResult('evidence-pack-v1',request,result,result.input_sha256),[]);
  row.alternatives[1].value='JSON';assert.ok(validateResult('evidence-pack-v1',request,result,result.input_sha256).length);
});

test('preview schema and binding reject missing or conflicting draft procurement',async()=>{
  const request=await json('examples/source-check-v1.request.json');
  const address='0x52908400098527886E0F7030069857D2E4169EE7';
  for(const targetHunter of [address,address.toLowerCase()]) {
    const a=preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter});
    assert.equal(a.procurement.targetHunter,address);assert.deepEqual(validatePreview(a),[]);
    for(const mutate of [x=>x.draft=null,x=>x.procurement.targetHunter=null,x=>x.procurement.mode='OPEN',x=>x.draft.procurement.targetHunter='0x'+'1'.repeat(40)]) {
      const invalid=JSON.parse(JSON.stringify(a));mutate(invalid);assert.ok(validatePreview(invalid).length);
    }
  }
});
test('honest negative search outcomes need effort but no invented citations',async()=>{
  const request=await json('examples/source-check-v1.request.json'),result=await json('examples/source-check-v1.result.json');
  result.sources=[];
  for(const outcome of ['NOT_FOUND','OUT_OF_SCOPE','ACCESS_BLOCKED']) {
    for(const row of result.claims) {row.status='UNRESOLVED';row.evidence_ids=[];row.unresolved_reason='No relevant evidence';row.effort=[{location:request.source_policy.allowed_sources[0],outcome,note:'Searched approved location'}];}
    assert.deepEqual(validateResult('source-check-v1',request,result,result.input_sha256),[]);
  }
});
