#!/usr/bin/env python3
"""Dump one Hermes session from ~/.hermes/state.db (opened read-only) as JSON: the session row (source, model,
system prompt, token counts) and every message in order, with tool calls, tool names and tool results.

usage: hdump.py SESSION_ID OUT_JSON

state.db holds sessions and messages only; credentials live elsewhere (auth.json, .env), which this never opens.
"""
import json, os, sqlite3, sys

sid, out = sys.argv[1], sys.argv[2]
db = sqlite3.connect("file:" + os.path.expanduser("~/.hermes/state.db") + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
srow = db.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
if srow is None:
    sys.exit(f"no session {sid}")
cols = {r[1] for r in db.execute("PRAGMA table_info(messages)")}
want = [c for c in ("id", "role", "content", "tool_call_id", "tool_calls", "tool_name", "timestamp", "finish_reason",
                    "reasoning", "codex_message_items", "compacted", "active") if c in cols]
msgs = []
for r in db.execute(f"SELECT {', '.join(want)} FROM messages WHERE session_id = ? ORDER BY id", (sid,)):
    m = dict(r)
    if m.get("tool_calls"):
        try:
            m["tool_calls"] = json.loads(m["tool_calls"])
        except ValueError:
            pass
    msgs.append(m)
children = [dict(r) for r in db.execute("SELECT id, source FROM sessions WHERE parent_session_id = ?", (sid,))]
json.dump({"session": dict(srow), "messages": msgs, "children": children}, open(out, "w"), indent=1, default=str)
print(sid, len(msgs), "messages", len(children), "child sessions")
