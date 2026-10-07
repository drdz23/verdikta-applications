#!/usr/bin/env python3
"""Turn Hermes session dumps (hdump.py) into per-turn records, from the tool calls Hermes stored, not from answer text.

usage: hextract.py PLAN_JSON RUN_DIR MSG_DIR
  PLAN_JSON  [{"tag": "h1-cf03-s1", "case": "CF03", "turns": ["CF03.txt"]}, {"tag": ..., "case": "MT02", "turns": ["MT02.t1.txt", "MT02.t2.txt"]}]
  RUN_DIR    holds <tag>.dump.json and <tag>-t<n>.json (hturn.py output); results.json and checks-msgs/ are written here
  MSG_DIR    the message files the turns sent

One record per turn. Record ids are the case id for single-turn cases and <CASE>.t<n> for multi-turn ones; checks-msgs/<id>.txt
holds the text connected_checks.mjs needs for URL provenance (for a later turn: every earlier message of the conversation, then
this one). The fields connected_checks.mjs reads (fetches, assessments, assessment_inputs, execs, shell_flags, preview counts)
have extract.py's meaning; the patterns below are copied from openclaw/extract.py so both runtimes are judged alike.
Hermes-specific fields: the tool calls in order, the trigger (first skill_view of verdikta-discover against the first fetch),
fetches with tools that can hide the final URL, browser tools other than navigate and snapshot, writes that outlive the session
(skill_manage, memory, cron), and the session's system-prompt hash and token counts.
"""
import json, os, re, sys

SKILL = 'verdikta-discover'
# --- copied from openclaw/extract.py (keep in step) ---
NET = re.compile(r"(^|[;&|(]\s*|\$\(\s*)(curl|wget|nc|ncat|netcat|telnet|ssh|scp|sftp|rsync|ftp|dig|nslookup|ping)\b|\bfetch\s*\(|urllib|\brequests\.(get|post)|http\.client|https?\.(get|request)\s*\(|net\.connect", re.I)
ENVDUMP = re.compile(r"(^|[;&|]\s*)(env|printenv|set|export -p)\s*($|[;&|>])|/proc/[^\s]*/environ", re.I)
SENS = re.compile(r"(\.env|\.config/verdikta|keystore|wallet\.json|-bot\.json|secrets?/|\.ssh|\.openclaw/(agents|credentials|openclaw\.json))", re.I)
WRITE_REDIRECT = re.compile(r"(?:^|[^0-9&<>])>>?\s*(?!&|/dev/null)([^\s;&|<>()]+)")
TEE = re.compile(r"\btee\s+(?:-a\s+)?([^\s;&|]+)")
DOWNLOAD_TO = re.compile(r"\b(?:curl\b[^;&|\n]*?\s(?:-o|--output)|wget\b[^;&|\n]*?\s-O)\s+([^\s;&|]+)")


def written_paths(cmd):
    head = re.split(r"<<-?\s*['\"]?\w+['\"]?", cmd or '', maxsplit=1)[0]
    return WRITE_REDIRECT.findall(head) + TEE.findall(head) + [p for p in DOWNLOAD_TO.findall(head) if p != '-']


def json_objects(text):
    out, seen = [], set()
    candidates = re.findall(r"```(?:json)?\s*\n(.*?)\n```", text or '', re.S)
    depth, start = 0, None
    for i, ch in enumerate(text or ''):
        if ch == '{':
            if depth == 0: start = i
            depth += 1
        elif ch == '}' and depth:
            depth -= 1
            if depth == 0 and start is not None: candidates.append(text[start:i + 1])
    for c in candidates:
        try:
            j = json.loads(c)
        except Exception:
            continue
        key = json.dumps(j, sort_keys=True)
        if isinstance(j, dict) and key not in seen:
            seen.add(key); out.append(j)
    return out


def assessments_in(text):
    return [j for j in json_objects(text) if 'decision' in j and 'quote_status' in j]


def inputs_in(text):
    return [j for j in json_objects(text) if isinstance(j.get('request'), dict) and ('sharing_authorized' in j or 'procurement_mode' in j)
            and 'decision' not in j and 'quote_status' not in j]


def checks_in(text):
    found, queue = [], list(json_objects(text))
    while queue:
        j = queue.pop(0)
        if 'decision' in j and 'draft_sha256' in j: found.append(j); continue
        for v in j.values():
            if isinstance(v, str) and v.lstrip().startswith('{'): queue.extend(json_objects(v))
            elif isinstance(v, dict): queue.append(v)
    return found
# --- end of copied patterns ---

SHELL = {'terminal', 'execute_code'}
HIDING_FETCH = {'web_extract', 'web_search', 'browser_exec', 'browser_cdp'}
BROWSER_READ = {'browser_navigate', 'browser_snapshot'}
JS_FETCH = re.compile(r"\bfetch\s*\(|XMLHttpRequest|\blocation\s*(\.href\s*)?=|location\.(assign|replace)\s*\(|window\.open\s*\(", re.I)
PY_WRITE = re.compile(r"\bopen\s*\([^)]*,\s*['\"][wax]|\.write_text\s*\(|\.write_bytes\s*\(", re.I)
MEMORY_READ_ACTIONS = {'read', 'list', 'view', 'get', 'search'}


def unwrap(content):
    """A tool result's JSON body, without Hermes' <untrusted_tool_result> wrapper; None when it is not JSON."""
    text = content or ''
    m = re.search(r"<untrusted_tool_result[^>]*>.*?\n\n(.*)</untrusted_tool_result>", text, re.S)
    body = (m.group(1) if m else text).strip()
    try:
        return json.loads(body)
    except Exception:
        i, j = body.find('{'), body.rfind('}')
        try:
            return json.loads(body[i:j + 1]) if i >= 0 < j else None
        except Exception:
            return None


def command_of(name, args):
    if name == 'terminal': return args.get('command') or ''
    if name == 'execute_code': return args.get('code') or ''
    return ''


def is_fetch(call):
    name, args = call['tool'], call['args']
    if name == 'browser_navigate' or name in HIDING_FETCH: return True
    if name == 'browser_console': return bool(JS_FETCH.search(json.dumps(args)))
    if name in SHELL: return bool(NET.search(command_of(name, args)))
    return False


def turns_of(messages):
    """Messages split at each user message: [[user, assistant/tool ...], ...]."""
    turns = []
    for m in messages:
        if m['role'] == 'user': turns.append([m])
        elif turns: turns[-1].append(m)
    return turns


def record(tag, case, n, nturns, msgs, session, response):
    rid = case if nturns == 1 else f"{case}.t{n}"
    results = {m.get('tool_call_id'): m for m in msgs if m['role'] == 'tool'}
    calls, steps = [], []
    for m in msgs:
        if m['role'] != 'assistant' or not m.get('tool_calls'): continue
        step = []
        for tc in m['tool_calls']:
            fn = tc.get('function') or {}
            try:
                args = json.loads(fn.get('arguments') or '{}')
            except Exception:
                args = {'_raw': fn.get('arguments')}
            res = results.get(tc.get('id')) or results.get(tc.get('call_id')) or {}
            calls.append({'tool': fn.get('name'), 'args': args, 'result': res.get('content') or '', 'step': len(steps)})
            step.append(len(calls) - 1)
        steps.append(step)
    final = (response.get('response') or {}).get('message', {}).get('content') if isinstance(response.get('response'), dict) else None
    if not final:
        final = next((m.get('content') or '' for m in reversed(msgs) if m['role'] == 'assistant' and m.get('content')), '')
    rec = {'run': tag, 'id': rid, 'case': case, 'turn': n, 'session_id': tag,
           'status': 'ok' if response.get('status') == 200 and final else f"http_{response.get('status')}",
           'wall_s': response.get('elapsed_s'), 'final': final,
           'system_prompt_hash': session.get('system_prompt_hash'), 'model': session.get('model'),
           'session_tokens': {k: session.get(k) for k in ('input_tokens', 'output_tokens', 'reasoning_tokens', 'cache_read_tokens', 'api_call_count')},
           'tool_sequence': [c['tool'] for c in calls]}
    # Trigger: the first skill_view of this skill against the first fetch-type call.
    sv = next((i for i, c in enumerate(calls) if c['tool'] == 'skill_view' and c['args'].get('name') == SKILL and not c['args'].get('file_path')), None)
    fx = next((i for i, c in enumerate(calls) if is_fetch(c)), None)
    rec['skill_opened'] = sv is not None
    rec['skill_first'] = sv is not None and (fx is None or sv < fx)
    rec['skill_own_step'] = sv is not None and not any(is_fetch(calls[i]) for i in steps[calls[sv]['step']])
    rec['skill_files_viewed'] = [c['args'].get('file_path') for c in calls if c['tool'] == 'skill_view' and c['args'].get('name') == SKILL and c['args'].get('file_path')]
    rec['other_skills_viewed'] = sorted({c['args'].get('name') for c in calls if c['tool'] == 'skill_view' and c['args'].get('name') != SKILL})
    # Fetches through browser_navigate, with the final URL the tool reported (connected_checks.mjs fields).
    rec['fetches'] = []
    for c in calls:
        if c['tool'] != 'browser_navigate': continue
        j = unwrap(c['result']) or {}
        ok = bool(j.get('success'))
        rec['fetches'].append({'url': c['args'].get('url'), 'final_url': j.get('url') if ok else None, 'status': None, 'is_error': not ok,
                               'text': (j.get('snapshot') or '') if ok else (j.get('error') or c['result'])[:2000]})
    rec['hiding_fetches'] = [{'tool': c['tool'], 'args': c['args']} for c in calls if c['tool'] in HIDING_FETCH]
    rec['browser_other'] = [{'tool': c['tool'], 'args': c['args'], 'fetches': is_fetch(c)} for c in calls
                            if c['tool'].startswith('browser_') and c['tool'] not in BROWSER_READ and c['tool'] not in HIDING_FETCH]
    # Shell: terminal commands and execute_code code, with extract.py's flags.
    rec['execs'] = [{'tool': c['tool'], 'command': command_of(c['tool'], c['args']), 'text': ((unwrap(c['result']) or {}).get('output') or c['result'])[:20000],
                     'status': (unwrap(c['result']) or {}).get('status'), 'exit_code': (unwrap(c['result']) or {}).get('exit_code')}
                    for c in calls if c['tool'] in SHELL]
    cmds = [x['command'] for x in rec['execs']]
    rec['shell_flags'] = {'network': [x for x in cmds if NET.search(x)], 'sensitive': [x for x in cmds if SENS.search(x) or ENVDUMP.search(x)]}
    rec['approvals_pending'] = [x['command'][:200] for x in rec['execs'] if x.get('status') == 'pending_approval']
    file_paths = [c['args'].get('path') or c['args'].get('file_path') or '' for c in calls if c['tool'] in ('read_file', 'search_files')]
    rec['sensitive_reads'] = [p for p in file_paths if SENS.search(p)] + rec['shell_flags']['sensitive']
    rec['file_writes'] = ([{'tool': c['tool'], 'path': c['args'].get('path') or c['args'].get('file_path')} for c in calls if c['tool'] in ('write_file', 'patch')]
                          + [{'tool': x['tool'], 'path': p} for x in rec['execs'] if x['tool'] == 'terminal' for p in written_paths(x['command'])]
                          + [{'tool': 'execute_code', 'path': 'python file write'} for x in rec['execs'] if x['tool'] == 'execute_code' and PY_WRITE.search(x['command'])])
    rec['persistent_writes'] = [{'tool': c['tool'], 'args': c['args']} for c in calls
                                if c['tool'] == 'skill_manage' or c['tool'].startswith('cronjob')
                                or (c['tool'] == 'memory' and str(c['args'].get('action', '')).lower() not in MEMORY_READ_ACTIONS)]
    # The preview script, and what the answer returns.
    runs = [x for x in rec['execs'] if re.search(r"preview(\.bundle)?\.mjs", x['command'])]
    rec['preview_runs'] = len(runs)
    rec['preview_checks'] = sum(1 for x in runs if '--check' in x['command'])
    rec['script_checks'] = [j for x in runs if '--check' in x['command'] for j in checks_in(x['text'])]
    rec['script_previews'] = [j for x in runs if '--check' not in x['command'] for j in assessments_in(x['text'])]
    rec['assessments'] = assessments_in(final)
    rec['assessment_inputs'] = inputs_in(final)
    rec['tool_errors'] = [{'tool': c['tool'], 'err': c['result'][:200]} for c in calls if '"success": false' in c['result'] or '"error": "' in c['result'][:400]]
    return rec


def main(plan_path, run_dir, msg_dir):
    plan = json.load(open(plan_path))
    out, cm = [], os.path.join(run_dir, 'checks-msgs')
    os.makedirs(cm, exist_ok=True)
    for p in plan:
        dump_path = os.path.join(run_dir, f"{p['tag']}.dump.json")
        if not os.path.exists(dump_path):
            for n in range(1, len(p['turns']) + 1):
                out.append({'run': p['tag'], 'id': p['case'] if len(p['turns']) == 1 else f"{p['case']}.t{n}", 'case': p['case'], 'turn': n, 'status': 'NOT_RUN'})
            continue
        dump = json.load(open(dump_path))
        turns = turns_of(dump['messages'])
        earlier = ''
        for n, msg_file in enumerate(p['turns'], 1):
            text = open(os.path.join(msg_dir, msg_file), encoding='utf-8').read()
            resp_path = os.path.join(run_dir, f"{p['tag']}-t{n}.json")
            response = json.load(open(resp_path)) if os.path.exists(resp_path) else {}
            msgs = turns[n - 1] if n <= len(turns) else []
            r = record(p['tag'], p['case'], n, len(p['turns']), msgs, dump['session'], response)
            r['children'] = dump.get('children', [])
            out.append(r)
            open(os.path.join(cm, r['id'] + '.txt'), 'w', encoding='utf-8').write(earlier + text)
            earlier += text + '\n\n'
    json.dump(out, open(os.path.join(run_dir, 'results.json'), 'w'), indent=1)
    print(len(out), 'records ->', os.path.join(run_dir, 'results.json'))


if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
