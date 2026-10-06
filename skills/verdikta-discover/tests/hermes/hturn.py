#!/usr/bin/env python3
"""Send one turn to a Hermes gateway session over the loopback API server (POST /api/sessions/{id}/chat).

usage: hturn.py SESSION_ID MESSAGE_FILE OUT_JSON [--new]
  --new         create SESSION_ID first (POST /api/sessions); refuse if it already exists, because an existing
                session would continue an old conversation (the round-3 lesson from run-cond.sh)
  without --new the session must already exist (a later turn of the same conversation)

Gateway sessions get Hermes' interactive skills guidance; `hermes -z` one-shots get a weaker one
(agent/oneshot_footprint.py), so evaluation turns go through the gateway. The key is read from
~/eval/api-server.conf (a test credential generated on the box; the API server binds 127.0.0.1 only).
Writes {"session_id", "status", "elapsed_s", "response"} to OUT_JSON. No retries.
"""
import json, os, sys, time, urllib.error, urllib.request

BASE = "http://127.0.0.1:8642"


def key():
    for line in open(os.path.expanduser("~/eval/api-server.conf")):
        if line.startswith("API_SERVER_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("no API_SERVER_KEY in ~/eval/api-server.conf")


def call(method, path, body=None, timeout=60):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw.decode("utf-8", "replace")


def main(argv):
    flags = [a for a in argv if a.startswith("--")]
    sid, msg_file, out = [a for a in argv if not a.startswith("--")]
    if "--new" in flags:
        status, _ = call("GET", f"/api/sessions/{sid}")
        if status == 200:
            sys.exit(f"refused: session {sid} already exists")
        status, body = call("POST", "/api/sessions", {"id": sid, "title": sid})
        if status not in (200, 201):
            sys.exit(f"session create failed: {status} {body}")
    else:
        status, _ = call("GET", f"/api/sessions/{sid}")
        if status != 200:
            sys.exit(f"session {sid} does not exist")
    text = open(msg_file, encoding="utf-8").read()
    start = time.time()
    status, body = call("POST", f"/api/sessions/{sid}/chat", {"input": text}, timeout=1500)
    json.dump({"session_id": sid, "status": status, "elapsed_s": round(time.time() - start, 1), "response": body},
              open(out, "w"), indent=1)
    print(sid, status, round(time.time() - start, 1), "s")


if __name__ == "__main__":
    main(sys.argv[1:])
