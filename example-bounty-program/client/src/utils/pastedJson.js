// An agent returns its assessment input in a fenced ```json block. In a chat that limits message length, it sends the
// input as several messages, each labelled "part k/N" above its own fenced block and split only right after a comma
// outside a string (verdikta-discover references/drafting.md). Pasting such a reply should not fail on the fences, the
// labels or the agent's prose: when the text holds fenced blocks, keep only the contents of the json (or unlabelled)
// blocks, in order. That rebuilds the JSON the agent produced. Text without fences is returned unchanged, byte for byte,
// so a pasted draft keeps the exact bytes its SHA-256 is taken over.
const FENCE = /^\s*```\s*([\w-]*)\s*$/;

export function pastedJsonText(text) {
  const source = String(text);
  const lines = source.split('\n');
  if (!lines.some(line => FENCE.test(line))) return source;
  const kept = [];
  let inside = false;
  let keep = false;
  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (fence) {
      if (inside) inside = false;
      else { inside = true; keep = !fence[1] || fence[1].toLowerCase() === 'json'; }
      continue;
    }
    if (inside && keep) kept.push(line);
  }
  return kept.join('\n');
}
