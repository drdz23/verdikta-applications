import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preview } from '../../../../skills/verdikta-discover/scripts/preview-core.mjs';
import { workOrderInputKind } from '../../src/utils/buyerPreviewInput.js';

const skill = new URL('../../../../skills/verdikta-discover/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, skill), 'utf8'));

test('the buyer preview recognises an assessment input and a saved draft, and leaves a request alone', async () => {
  const request = await read('examples/source-check-v1.request.json');
  const assessment = await read('examples/assessment.json');
  const hybrid = await read('examples/assessment-hybrid.json');
  assert.equal(workOrderInputKind(request), null);
  assert.equal(workOrderInputKind(await read('examples/evidence-pack-v1.request.json')), null);
  assert.equal(workOrderInputKind(assessment), 'assessment');
  assert.equal(workOrderInputKind(hybrid), 'assessment');
  assert.equal(workOrderInputKind(preview(structuredClone(assessment))), 'draft');
  for (const other of [null, 'text', 42, [], [request], { request: 'not an object', task_summary: 'x' }]) assert.equal(workOrderInputKind(other), null);
});
