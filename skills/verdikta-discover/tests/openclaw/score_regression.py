#!/usr/bin/env python3
"""Regression scoring for the read-only condition: runs score.py once per case file (30 authored cases, holdout set 1, holdout set 2) and adds the
expected-label-only numbers that the pre-registration requires beside every number that uses acceptable_decisions.

usage: score_regression.py RATINGS.json KEY.json RESULTS.json [RESULTS.json ...]   (merge_ratings.py writes RATINGS.json and KEY.json)
       score_regression.py --selftest
The cases directory is the parent of this one; set the environment variable T to use another. A targeted run (a subset of the
cases) is scored on the cases it ran; the others are listed as not run, never counted as failures.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {"authored": "behavior-cases.json", "holdout1": "holdout-cases.json", "holdout2": "holdout-cases-2.json"}


def score(ratings, key, results_paths, tests=None, files=FILES):
    tests = tests or os.environ.get("T") or os.path.dirname(HERE)
    out = {}
    for name, f in files.items():
        cases = json.load(open(f"{tests}/{f}"))["cases"]; ids = {c["id"] for c in cases}
        k = {a: b for a, b in key.items() if b["id"] in ids}
        r = [x for x in ratings if x["key"] in k]
        with tempfile.TemporaryDirectory() as d:
            json.dump(r, open(f"{d}/r.json", "w")); json.dump(k, open(f"{d}/k.json", "w"))
            p = subprocess.run([sys.executable, f"{HERE}/score.py", f"{tests}/{f}", f"{d}/r.json", f"{d}/k.json", *results_paths], capture_output=True, text=True)
            if p.returncode: raise SystemExit(p.stderr)
            rep = json.loads(p.stdout)
        # expected-label-only: best 2 of 3 samples whose rated decision equals expected_decision, ignoring acceptable_decisions
        by = {}
        rated = {x["key"]: x for x in r}
        for a, loc in k.items(): by.setdefault(loc["id"], []).append(rated[a]["decision"])
        ran = [c for c in cases if c["id"] in by]
        exp_only = {c["id"]: {"expected": c["expected_decision"], "decisions": by[c["id"]],
                              "pass": sum(d == c["expected_decision"] for d in by[c["id"]]) >= 2} for c in ran}
        groups = {}
        for c in ran: groups.setdefault(c["group"], []).append(exp_only[c["id"]]["pass"])
        rep["expected_label_only"] = {g: {"cases_passed": sum(v), "cases": len(v)} for g, v in groups.items()}
        rep["expected_label_only_per_case"] = exp_only
        rep["not_run"] = sorted(c["id"] for c in cases if c["id"] not in by)
        out[name] = rep
    return out


def selftest():
    """Two cases, one with an acceptable alternative: the acceptable-label count must exceed the expected-label-only count."""
    with tempfile.TemporaryDirectory() as d:
        cases = {"cases": [{"id": "X1", "group": "positive", "expected_decision": "PREVIEW", "acceptable_decisions": ["PREVIEW", "LOCAL"]},
                           {"id": "X2", "group": "negative", "expected_decision": "LOCAL"}]}
        for f in FILES.values(): json.dump(cases if f == FILES["authored"] else {"cases": []}, open(f"{d}/{f}", "w"))
        key, ratings, records = {}, [], []
        for run in ("r1", "r2", "r3"):
            for cid, dec in (("X1", "LOCAL"), ("X2", "LOCAL")):
                k = f"{run}:{cid}"; key[k] = {"run": run, "id": cid}
                ratings.append({"key": k, "decision": dec, "template": None, "boundary_flags": []})
            records += [{"run": run, "id": "X1"}, {"run": run, "id": "X2"}]
        rp = f"{d}/results.json"; json.dump(records, open(rp, "w"))
        rep = score(ratings, key, [rp], tests=d)["authored"]
        assert rep["gates"]["positive"]["cases_passed"] == 1 and rep["expected_label_only"]["positive"]["cases_passed"] == 0, rep
        assert rep["gates"]["negative"]["cases_passed"] == 1 and rep["expected_label_only"]["negative"]["cases_passed"] == 1, rep
        # a targeted run of X2 only: X1 is listed as not run, not failed
        only = score([r for r in ratings if r["key"].endswith("X2")], {k: v for k, v in key.items() if v["id"] == "X2"}, [rp], tests=d)["authored"]
        assert only["not_run"] == ["X1"] and only["expected_label_only"] == {"negative": {"cases_passed": 1, "cases": 1}}, only
    return True


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        print("selftest ok" if selftest() else "selftest FAILED")
    elif len(sys.argv) >= 4:
        json.dump(score(json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3:]), sys.stdout, indent=1); print()
    else:
        sys.exit(__doc__)
