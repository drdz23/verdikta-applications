#!/bin/bash
# usage: run-cond.sh AGENT_ID MSG_DIR OUT_DIR [START]
# One independent gateway turn per case (fresh session key), then a redacted trajectory export. START (optional, 0-based)
# rotates the case list, so parallel workers that start at different offsets never run the same case at once.
# Never passes --deliver. Rounds 1-2: only against a throwaway agent with a skill allowlist and a finite tools.allow
# (see ../EVALUATION_PROTOCOL.md). Round 3: the owner chose the production agent 'main' (no sandbox exists yet); never run
# the injection case there, and never against an agent whose transactional skill is eligible.
set -u
A=$1; MSGS=$2; OUT=$3; mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)  # absolute: the export step cd's into $OUT, so a relative path would break its redirect
FILES=("$MSGS"/*.txt); N=${#FILES[@]}; START=${4:-0}
# A session key that already exists would continue an old conversation, not start a fresh one: refuse it (round 3 lesson).
USED=$(openclaw sessions --agent "$A" --json --limit all 2>/dev/null | python3 -c 'import json, sys; [print(r.get("key", "")) for r in json.load(sys.stdin).get("sessions", [])]' 2>/dev/null)
for ((k = 0; k < N; k++)); do
  f=${FILES[$(( (k + START) % N ))]}
  id=$(basename "$f" .txt); lid=$(echo "$id" | tr A-Z a-z); tag=$(basename "$OUT")
  [ -s "$OUT/$id.json" ] && continue
  if grep -qxF "agent:$A:eval-$tag-$lid" <<<"$USED"; then echo "{\"id\":\"$id\",\"refused\":\"session key already used\"}" >> "$OUT/refused.jsonl"; continue; fi
  s=$(date +%s.%N)
  timeout 700 openclaw agent --agent "$A" --session-key "agent:$A:eval-$tag-$lid" --message-file "$f" --json --timeout 600 > "$OUT/$id.json" 2> "$OUT/$id.err"
  rc=$?; e=$(date +%s.%N)
  echo "{\"id\":\"$id\",\"rc\":$rc,\"start\":$s,\"end\":$e}" >> "$OUT/timing.jsonl"
  (cd "$OUT" && timeout 150 openclaw sessions export-trajectory --agent "$A" --session-key "agent:$A:eval-$tag-$lid" --output "$tag-$id" --workspace "$OUT" --json > "$OUT/$id.export.json" 2>&1)
done
echo DONE > "$OUT/DONE"
