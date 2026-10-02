#!/usr/bin/env python3
"""Tool calls of a Codex-harness agent, read from Codex's own session logs (rollouts), unredacted.

usage: codex_rollouts.py --threads RUN_DIR              print the Codex thread ids of RUN_DIR's cases, one per line
       codex_rollouts.py RUN_DIR ROLLOUT_DIR            write RUN_DIR/<CASE>.codex.json for every case with a rollout

OpenClaw's trajectory export redacts every shell command and every output that contains inline JSON (an assessment input
piped to the preview script, the script's own output), so for an agent on OpenClaw's Codex harness the tool calls are read
from the Codex rollout instead (`agents/<id>/agent/codex-home/sessions/YYYY/MM/DD/rollout-<time>-<thread>.jsonl`). A case
maps to its rollout exactly: the trajectory's events carry the Codex `threadId`, which the rollout's file name ends with.

In Codex's code mode every tool call is a JavaScript `exec` script calling `tools.<name>(...)`. Each script becomes one
record with the tools it called and their parsed arguments: exec_command (command, workdir), web__run (the references it
opened or searched; Codex's built-in web tool, outside OpenClaw's web_fetch), openclaw__web_fetch (URL), apply_patch (the
paths a patch adds, updates or deletes), anything else by name, plus the script's output text with any final URL and HTTP
status it reports. Encrypted reasoning and the system prompt are never copied.
"""
import glob, json, os, re, sys

OUTPUT_CAP = 20000
TOOL_CALL = re.compile(r'tools\.(\w+)\s*\(')
PATCH_PATH = re.compile(r'\*\*\* (Add|Update|Delete) File: ([^\n\\"]+)')
JSON_STRING = r'"((?:[^"\\]|\\.)*)"'


def thread_ids(run_dir):
    """{case_id: [thread ids]} from the run's trajectory exports."""
    out = {}
    tag = os.path.basename(os.path.normpath(run_dir))
    for ev in glob.glob(os.path.join(run_dir, '.openclaw', 'trajectory-exports', f'{tag}-*', 'events.jsonl')):
        case = os.path.basename(os.path.dirname(ev))[len(tag) + 1:]
        ids = []
        for line in open(ev):
            try:
                tid = (json.loads(line).get('data') or {}).get('threadId')
            except ValueError:
                continue
            if isinstance(tid, str) and tid not in ids:
                ids.append(tid)
        out[case] = ids
    return out


def balanced_args(src, start):
    """The text between the parenthesis opened just before `start` and its match, skipping string literals."""
    depth, i, quote = 1, start, None
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in '"\'`':
            quote = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return src[start:i]
        i += 1
    return src[start:]


def string_field(args, *names):
    """The first JSON string literal given to one of `names` ("key": "..." or key: "...")."""
    for name in names:
        m = re.search(r'["\']?' + name + r'["\']?\s*:\s*' + JSON_STRING, args)
        if m:
            return json.loads('"' + m.group(1) + '"')
    return None


def all_strings(args, name):
    return [json.loads('"' + v + '"') for v in re.findall(r'["\']?' + name + r'["\']?\s*:\s*' + JSON_STRING, args)]


def parse_script(src):
    """Every tools.<name>(...) call in one code-mode script, with the arguments that matter for the safety review."""
    calls = []
    for m in TOOL_CALL.finditer(src):
        name, args = m.group(1), balanced_args(src, m.end())
        if name == 'exec_command':
            calls.append({'tool': name, 'command': string_field(args, 'cmd', 'command'), 'workdir': string_field(args, 'workdir')})
        elif name == 'web__run':
            calls.append({'tool': name, 'open': all_strings(args, 'ref_id'), 'search': all_strings(args, 'q')})
        elif name.endswith('web_fetch'):
            calls.append({'tool': name, 'url': string_field(args, 'url')})
        elif name == 'apply_patch':
            calls.append({'tool': name, 'paths': [p.strip() for _, p in PATCH_PATH.findall(src)]})
        else:
            calls.append({'tool': name})
    return calls


def parse_rollout(path):
    """One record per code-mode script, in order, with its tool calls and its output."""
    scripts, outputs = [], {}
    for line in open(path):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        p = e.get('payload') or {}
        if p.get('type') in ('custom_tool_call', 'function_call'):
            src = p.get('input') or p.get('arguments') or ''
            src = src if isinstance(src, str) else json.dumps(src)
            calls = parse_script(src) if p.get('name') == 'exec' else [{'tool': p.get('name')}]
            scripts.append({'call_id': p.get('call_id'), 'script_name': p.get('name'), 'calls': calls, 'source_chars': len(src)})
        elif p.get('type') in ('custom_tool_call_output', 'function_call_output'):
            out = p.get('output')
            text = out if isinstance(out, str) else ''.join(x.get('text', '') for x in (out or []) if isinstance(x, dict))
            outputs[p.get('call_id')] = text
    for s in scripts:
        text = outputs.get(s['call_id'], '')
        s['output'] = text[:OUTPUT_CAP]
        s['final_urls'] = re.findall(r'\\?"finalUrl\\?"\s*:\s*\\?"(https?://[^"\\]+)', text)
        s['statuses'] = [int(x) for x in re.findall(r'\\?"status\\?"\s*:\s*(\d{3})', text)]
    return scripts


def main(argv):
    if argv[:1] == ['--threads']:
        for ids in thread_ids(argv[1]).values():
            for tid in ids:
                print(tid)
        return 0
    run_dir, rollout_dir = argv[0], argv[1]
    files = glob.glob(os.path.join(rollout_dir, '**', 'rollout-*.jsonl'), recursive=True)
    written = 0
    for case, ids in sorted(thread_ids(run_dir).items()):
        mine = [f for f in files if any(os.path.basename(f).endswith(f'-{t}.jsonl') for t in ids)]
        if not mine:
            continue
        scripts = [s for f in sorted(mine) for s in parse_rollout(f)]
        json.dump({'case': case, 'threads': ids, 'rollouts': [os.path.basename(f) for f in sorted(mine)], 'scripts': scripts},
                  open(os.path.join(run_dir, f'{case}.codex.json'), 'w'), indent=1)
        written += 1
    print(written, 'cases with a Codex rollout')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
