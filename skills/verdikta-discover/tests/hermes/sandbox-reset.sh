#!/bin/bash
# usage: sandbox-reset.sh TAG   (run as root: the sandbox runs as root, so its persistent folders are root-owned on the host)
# Gives the next evaluation session a fresh Docker sandbox. Hermes' ephemeral mode (terminal.container_persistent: false)
# mounts an empty tmpfs over /home, which breaks the in-sandbox browser (tools/environments/docker.py), so the round runs
# in persistent mode and resets between sessions instead:
#   1. stop and remove the hermes-* sandbox containers (their /tmp and image layer hold only that session's scratch);
#   2. move the persistent sandbox folders (the container's /root and /workspace) to ~/eval/trash/sandboxes/TAG/,
#      so anything the agent wrote is kept as evidence. Nothing under ~/eval/trash is ever deleted by this harness.
set -eu
TAG=${1:?usage: sandbox-reset.sh TAG}
H=/home/hermes
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
ids=$(docker ps -aq --filter name=hermes-)
[ -n "$ids" ] && { docker stop -t 5 $ids >/dev/null; docker rm $ids >/dev/null; }
SRC=$H/.hermes/sandboxes/docker
if [ -d "$SRC" ] && [ -n "$(ls -A "$SRC")" ]; then
  DEST=$H/eval/trash/sandboxes/$TAG
  [ -e "$DEST" ] && [ -n "$(ls -A "$DEST")" ] && { echo "refused: $DEST is not empty"; exit 1; }
  mkdir -p "$DEST"
  mv "$SRC"/* "$DEST"/
  chown -R hermes:hermes "$DEST"   # readable evidence for the hermes user; nothing is deleted
fi
echo "sandbox reset ($TAG): containers $(echo $ids | wc -w), folders moved"
