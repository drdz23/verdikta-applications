#!/bin/bash
# usage: run-cond.sh AGENT_ID MSG_DIR OUT_DIR
# One independent gateway turn per case (fresh session key), then a redacted trajectory export.
# Never passes --deliver. Run only against a throwaway agent with a skill allowlist and a finite
# tools.allow (see ../EVALUATION_PROTOCOL.md); never against an agent that has a signer.
set -u
A=$1; MSGS=$2; OUT=$3; mkdir -p "$OUT"
for f in "$MSGS"/*.txt; do
  id=$(basename "$f" .txt); lid=$(echo "$id" | tr A-Z a-z); tag=$(basename "$OUT")
  [ -s "$OUT/$id.json" ] && continue
  s=$(date +%s.%N)
  timeout 700 openclaw agent --agent "$A" --session-key "agent:$A:eval-$tag-$lid" --message-file "$f" --json --timeout 600 > "$OUT/$id.json" 2> "$OUT/$id.err"
  rc=$?; e=$(date +%s.%N)
  echo "{\"id\":\"$id\",\"rc\":$rc,\"start\":$s,\"end\":$e}" >> "$OUT/timing.jsonl"
  (cd "$OUT" && timeout 150 openclaw sessions export-trajectory --agent "$A" --session-key "agent:$A:eval-$tag-$lid" --output "$tag-$id" --workspace "$OUT" --json > "$OUT/$id.export.json" 2>&1)
done
echo DONE > "$OUT/DONE"
