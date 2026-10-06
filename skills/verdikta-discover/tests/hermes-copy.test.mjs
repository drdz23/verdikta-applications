// The Hermes Agent copy (skills/hermes/verdikta-discover) is generated from this skill by
// skills/hermes/build-verdikta-discover.mjs. It must equal a fresh build, and its SKILL.md may differ from this one only by
// the declared Hermes edits: the OpenClaw text was tuned over ten evaluated rounds and is never edited for Hermes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, diff, hermesSkillText, HERMES_EDITS, DESCRIPTION_LEAD, SOURCE, TARGET } from '../../hermes/build-verdikta-discover.mjs';

const openclaw = await readFile(join(SOURCE, 'SKILL.md'), 'utf8');
const hermes = await readFile(join(TARGET, 'SKILL.md'), 'utf8');
const frontmatter = text => text.split('\n---\n')[0];

test('the committed Hermes copy equals a fresh build (run node skills/hermes/build-verdikta-discover.mjs)', async () => {
  assert.deepEqual(await diff(), []);
});

test('the Hermes SKILL.md is the OpenClaw SKILL.md with exactly the declared edits', () => {
  assert.equal(hermes, hermesSkillText(openclaw));
  let undone = hermes;
  for (const [from, to] of [...HERMES_EDITS].reverse()) {
    assert.equal(undone.split(to).length - 1, 1, `edit target occurs once: ${to.slice(0, 60)}`);
    undone = undone.replace(to, () => from);
  }
  assert.equal(undone, openclaw);
});

test('every other file is copied byte for byte, and _meta.json (ClawHub metadata) is left out', async () => {
  const files = await build();
  assert.ok(!files.has('_meta.json'));
  assert.ok(files.has('scripts/preview.bundle.mjs') && files.has('references/install.md'));
  for (const [f, data] of files) {
    if (f !== 'SKILL.md') assert.ok(data.equals(await readFile(join(SOURCE, f))), f);
  }
});

test("Hermes' 57-character skill index shows the whole lead, and the description fits Hermes and agentskills.io limits", () => {
  const m = /^description: "(.*)"$/m.exec(frontmatter(hermes));
  const description = m[1];
  assert.equal(DESCRIPTION_LEAD.length, 57);
  // agent/skill_utils.py extract_skill_description: desc[:57] + "..." when longer than 60.
  assert.equal(description.slice(0, 57), DESCRIPTION_LEAD);
  assert.ok(description.length <= 1024);
  assert.match(frontmatter(hermes), /^---\nname: verdikta-discover\n/);
  // agentskills.io (skills-ref) allows only these top-level keys.
  const keys = [...frontmatter(hermes).matchAll(/^([a-z][\w-]*):/gm)].map(k => k[1]);
  assert.deepEqual(keys.filter(k => !['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(k)), []);
});

test('the Hermes copy names browser_navigate as the fetch tool and web_fetch nowhere', () => {
  assert.equal(hermes.includes('web_fetch'), false);
  assert.equal(hermes.split('`browser_navigate`').length - 1, 2);
  assert.match(hermes, /`web_extract` and `web_search` on Hermes/);
});
