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
    const config={workOrderDraft:file,description:'Test only',rubricJson:a.draft.rubric,threshold:a.draft.threshold,procurementMode:'TARGETED',targetHunter:target};
    const bound=await applyWorkOrder(config);assert.match(bound.description,/result.input_sha256/);assert.match(bound.workOrderDraftSha256,/^[0-9a-f]{64}$/);
    await assert.rejects(applyWorkOrder({...config,threshold:10}));
    await assert.rejects(applyWorkOrder({...config,procurementMode:'OPEN'}));
    a.draft.request.fixture_only=true;await writeFile(file,JSON.stringify(a));await assert.rejects(applyWorkOrder(config));
  } finally {await rm(dir,{recursive:true,force:true});}
});
