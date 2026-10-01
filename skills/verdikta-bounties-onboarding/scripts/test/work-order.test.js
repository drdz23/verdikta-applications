import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { preview } from '../../../verdikta-discover/scripts/preview-core.mjs';
import { applyWorkOrder } from '../_work-order.js';
test('local draft handoff binds request, rubric, threshold and targeted supplier', async()=>{
  const dir=await mkdtemp(`${tmpdir()}/verdikta-handoff-`);
  try {
    const request=JSON.parse(await readFile(new URL('../../../verdikta-discover/examples/source-check-v1.request.json',import.meta.url),'utf8'));
    request.fixture_only=false;request.task_id='non-fixture-shape-test';
    const target='0x1111111111111111111111111111111111111111';
    const a=preview({request,sharing_authorized:true,procurement_mode:'TARGETED',targetHunter:target});
    const file=`${dir}/draft.json`;await writeFile(file,JSON.stringify(a));
    const config={workOrderDraftSha256:createHash('sha256').update(JSON.stringify(a)).digest('hex'),workOrderDraft:file,description:'Test only',rubricJson:a.draft.rubric,threshold:a.draft.threshold,procurementMode:'TARGETED',targetHunter:target};
    const bound=await applyWorkOrder(config);assert.match(bound.description,/result.input_sha256/);assert.match(bound.workOrderDraftSha256,/^[0-9a-f]{64}$/);
    await assert.rejects(applyWorkOrder({...config,threshold:10}));
    await assert.rejects(applyWorkOrder({...config,procurementMode:'OPEN'}));
    await assert.rejects(applyWorkOrder({...config,workOrderDraftSha256:undefined}));
    const open=preview({request,sharing_authorized:true,procurement_mode:'OPEN'});
    await writeFile(file,JSON.stringify(open));
    const openConfig={...config,procurementMode:'OPEN',targetHunter:null,workOrderDraftSha256:createHash('sha256').update(JSON.stringify(open)).digest('hex')};
    await applyWorkOrder(openConfig);
    await assert.rejects(applyWorkOrder({...openConfig,procurementMode:'TARGETED',targetHunter:target}));
    open.draft.procurement.mode='UNSELECTED';open.decision='PREVIEW';await writeFile(file,JSON.stringify(open));
    await assert.rejects(applyWorkOrder({...openConfig,workOrderDraftSha256:createHash('sha256').update(JSON.stringify(open)).digest('hex')}),/fresh scoped preview/);
    a.draft.request.fixture_only=true;await writeFile(file,JSON.stringify(a));await assert.rejects(applyWorkOrder(config));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('a hybrid draft binds like any other and local findings never reach the commissioned description',async()=>{
  const dir=await mkdtemp(`${tmpdir()}/verdikta-hybrid-`);
  try {
    const request=JSON.parse(await readFile(new URL('../../../verdikta-discover/examples/source-check-v1.request.json',import.meta.url),'utf8'));
    request.fixture_only=false;request.task_id='hybrid-residual';request.claims=request.claims.filter(c=>c.claim_id==='C3');
    const local_summary={mode:'RESIDUAL',independent:false,performed_by:'AGENT',original_task_id:'fixture-source-check-001',original_item_count:3,method:'Read the approved page.',limitations:'Not independent.',
      resolved:[{item_id:'C1',verdict:'SUPPORTED',value:null,source_url:'https://docs.example/a',basis:'LOCAL-BASIS-MARKER one'},{item_id:'C2',verdict:'CONTRADICTED',value:null,source_url:'https://docs.example/a',basis:'LOCAL-BASIS-MARKER two'}],
      residual:[{item_id:'C3',reason:'UNRESOLVED_ABSENT',note:'LOCAL-NOTE-MARKER'}]};
    const a=preview({request,sharing_authorized:true,procurement_mode:'OPEN',local_summary});
    assert.equal(a.decision,'PREVIEW');assert.deepEqual(a.local_summary,local_summary);
    const file=`${dir}/draft.json`,raw=JSON.stringify(a);await writeFile(file,raw);
    const config={workOrderDraftSha256:createHash('sha256').update(raw).digest('hex'),workOrderDraft:file,description:'Hybrid test',rubricJson:a.draft.rubric,threshold:a.draft.threshold,procurementMode:'OPEN',targetHunter:null};
    const bound=await applyWorkOrder(config);
    assert.match(bound.description,/"claim_id":"C3"/);
    assert.doesNotMatch(bound.description,/LOCAL-BASIS-MARKER|LOCAL-NOTE-MARKER|local_summary|"claim_id":"C1"|"claim_id":"C2"/);
    assert.equal(bound.workOrderDraftSha256,config.workOrderDraftSha256);
    // The approved hash covers the local findings too, so editing them after approval is refused.
    await writeFile(file,raw.replace('LOCAL-BASIS-MARKER one','edited after approval'));
    await assert.rejects(applyWorkOrder(config),/SHA-256 commitment/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
