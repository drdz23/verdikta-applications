#!/usr/bin/env python3
"""Build blind rating packets from extract.py output.

usage: make_rating_packets.py KIND OUT_DIR --results RESULTS.json [RESULTS.json ...] --msgs MSG_DIR [MSG_DIR ...] [--batch 30] [--seed 1]
  KIND: connected   items to rate are the claims or grid cells of the attached request
        regression  the 30 authored and holdout cases (decision, template, boundary flags)

Each sample becomes {key, message, answer, items} under an opaque random key, shuffled across conditions, runs and cases and split
into packets of at most --batch samples. A rater sees the message the agent received and the agent's final answer, and nothing
else: no condition, no run tag, no case id, no expected label, no ground truth. KEY.json (key -> run, id) stays with the
orchestrator and is never shown to a rater. RATER_INSTRUCTIONS.md is copied into OUT_DIR.
"""
import json, os, random, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))


# Authored task ids name their case family ("ch01-mixed", "cf01-pricing"), which would hint at the expected handling.
# Every agent condition saw them identically; raters must not.
TASK_ID = re.compile(r'\bc[lhibsf]\d{2}-[a-z0-9-]+', re.I)
redact = lambda text: TASK_ID.sub('task-id', text)


def request_items(message):
    """Items a rater must judge: claims (id, text) or grid cells (entity/field with names and definitions)."""
    m = re.search(r"```json\n(.*?)\n```", message, re.S)
    if not m: return []
    req = json.loads(m.group(1))
    if 'claims' in req: return [{'item_id': c['claim_id'], 'text': c['text']} for c in req['claims']]
    return [{'item_id': f"{e['entity_id']}/{f['field_id']}", 'text': f"{e['name']}: {f['definition']} ({f['value_type']})"}
            for e in req.get('entities', []) for f in req.get('fields', [])]


def main(argv):
    kind, out = argv[0], argv[1]
    opt, cur = {}, None
    for a in argv[2:]:
        if a.startswith('--'): cur = a[2:]; opt[cur] = []
        elif cur: opt[cur].append(a)
    batch, seed = int(opt.get('batch', ['30'])[0]), int(opt.get('seed', ['1'])[0])
    records = [r for p in opt['results'] for r in json.load(open(p))]
    msgs = {}
    for d in opt['msgs']:
        for f in os.listdir(d):
            if f.endswith('.txt'): msgs[f[:-4]] = open(os.path.join(d, f)).read()
    samples, key = [], {}
    rng = random.Random(seed)
    for r in records:
        if r.get('status') != 'ok' or r['id'] not in msgs: continue
        k = '%08x' % rng.getrandbits(32)
        while k in key: k = '%08x' % rng.getrandbits(32)
        key[k] = {'run': r['run'], 'id': r['id']}
        s = {'key': k, 'message': redact(msgs[r['id']]), 'answer': redact(r.get('final') or '')}
        if kind == 'connected': s['items'] = request_items(msgs[r['id']])
        samples.append(s)
    rng.shuffle(samples)
    os.makedirs(out, exist_ok=True)
    for i in range(0, len(samples), batch):
        json.dump({'kind': kind, 'samples': samples[i:i + batch]}, open(os.path.join(out, f'packet-{i // batch + 1:02d}.json'), 'w'), indent=1)
    json.dump(key, open(os.path.join(out, 'KEY.json'), 'w'), indent=1)
    shutil.copy(os.path.join(HERE, 'RATER_INSTRUCTIONS.md'), os.path.join(out, 'RATER_INSTRUCTIONS.md'))
    print(len(samples), 'samples in', -(-len(samples) // batch), 'packets ->', out)


if __name__ == '__main__':
    main(sys.argv[1:])
