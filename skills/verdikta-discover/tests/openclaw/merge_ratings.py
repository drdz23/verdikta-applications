#!/usr/bin/env python3
"""Merge rating sets (one per sample set, each split into packets) into one ratings file and one key file.

usage: merge_ratings.py OUT_DIR PREFIX=RATING_DIR [PREFIX=RATING_DIR ...]
  RATING_DIR holds KEY.json (key -> {run, id}), packet-NN.json and ratings-NN.json, as written by make_rating_packets.py and the raters.
Every packet must have a ratings file with exactly the packet's keys in the same order, and together the ratings must cover every key in KEY.json.
Keys become PREFIX:key so sets built with different seeds cannot collide. Writes OUT_DIR/ratings.json and OUT_DIR/key.json.
"""
import glob, json, os, sys


def merge(sets):
    ratings, key = [], {}
    for prefix, d in sets:
        k = json.load(open(f"{d}/KEY.json"))
        seen = set()
        packets = sorted(glob.glob(f"{d}/packet-*.json"))
        if not packets: raise SystemExit(f"{d}: no packet-NN.json files")
        for pf in packets:
            n = pf.rsplit('-', 1)[1]
            rated = json.load(open(f"{d}/ratings-{n}"))
            want = [x["key"] for x in json.load(open(pf))["samples"]]
            got = [x["key"] for x in rated]
            if want != got:
                raise SystemExit(f"{d} packet {n}: rated keys differ from packet keys (missing {sorted(set(want) - set(got))}, extra {sorted(set(got) - set(want))}) or the order differs")
            for x in rated:
                if x["key"] not in k: raise SystemExit(f"{d}: key {x['key']} is not in KEY.json")
                seen.add(x["key"])
                ratings.append({**x, "key": f"{prefix}:{x['key']}"})
        if seen != set(k): raise SystemExit(f"{d}: ratings cover {len(seen)} of {len(k)} keys")
        for a, b in k.items(): key[f"{prefix}:{a}"] = b
    if len({r["key"] for r in ratings}) != len(ratings) or len(ratings) != len(key): raise SystemExit("duplicate keys after merging")
    return ratings, key


def main(argv):
    if len(argv) < 2 or any('=' not in a for a in argv[1:]):
        sys.exit(__doc__)
    out = argv[0]
    ratings, key = merge([tuple(a.split('=', 1)) for a in argv[1:]])
    os.makedirs(out, exist_ok=True)
    json.dump(ratings, open(f"{out}/ratings.json", "w"), indent=1)
    json.dump(key, open(f"{out}/key.json", "w"), indent=1)
    print(len(ratings), "ratings merged ->", out)


if __name__ == "__main__":
    main(sys.argv[1:])
