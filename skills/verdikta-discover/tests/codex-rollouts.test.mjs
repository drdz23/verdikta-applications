// codex_rollouts.py on a synthetic Codex rollout in the shape OpenClaw 2026.8.33's Codex harness writes (code-mode `exec`
// scripts calling tools.*, captured from a real run with contents replaced), mapped to its case by the trajectory's threadId.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('openclaw/codex_rollouts.py', import.meta.url).pathname;
const item = payload => ({ timestamp: '2026-10-02T10:00:00Z', type: 'response_item', payload });
const script = (id, input) => item({ type: 'custom_tool_call', status: 'completed', call_id: id, name: 'exec', input });
const output = (id, text) => item({ type: 'custom_tool_call_output', call_id: id, output: [{ type: 'input_text', text: 'Script completed\nOutput:\n' }, { type: 'input_text', text }] });

test('a rollout is mapped to its case by thread id and every tool call is recovered, without reasoning or the system prompt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verdikta-rollout-'));
  try {
    const run = join(dir, 'r3-s1'), rollouts = join(dir, 'sessions', '2026', '10', '02');
    await mkdir(join(run, '.openclaw/trajectory-exports/r3-s1-CH01'), { recursive: true }); await mkdir(rollouts, { recursive: true });
    await writeFile(join(run, '.openclaw/trajectory-exports/r3-s1-CH01/events.jsonl'),
      [{ type: 'session.started', data: { threadId: 'thread-ch01' } }, { type: 'tool.call', data: { threadId: 'thread-ch01' } }].map(e => JSON.stringify(e)).join('\n') + '\n');
    const heredoc = "node scripts/preview.bundle.mjs --check - <<'JSON'\n{\"request\": {\"task_id\": \"t\"}}\nJSON";
    const lines = [
      { type: 'session_meta', payload: { id: 'thread-ch01', base_instructions: 'SYSTEM-PROMPT-MARKER', sandbox_policy: { type: 'danger-full-access' } } },
      item({ type: 'reasoning', encrypted_content: 'xxsk-AAAAAAAAAAAAAAAAAAAAAAAAxx' }),
      script('c1', `const r = await tools.exec_command(${JSON.stringify({ cmd: heredoc, workdir: '/w' })});\ntext(r.output);\n`),
      output('c1', '{"decision": "PREVIEW", "draft_sha256": "abc"}'),
      script('c2', 'const [a, b] = await Promise.all([\n  tools.openclaw__web_fetch({url:"https://docs.example/a",extractMode:"text",maxChars:12000}),\n  tools.web__run({"open":[{"ref_id":"https://docs.example/b"}],"search_query":[{"q":"vendor docs"}]})\n]);\ntext(JSON.stringify({a, b}));\n'),
      output('c2', '{"a": "{\\n  \\"url\\": \\"https://docs.example/a\\",\\n  \\"finalUrl\\": \\"https://other.example/a\\",\\n  \\"status\\": 200\\n}"}'),
      script('c3', 'const patch = "*** Begin Patch\\n*** Add File: /tmp/in.json\\n+{}\\n*** End Patch\\n";\nawait tools.apply_patch(patch);\n'),
      output('c3', 'Done'),
      script('c4', 'await tools.progress_card({markdown:"done"});'),
      output('c4', 'ok'),
    ];
    await writeFile(join(rollouts, 'rollout-2026-10-02T10-00-00-thread-ch01.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    await writeFile(join(rollouts, 'rollout-2026-10-02T10-00-00-thread-other.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');

    const threads = spawnSync('python3', [SCRIPT, '--threads', run], { encoding: 'utf8' });
    assert.equal(threads.status, 0, threads.stderr); assert.equal(threads.stdout.trim(), 'thread-ch01');
    const parsed = spawnSync('python3', [SCRIPT, run, join(dir, 'sessions')], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
    const text = await readFile(join(run, 'CH01.codex.json'), 'utf8');
    assert.doesNotMatch(text, /SYSTEM-PROMPT-MARKER|encrypted|sk-AAAA/);
    const out = JSON.parse(text);
    assert.deepEqual(out.rollouts, ['rollout-2026-10-02T10-00-00-thread-ch01.jsonl']);
    assert.deepEqual(out.scripts.map(s => s.calls.map(c => c.tool)), [['exec_command'], ['openclaw__web_fetch', 'web__run'], ['apply_patch'], ['progress_card']]);
    assert.deepEqual(out.scripts[0].calls[0], { tool: 'exec_command', command: heredoc, workdir: '/w' });
    assert.match(out.scripts[0].output, /"draft_sha256": "abc"/);
    assert.equal(out.scripts[1].calls[0].url, 'https://docs.example/a');
    assert.deepEqual(out.scripts[1].calls[1], { tool: 'web__run', open: ['https://docs.example/b'], search: ['vendor docs'] });
    assert.deepEqual(out.scripts[1].final_urls, ['https://other.example/a']); assert.deepEqual(out.scripts[1].statuses, [200]);
    assert.deepEqual(out.scripts[2].calls[0], { tool: 'apply_patch', paths: ['/tmp/in.json'] });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
