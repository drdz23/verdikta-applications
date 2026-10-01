#!/usr/bin/env node
// Reads only the explicitly named input (a file, or standard input for "-"). No env/config, HTTP, wallet or signer imports.
import { readFile } from 'node:fs/promises';
import { preview, templates } from './preview-core.mjs';

const stdin = async () => { let text = ''; for await (const chunk of process.stdin) text += chunk; return text; };

if (process.argv[2] === '--templates') console.log(JSON.stringify(templates, null, 2));
else {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/preview.mjs assessment.json | - (read standard input) | --templates');
    const input = JSON.parse(process.argv[2] === '-' ? await stdin() : await readFile(process.argv[2], 'utf8'));
    console.log(JSON.stringify(preview(input), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
