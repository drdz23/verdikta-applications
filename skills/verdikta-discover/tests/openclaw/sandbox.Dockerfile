# Sandbox image for the shell condition (round 2): Node from the pinned base image, a non-root user, kept alive for
# OpenClaw's sandboxed tool calls. No package installs, so the build needs no network:
#   docker build -t vdisc-sandbox:node22 - < sandbox.Dockerfile
# OpenClaw's own default sandbox image has no Node; the preview bundle needs only Node.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
USER node
WORKDIR /home/node
CMD ["sleep", "infinity"]
