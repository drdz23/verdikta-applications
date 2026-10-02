// The keystore password is never stored by this skill. It comes from VERDIKTA_WALLET_PASSWORD in the process
// environment (OpenClaw injects it from skills.entries.verdikta-bounties-onboarding.apiKey, a SecretRef; other
// runtimes export it from their secret store) or, in a human-controlled terminal, from a prompt that does not echo.
// There is deliberately no file fallback.
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';

export const PASSWORD_ENV = 'VERDIKTA_WALLET_PASSWORD';
export const PASSWORD_GUIDANCE =
  `${PASSWORD_ENV} is not set. Provide it from a secret store (OpenClaw: skills.entries.verdikta-bounties-onboarding.apiKey ` +
  'as a SecretRef; see references/onboarding.md#wallet-password) or run this in a terminal to type it. It is never read from a file.';

// A readline interface whose output can be muted, so typed secrets are not echoed (public APIs only).
export function createPrompt({ input = process.stdin, output = process.stdout } = {}) {
  let muted = false;
  const sink = new Writable({ write(chunk, encoding, done) { if (!muted) output.write(chunk, encoding); done(); } });
  const rl = readline.createInterface({ input, output: sink, terminal: Boolean(input.isTTY) });
  return {
    rl,
    question: q => rl.question(q),
    async hidden(q) {
      output.write(q);
      muted = true;
      try { return (await rl.question('')).trim(); } finally { muted = false; output.write('\n'); }
    },
    close: () => rl.close(),
  };
}

export async function walletPassword({ prompt, purpose = 'unlock the bot wallet', confirm = false, env = process.env, input = process.stdin } = {}) {
  if (env[PASSWORD_ENV]) return env[PASSWORD_ENV];
  if (!input.isTTY) throw new Error(PASSWORD_GUIDANCE);
  const ask = prompt || createPrompt({ input });
  try {
    const password = await ask.hidden(`Wallet password (to ${purpose}; not stored): `);
    if (!password) throw new Error('Empty wallet password');
    if (confirm && (await ask.hidden('Repeat the wallet password: ')) !== password) throw new Error('Passwords do not match');
    return password;
  } finally {
    if (!prompt) ask.close();
  }
}

// Remove every assignment of `key` (plain or `export KEY=`) from .env text, keeping all other lines as they are.
export function removeEnvKey(text, key) {
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
  return String(text).split(/\r?\n/).filter(line => !assignment.test(line)).join('\n');
}
