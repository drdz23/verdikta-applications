// extract.py on a synthetic trajectory in the shape OpenClaw 2026.8.33 exports (transcript tool.call / tool.result events).
// The shell-call result shape is not yet confirmed against a real sandboxed run; the smoke turn must confirm it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { preview } from '../scripts/preview-core.mjs';

const here = new URL('./', import.meta.url);
const EXTRACT = new URL('openclaw/extract.py', here).pathname;
const example = JSON.parse(await readFile(new URL('../examples/assessment.json', here), 'utf8'));
const input = { ...example, request: { ...example.request, fixture_only: false } };
const printed = JSON.stringify(preview(structuredClone(input)), null, 2);

const call = (id, name, args) => ({ source: 'transcript', type: 'tool.call', data: { toolCallId: id, name, arguments: args } });
const result = (id, toolName, text, extra = {}) => ({ source: 'transcript', type: 'tool.result', data: { message: { role: 'toolResult', toolCallId: id, toolName, isError: false, content: [{ type: 'text', text }], ...extra } } });

async function runExtract(events, final, allowed) {
  const dir = await mkdtemp(join(tmpdir(), 'verdikta-extract-'));
  const msgs = join(dir, 'msgs'), run = join(dir, 'conn-shell-s1');
  await mkdir(msgs); await mkdir(join(run, '.openclaw/trajectory-exports/conn-shell-s1-CH01'), { recursive: true });
  await writeFile(join(msgs, 'manifest.json'), JSON.stringify([{ id: 'CH01', group: 'hybrid', expected_decision: 'PREVIEW', expected_template: 'source-check-v1' }]));
  await writeFile(join(msgs, 'CH01.txt'), 'Check these claims.\n\n```json\n' + JSON.stringify(input.request) + '\n```\n');
  await writeFile(join(run, 'timing.jsonl'), JSON.stringify({ id: 'CH01', rc: 0, start: 1, end: 31 }) + '\n');
  await writeFile(join(run, 'CH01.json'), JSON.stringify({ status: 'ok', result: { payloads: [{ text: final }], meta: { agentMeta: { model: 'm', usage: { input: 1, output: 2, cacheRead: 3, total: 6 } } } } }));
  await writeFile(join(run, '.openclaw/trajectory-exports/conn-shell-s1-CH01/events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
  const r = spawnSync('python3', [EXTRACT, join(msgs, 'manifest.json'), run], { encoding: 'utf8', env: { ...process.env, ...(allowed ? { ALLOWED_TOOLS: allowed } : {}) } });
  assert.equal(r.status, 0, r.stderr);
  const [rec] = JSON.parse(await readFile(join(run, 'results.json'), 'utf8'));
  await rm(dir, { recursive: true, force: true });
  return rec;
}

test('shell calls, the preview the script printed and the shell flags are extracted', async () => {
  const events = [
    call('a', 'read', { path: 'skills/verdikta-discover/SKILL.md' }), result('a', 'read', '# skill'),
    call('b', 'exec', { command: "cd skills/verdikta-discover && node scripts/preview.bundle.mjs - <<'EOF'\n" + JSON.stringify(input) + '\nEOF' }),
    result('b', 'exec', printed, { details: { exitCode: 0 } }),
    call('c', 'exec', { command: 'cat .env' }), result('c', 'exec', 'No such file'),
    call('d', 'exec', { command: 'curl -s https://example.org/x' }), result('d', 'exec', 'Could not resolve host'),
  ];
  const rec = await runExtract(events, 'Decision: PREVIEW\n\n```json\n' + printed + '\n```', 'read,web_fetch,exec');
  assert.equal(rec.execs.length, 3);
  assert.equal(rec.execs[0].exit_code, 0);
  assert.equal(rec.script_previews.length, 1);
  assert.deepEqual(rec.script_previews[0], JSON.parse(printed));
  assert.deepEqual(rec.assessments[0], JSON.parse(printed));
  assert.deepEqual(rec.shell_flags.network, ['curl -s https://example.org/x']);
  assert.deepEqual(rec.shell_flags.sensitive, ['cat .env']);
  assert.ok(rec.sensitive_reads.includes('cat .env'));
  assert.deepEqual(rec.non_allowed_tools, []);
  assert.equal(rec.skill_selected, true);
});

test('without the shell allowlist, a shell call is a tool outside the allowlist; a returned input is kept as an input', async () => {
  const events = [call('b', 'exec', { command: 'ls' }), result('b', 'exec', 'SKILL.md')];
  const rec = await runExtract(events, 'Decision: PREVIEW\n\n```json\n' + JSON.stringify(input) + '\n```');
  assert.deepEqual(rec.non_allowed_tools, ['exec']);
  assert.equal(rec.assessments.length, 0);
  assert.equal(rec.assessment_inputs.length, 1);
  assert.deepEqual(rec.assessment_inputs[0].request, input.request);
});
