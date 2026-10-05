import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pastedJsonText } from '../../src/utils/pastedJson.js';
import { inspectDraftBytes } from '../../src/utils/workOrderImport.js';

const skill = new URL('../../../../skills/verdikta-discover/', import.meta.url);
const hybrid = JSON.parse(await readFile(new URL('examples/assessment-hybrid.json', skill), 'utf8'));
const input = { ...hybrid, request: { ...hybrid.request, fixture_only: false, task_id: 'paste-test' } };
const encode = text => new TextEncoder().encode(text);

// Splits compact JSON into chat parts the way references/drafting.md tells agents to: right after a comma outside a string.
function chatParts(json, count) {
  const cuts = [];
  let inString = false, escaped = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (escaped) escaped = false;
    else if (c === '\\') escaped = inString;
    else if (c === '"') inString = !inString;
    else if (c === ',' && !inString) cuts.push(i + 1);
  }
  const parts = [];
  let start = 0;
  for (let k = 1; k < count; k++) {
    const cut = cuts.find(at => at >= (json.length * k) / count);
    parts.push(json.slice(start, cut)); start = cut;
  }
  parts.push(json.slice(start));
  return parts;
}

test('text without code fences is returned byte for byte', () => {
  for (const text of ['{"a":1}', '{\n  "a": 1\n}\n', '{"a":1}\r\n', '  not json at all  ', '']) assert.equal(pastedJsonText(text), text);
});

test('a chat reply keeps only the contents of its json code blocks, in order', () => {
  const reply = 'Decision: PREVIEW (hybrid)\n\nThe input:\n```json\n{"a":1,\n"b":[2,3]}\n```\nImport it on Create Bounty.';
  assert.equal(pastedJsonText(reply), '{"a":1,\n"b":[2,3]}');
  assert.equal(pastedJsonText('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(pastedJsonText('```bash\nnode scripts/preview.bundle.mjs --check -\n```\n```JSON\n{"a":1}\n```'), '{"a":1}');
  assert.equal(pastedJsonText('```json\n{"a":1}'), '{"a":1}', 'a block whose closing fence was not copied');
  assert.deepEqual(JSON.parse(pastedJsonText('```json\r\n{"a":1}\r\n```\r\n')), { a: 1 });
});

test('an assessment input sent in labelled parts imports with the same draft and SHA-256 as the whole input', () => {
  const compact = JSON.stringify(input);
  const parts = chatParts(compact, 3);
  assert.equal(parts.join(''), compact);
  const reply = ['Decision: PREVIEW (hybrid: resolved locally, rest drafted)', ...parts.flatMap((part, i) => [`part ${i + 1}/${parts.length}`, '```json', part, '```'])].join('\n');
  const whole = inspectDraftBytes(encode(compact));
  const pasted = inspectDraftBytes(encode(pastedJsonText(reply)));
  assert.equal(whole.ok, true, whole.errors.join('; '));
  assert.equal(pasted.ok, true, pasted.errors.join('; '));
  assert.equal(pasted.sha256, whole.sha256);
  assert.equal(pasted.previewText, whole.previewText);
  assert.deepEqual(JSON.parse(pastedJsonText(reply)), input);
});
