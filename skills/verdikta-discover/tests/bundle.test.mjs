// The bundled preview CLI is what an agent with a shell runs: it must equal a fresh build, run with nothing but Node,
// and give exactly what preview() gives for every kind of input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preview, previewText, checkSummary, templates } from '../scripts/preview-core.mjs';
import { build, BUNDLE, NOTICES } from '../scripts/build-bundle.mjs';

const root = new URL('../', import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const TARGET = '0x52908400098527886E0F7030069857D2E4169EE7';

test('the committed bundle and notices equal a fresh build (run `npm run bundle` after changing the preview code)', async () => {
  const fresh = await build();
  assert.equal(await readFile(BUNDLE, 'utf8'), fresh.bundle);
  assert.equal(await readFile(NOTICES, 'utf8'), fresh.notices);
});

test('the bundle imports nothing but Node built-ins', async () => {
  const text = await readFile(BUNDLE, 'utf8');
  const imports = [...text.matchAll(/^import .* from ["']([^"']+)["'];?$/gm)].map(m => m[1]);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter(s => !s.startsWith('node:')), []);
});

test('alone in an empty directory, the bundle gives what preview() gives, from a file and from standard input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verdikta-bundle-'));
  try {
    const cli = join(dir, 'preview.bundle.mjs');
    await copyFile(BUNDLE, cli);
    const sourceCheck = await json('examples/assessment.json');
    const packRequest = { ...(await json('examples/evidence-pack-v1.request.json')), fixture_only: false };
    const inputs = {
      open: sourceCheck,
      hybrid: await json('examples/assessment-hybrid.json'),
      targeted: { request: packRequest, sharing_authorized: true, procurement_mode: 'TARGETED', targetHunter: TARGET, network: 'BASE_SEPOLIA' },
      no_sharing: { ...sourceCheck, sharing_authorized: undefined },
      declined: { ...sourceCheck, sharing_authorized: false },
      undecided_supplier: { ...sourceCheck, procurement_mode: 'UNSELECTED' },
      bad_market: { ...(await json('examples/assessment-hybrid.json')), market_context: { source_url: 'http://example.com/x?y=1', not_a_quote: false } },
      bad_summary: { ...(await json('examples/assessment-hybrid.json')), local_summary: { mode: 'RESIDUAL', independent: true } },
    };
    for (const [name, input] of Object.entries(inputs)) {
      const want = JSON.stringify(preview(structuredClone(input)), null, 2) + '\n';
      const file = join(dir, `${name}.json`);
      await writeFile(file, JSON.stringify(input));
      const fromFile = spawnSync(process.execPath, [cli, file], { cwd: dir, encoding: 'utf8' });
      assert.equal(fromFile.status, 0, `${name}: ${fromFile.stderr}`);
      assert.equal(fromFile.stdout, want, name);
      const fromStdin = spawnSync(process.execPath, [cli, '-'], { cwd: dir, encoding: 'utf8', input: JSON.stringify(input) });
      assert.equal(fromStdin.stdout, want, `${name} (stdin)`);
      // --check: the short summary an agent reads, whose draft_sha256 is the hash of the full output above.
      const sha = text => createHash('sha256').update(text).digest('hex');
      const summary = `${JSON.stringify(checkSummary(preview(structuredClone(input)), sha), null, 2)}\n`;
      for (const args of [['--check', file], ['--check', '-']]) {
        const checked = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', input: JSON.stringify(input) });
        assert.equal(checked.status, 0, `${name} ${args}: ${checked.stderr}`);
        assert.equal(checked.stdout, summary, `${name} ${args}`);
        assert.equal(JSON.parse(checked.stdout).draft_sha256, JSON.parse(want).draft ? sha(want) : null, `${name} ${args}`);
      }
    }
    const listed = spawnSync(process.execPath, [cli, '--templates'], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(listed.stdout), templates);
    const bad = spawnSync(process.execPath, [cli, '-'], { cwd: dir, encoding: 'utf8', input: 'not json' });
    assert.equal(bad.status, 1);
    assert.equal(spawnSync(process.execPath, [cli, '--check'], { cwd: dir, encoding: 'utf8' }).status, 1, '--check without an input is a usage error');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the hybrid input example produces the hybrid preview example exactly', async () => {
  assert.deepEqual(preview(await json('examples/assessment-hybrid.json')), await json('examples/preview-hybrid.json'));
});

test('previewText is exactly what the CLI prints, and checkSummary reports what an agent needs and nothing it could paste as a draft', async () => {
  const input = await json('examples/assessment-hybrid.json'), result = preview(structuredClone(input));
  assert.equal(previewText(result), `${JSON.stringify(result, null, 2)}\n`);
  const s = checkSummary(result, () => 'HASH');
  assert.deepEqual(Object.keys(s), ['decision', 'reason', 'inputs_needed', 'template_id', 'drafted_items', 'local_summary', 'market_context_included', 'draft_sha256', 'deliver']);
  assert.equal(s.decision, 'PREVIEW'); assert.deepEqual(s.drafted_items, ['C3']); assert.deepEqual(s.local_summary, { mode: 'RESIDUAL', resolved: 2, residual: 1 });
  assert.equal(s.market_context_included, true); assert.equal(s.draft_sha256, 'HASH');
  assert.equal(JSON.stringify(s).includes('rubric'), false, 'no draft fields leak into the summary');
  const none = checkSummary(preview({ ...input, sharing_authorized: undefined }), () => 'HASH');
  assert.equal(none.decision, 'NEEDS_SCOPE'); assert.equal(none.draft_sha256, null); assert.deepEqual(none.drafted_items, []); assert.ok(none.inputs_needed.includes('Obtain sharing approval'));
});
