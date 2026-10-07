// Repository validation only. First use may download solc; never loads deployment secrets.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../../../example-bounty-program/onchain/', import.meta.url));
execFileSync(process.execPath, ['node_modules/hardhat/internal/cli/cli.js', 'compile', '--config', 'hardhat.local.cjs'], { cwd, stdio: 'inherit' });
