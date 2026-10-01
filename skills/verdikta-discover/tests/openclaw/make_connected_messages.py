#!/usr/bin/env python3
"""Build one model-input message per connected-agent case at a pinned fixture commit.

usage: make_connected_messages.py CASES_JSON OUT_DIR --commit SHA [--truth GROUND_TRUTH_JSON] [--base-cases AUTHORED_CASES_JSON]
       make_connected_messages.py CASES_JSON --requests-only [--commit SHA]   (print id -> request JSON)

Requests are expanded from item facts in connected-ground-truth.json: claim text and field
definitions come from the authored fixtures, and every source URL is a public raw GitHub URL
under test-fixtures/discover-connected/ at the pinned commit (no task content ever appears in a URL;
pins from round 1 resolve to their old location through defaults.legacy_bases).
A case with "source_redirect" gets the github.com/.../raw/ form of its one source, which
answers with a redirect to a different origin. Expected labels and ground truth are never
written to messages. Cases with request null (sensitive-data probes) get the prompt and owner
context only. A holdout case (source_case) inherits request, labels and metrics from its source case in
--base-cases (default: connected-cases.json next to this package's tests).
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = os.path.dirname(HERE)
PLACEHOLDER_COMMIT = "0" * 40


def expand_request(case, cases_doc, truth, commit):
    r = case.get("request")
    if r is None:
        return None
    d = cases_doc["defaults"]
    d = {**d, **(d.get("legacy_bases") or {}).get(commit, {})}  # a pin from before the fixtures moved keeps its old paths
    base = d["fixture_base"].format(COMMIT=commit)
    rbase = d["redirect_base"].format(COMMIT=commit)
    paths = r["source_paths"]
    sources = [(rbase if r.get("source_redirect") else base) + p for p in paths]
    req = {"schema_version": "1.0.0", "task_id": r["task_id"], "fixture_only": False,
           "data_classification": "PUBLIC_NON_SENSITIVE",
           "source_policy": {"mode": d["mode"], "allowed_sources": sources, "version_scope": r["version_scope"],
                             "as_of": d["as_of"], "minimum_locations_per_item": d["minimum_locations_per_item"],
                             "max_search_actions_per_item": d["max_search_actions_per_item"],
                             "access_failure_policy": "LOG_LIMITATION_DO_NOT_FABRICATE"}}
    if r["template_id"] == "source-check-v1":
        req["claims"] = [{"claim_id": i["item_id"], "text": truth["claims"][i["fact"]]["text"]} for i in r["items"]]
    else:
        req["entities"] = [{"entity_id": e, "name": truth["pack"][e]["name"]} for e in r["entities"]]
        req["fields"] = [{"field_id": f, "definition": truth["field_defs"][f]["definition"],
                          "value_type": truth["field_defs"][f]["value_type"]} for f in r["fields"]]
    return req


def build_message(case, req):
    parts = [case["prompt"]]
    if case.get("owner_context"):
        parts.append("Owner context: " + case["owner_context"])
    if req is not None:
        parts.append("Attached request (request.json):\n```json\n" + json.dumps(req, indent=2) + "\n```")
    return "\n\n".join(parts) + "\n"


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {argv[i]: argv[i + 1] for i, a in enumerate(argv) if a in ("--commit", "--truth", "--base-cases") and i + 1 < len(argv)}
    flag_values = set(flags.values())
    args = [a for a in args if a not in flag_values]
    cases_path = args[0]
    cases_doc = json.load(open(cases_path))
    base_doc = json.load(open(flags.get("--base-cases", os.path.join(TESTS, "connected-cases.json"))))
    cases_doc.setdefault("defaults", base_doc["defaults"])
    truth = json.load(open(flags.get("--truth", os.path.join(TESTS, "connected-ground-truth.json"))))
    commit = flags.get("--commit", PLACEHOLDER_COMMIT)
    if "--requests-only" in argv:
        print(json.dumps({c["id"]: expand_request(c, cases_doc, truth, commit) for c in cases_doc["cases"]}))
        return
    out_dir = args[1]
    if len(commit) != 40:
        sys.exit("--commit must be the full 40-character commit SHA the fixtures are pinned to")
    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    for c in cases_doc["cases"]:
        src = c.get("source_case")
        base = next(x for x in base_doc["cases"] + cases_doc["cases"] if x["id"] == src) if src else c
        req = expand_request(base, cases_doc, truth, commit)
        open(os.path.join(out_dir, c["id"] + ".txt"), "w").write(build_message(c, req))
        exp = c.get("expected") or base["expected"]
        manifest.append({"id": c["id"], "group": c["group"], "source_case": src,
                         "expected_decision": exp["decision"], "expected_outcome": exp["outcome"],
                         "expected_template": exp.get("template"), "metrics": c.get("metrics") or base.get("metrics")})
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    print(len(manifest), "messages in", out_dir, "pinned to", commit)


if __name__ == "__main__":
    main(sys.argv[1:])
