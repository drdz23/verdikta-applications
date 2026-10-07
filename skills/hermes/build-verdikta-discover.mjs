#!/usr/bin/env node
// Builds skills/hermes/verdikta-discover/: the Hermes Agent copy of skills/verdikta-discover, generated from the OpenClaw
// source so the two never drift. The OpenClaw SKILL.md was tuned over ten evaluated rounds and is never edited for Hermes.
// The copy's SKILL.md differs from it only by HERMES_EDITS below; every other file is copied byte for byte.
// The file set is publish.sh's ClawHub release without _meta.json (ClawHub registry metadata).
//
//   node skills/hermes/build-verdikta-discover.mjs           write the copy
//   node skills/hermes/build-verdikta-discover.mjs --check   exit 1 if the committed copy differs from a fresh build
//
// skills/verdikta-discover/tests/hermes-copy.test.mjs runs the check and pins the edits.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE = join(here, '..', 'verdikta-discover');
export const TARGET = join(here, 'verdikta-discover');

// Hermes' system-prompt skill index shows only the first 57 characters of a description (agent/skill_utils.py,
// SKILL_PROMPT_DESC_LIMIT = 60), so the copy's description starts with a lead of exactly that length.
export const DESCRIPTION_LEAD = 'Verify claims against linked pages, or scope outside work';

// [OpenClaw text, Hermes text]: each OpenClaw text must occur exactly once in the source SKILL.md.
export const HERMES_EDITS = [
  // Frontmatter: the trigger-first lead, and Hermes tags (metadata is the only nested key the agentskills.io validator allows;
  // its strict YAML parser refuses flow-style lists, so the tags are a block list).
  ['description: "Use when',
   `description: "${DESCRIPTION_LEAD}. Use when`],
  ['Not for routine lookups or checks the agent can finish itself."\n---',
   'Not for routine lookups or checks the agent can finish itself."\nmetadata:\n  hermes:\n    tags:\n      - verdikta\n      - bounties\n      - claim-check\n      - source-check\n      - outsourcing\n---'],
  // Reading rule 5: Hermes has no web_fetch. browser_navigate reports the final URL; web_extract's url can be the
  // requested one (its keyless vendors differ, and it fails over between them), and web_search fetches nothing.
  ["such as the host's web-fetch tool (`web_fetch` on OpenClaw)",
   "such as the host's browser navigation tool (`browser_navigate` on Hermes, whose result's `url` is the final URL; read a long page with `browser_snapshot`)"],
  ['or a browse or search tool that hides the final URL',
   'or a tool that can hide the final URL (`web_extract` and `web_search` on Hermes)'],
  // Reading rule 7: the same tool, and "browse tool" no longer fits once the allowed tool is a browser.
  ['Fetch it with `web_fetch`, never a shell command or browse tool.',
   'Fetch it with `browser_navigate`, never a shell command or another web tool.'],
];

/** The Hermes SKILL.md from the OpenClaw one; throws if an edit's source text is missing or ambiguous. */
export function hermesSkillText(openclawText) {
  let text = openclawText;
  for (const [from, to] of HERMES_EDITS) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`expected exactly one occurrence of ${JSON.stringify(from)}, found ${count}`);
    text = text.replace(from, () => to);
  }
  return text;
}

// The release file set, as in skills/verdikta-discover/publish.sh (without _meta.json).
const ROOT_FILES = ['SKILL.md', 'CHANGELOG.md', 'package.json', 'package-lock.json'];
const DIRS = [['references', /\.md$/], ['scripts', /\.mjs$|^preview\.bundle\.NOTICES\.txt$/], ['templates', /\.json$/],
  ['schemas', /\.json$/], ['examples', /\.json$|\.txt$/]];

/** Map of relative path -> Buffer for the Hermes copy, built in memory. */
export async function build() {
  const files = new Map();
  for (const f of ROOT_FILES) files.set(f, await readFile(join(SOURCE, f)));
  files.set('SKILL.md', Buffer.from(hermesSkillText(files.get('SKILL.md').toString('utf8')), 'utf8'));
  for (const [dir, pattern] of DIRS) {
    for (const name of (await readdir(join(SOURCE, dir))).filter(n => pattern.test(n)).sort()) {
      files.set(`${dir}/${name}`, await readFile(join(SOURCE, dir, name)));
    }
  }
  return files;
}

async function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(p, base));
    else out.push(relative(base, p));
  }
  return out.sort();
}

/** Differences between the committed copy and a fresh build: [] when they match. */
export async function diff() {
  const fresh = await build();
  const committed = await listFiles(TARGET);
  const problems = [];
  for (const f of committed) if (!fresh.has(f)) problems.push(`extra file ${f}`);
  for (const [f, data] of fresh) {
    if (!committed.includes(f)) problems.push(`missing file ${f}`);
    else if (!data.equals(await readFile(join(TARGET, f)))) problems.push(`stale file ${f}`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const problems = await diff();
    if (problems.length) {
      console.error(`skills/hermes/verdikta-discover is out of date (run node skills/hermes/build-verdikta-discover.mjs):\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    console.log('skills/hermes/verdikta-discover matches a fresh build');
  } else {
    const files = await build();
    for (const [f, data] of files) {
      await mkdir(dirname(join(TARGET, f)), { recursive: true });
      await writeFile(join(TARGET, f), data);
    }
    console.log(`wrote ${files.size} files to ${relative(process.cwd(), TARGET) || TARGET}`);
    // Never deletes: a file the source no longer has is reported for the maintainer to remove.
    const extra = (await listFiles(TARGET)).filter(f => !files.has(f));
    if (extra.length) {
      console.error(`not in a fresh build (remove by hand):\n  ${extra.join('\n  ')}`);
      process.exit(1);
    }
  }
}
