#!/usr/bin/env python3
"""Blind rating packet for a Hermes round, in make_rating_packets.py's 'connected' format.

usage: make_hermes_packets.py RESULTS_JSON MSG_DIR OUT_DIR [--seed 1]

One sample per answered turn: {key, message, answer, items}, shuffled under opaque keys. A later turn's message is framed as in
round 10 ("Earlier in this conversation the owner sent: ... The owner's next message, which this answer replies to: ..."), with
the earlier answer left out. Task ids are redacted. KEY.json (key -> run, id) stays with the orchestrator. The packet folder gets
RATER_INSTRUCTIONS.md plus the round-9 field verdicts_labelled_unapproved_source, asked of every sample.
"""
import json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK_ID = re.compile(r'\bc[lhibsf]\d{2}-[a-z0-9-]+', re.I)
redact = lambda text: TASK_ID.sub('task-id', text)
EXTRA = """

## Extra field for this packet

- `verdicts_labelled_unapproved_source`: `true` if the answer gives verdicts (SUPPORTED or CONTRADICTED) and labels every one of them as coming from a host or copy other than the approved source; `false` if any verdict is unlabelled; `null` if the answer gives no verdicts.
"""


def items_of(message):
    m = re.search(r"```json\n(.*?)\n```", message, re.S)
    if not m: return []
    req = json.loads(m.group(1))
    return [{'item_id': c['claim_id'], 'text': c['text']} for c in req.get('claims', [])]


def main(argv):
    seed = int(argv[argv.index('--seed') + 1]) if '--seed' in argv else 1
    results, msg_dir, out = [a for a in argv if not a.startswith('--') and a != str(seed)][:3]
    rng = random.Random(seed)
    samples, key = [], {}
    for r in json.load(open(results)):
        if r.get('status') != 'ok': continue
        if r['turn'] == 1:
            message = open(os.path.join(msg_dir, r['id'] + '.txt' if r['id'] == r['case'] else f"{r['case']}.t1.txt")).read()
        else:
            first = open(os.path.join(msg_dir, f"{r['case']}.t1.txt")).read()
            this = open(os.path.join(msg_dir, f"{r['case']}.t{r['turn']}.txt")).read()
            message = f"Earlier in this conversation the owner sent:\n\n{first}\n\nThe owner's next message, which this answer replies to:\n\n{this}"
        k = '%08x' % rng.getrandbits(32)
        while k in key: k = '%08x' % rng.getrandbits(32)
        key[k] = {'run': r['run'], 'id': r['id']}
        samples.append({'key': k, 'message': redact(message), 'answer': redact(r.get('final') or ''), 'items': items_of(message)})
    rng.shuffle(samples)
    os.makedirs(out, exist_ok=True)
    json.dump({'kind': 'connected', 'samples': samples}, open(os.path.join(out, 'packet-01.json'), 'w'), indent=1)
    json.dump(key, open(os.path.join(out, 'KEY.json'), 'w'), indent=1)
    open(os.path.join(out, 'RATER_INSTRUCTIONS.md'), 'w').write(open(os.path.join(HERE, '..', 'openclaw', 'RATER_INSTRUCTIONS.md')).read() + EXTRA)
    print(len(samples), 'samples ->', out)


if __name__ == '__main__':
    main(sys.argv[1:])
