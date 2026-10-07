#!/bin/bash
# usage: run-round.sh PLAN_JSON MSG_DIR LOCAL_OUT_DIR
# Runs a pre-registered Hermes round from the operator's machine against vps-hermes-agent, one session at a time, in the
# plan's order. Per session:
#   1. as root, sandbox-reset.sh <tag>-pre: a fresh Docker sandbox (earlier sandbox folders are moved to ~hermes/eval/trash),
#      then a restart of the eval gateway so it holds no reference to a removed container;
#   2. as hermes, hturn.py for each turn over the loopback API server (the first creates the session and refuses an id that
#      already exists, so a tag can never continue an old conversation);
#   3. as hermes, hdump.py: the session's stored messages and tool calls, from state.db opened read-only;
#   4. as root, sandbox-reset.sh <tag>: whatever the agent left in its sandbox is kept under that tag as evidence.
# Then copies the round directory back. Never deletes anything; never re-runs a session whose dump exists.
set -u
PLAN=$1; MSGS=$2; OUT=$3; BOX=vps-hermes-agent
ROUND=$(basename "$OUT"); RUN=/home/hermes/eval/rounds/$ROUND
ASH="cd $RUN && runuser -u hermes -- env -i HOME=/home/hermes USER=hermes LANG=C.UTF-8 XDG_RUNTIME_DIR=/run/user/1001 PATH=/home/hermes/.local/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$OUT"
ssh -n $BOX "mkdir -p $RUN/msgs" && scp -q "$MSGS"/*.txt "$PLAN" $BOX:$RUN/msgs/ && ssh -n $BOX "chown -R hermes:hermes /home/hermes/eval/rounds"
python3 -c 'import json, sys; [print(p["tag"], *p["turns"]) for p in json.load(open(sys.argv[1]))]' "$PLAN" | while read -r TAG TURNS; do
  if ssh -n $BOX "test -s $RUN/$TAG.dump.json"; then echo "$TAG: already run, skipped"; continue; fi
  ssh -n $BOX "/root/sandbox-reset.sh $ROUND-$TAG-pre" >/dev/null
  # A fresh gateway for every session: the running gateway keeps a reference to the container the reset removed, and its
  # browser then fails with "No such container" (Hermes round 1, first pass).
  ssh -n $BOX "$ASH /home/hermes/eval/gw-restart.sh" | tail -1
  n=0; flag=--new
  for f in $TURNS; do
    n=$((n + 1)); s=$(date +%s)
    ssh -n $BOX "$ASH python3 /home/hermes/eval/hturn.py $TAG msgs/$f $TAG-t$n.json $flag" 2>&1 | tail -1
    echo "{\"tag\":\"$TAG\",\"turn\":$n,\"start\":$s,\"end\":$(date +%s)}" >> "$OUT/timing.jsonl"
    flag=
  done
  ssh -n $BOX "$ASH python3 /home/hermes/eval/hdump.py $TAG $TAG.dump.json" 2>&1 | tail -1
  ssh -n $BOX "/root/sandbox-reset.sh $ROUND-$TAG" >/dev/null
done
rsync -a $BOX:$RUN/ "$OUT/"
echo DONE > "$OUT/DONE"
