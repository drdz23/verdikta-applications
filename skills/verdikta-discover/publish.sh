#!/usr/bin/env bash
# Build a clean bundle of verdikta-discover for ClawHub publishing.
# Usage: ./publish.sh [--dry-run]
#
# Stages only what the skill needs into a temporary directory: SKILL.md,
# CHANGELOG.md, _meta.json, package.json and package-lock.json, references/, scripts/ (with
# the self-contained preview.bundle.mjs and its third-party notices),
# templates/, schemas/ and examples/. Leaves out tests/ (evaluation records and
# prompt-injection test pages) and node_modules/. Then runs clawhub publish.
#
# The version is _meta.json's; package.json must carry the same one, and
# CHANGELOG.md must have a "## <version>" entry, which becomes the release notes.
#
# --dry-run stages and lists the files, then runs `clawhub publish --dry-run`:
# the CLI hashes the files locally and asks the registry which version it would
# publish. No file is uploaded.

set -euo pipefail

REQUIRED_VERSION="0.23.1"

if ! command -v clawhub >/dev/null 2>&1; then
  echo "Error: ClawHub CLI not found. Run: npm install -g clawhub@latest" >&2
  exit 1
fi

INSTALLED_VERSION="$(clawhub --cli-version 2>/dev/null | tail -n1)"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$INSTALLED_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  echo "Error: ClawHub CLI $REQUIRED_VERSION or newer is required."
  echo "Installed: $INSTALLED_VERSION"
  echo "Run: npm install -g clawhub@latest"
  exit 1
fi

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=""

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
fi

VERSION="$(node -p 'require(process.argv[1]).version' "$SKILL_DIR/_meta.json")"
PACKAGE_VERSION="$(node -p 'require(process.argv[1]).version' "$SKILL_DIR/package.json")"
if [[ "$VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "Error: _meta.json version $VERSION differs from package.json version $PACKAGE_VERSION." >&2
  exit 1
fi

# Publish only a committed revision, so the release matches a reviewable commit.
if git -C "$SKILL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git -C "$SKILL_DIR" diff --quiet HEAD -- . || [[ -n "$(git -C "$SKILL_DIR" ls-files --others --exclude-standard -- .)" ]]; then
    if [[ -n "$DRY_RUN" ]]; then
      echo "Warning: uncommitted changes in $SKILL_DIR; a real publish would stop here." >&2
    else
      echo "Error: uncommitted changes in $SKILL_DIR. Commit and review them first." >&2
      exit 1
    fi
  fi
fi

# This version's CHANGELOG.md entry, without its heading, is the release's changelog text.
CHANGELOG="$(awk -v v="$VERSION" '/^## /{p = ($2 == v); next} p' "$SKILL_DIR/CHANGELOG.md" | sed -e '/./,$!d')"
if [[ -z "$CHANGELOG" ]]; then
  if [[ -n "$DRY_RUN" ]]; then
    echo "Warning: CHANGELOG.md has no entry for $VERSION; a real publish would stop here." >&2
  else
    echo "Error: CHANGELOG.md has no '## $VERSION' entry." >&2
    exit 1
  fi
fi

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/verdikta-discover-stage.XXXXXX")"
trap 'rm -rf "${STAGE_DIR:?}"' EXIT
mkdir -p "$STAGE_DIR/references" "$STAGE_DIR/scripts" "$STAGE_DIR/templates" "$STAGE_DIR/schemas" "$STAGE_DIR/examples"

cp "$SKILL_DIR/SKILL.md" "$SKILL_DIR/CHANGELOG.md" "$SKILL_DIR/_meta.json" "$SKILL_DIR/package.json" "$SKILL_DIR/package-lock.json" "$STAGE_DIR/"
cp "$SKILL_DIR"/references/*.md "$STAGE_DIR/references/"
cp "$SKILL_DIR"/scripts/*.mjs "$SKILL_DIR/scripts/preview.bundle.NOTICES.txt" "$STAGE_DIR/scripts/"
cp "$SKILL_DIR"/templates/*.json "$STAGE_DIR/templates/"
cp "$SKILL_DIR"/schemas/*.json "$STAGE_DIR/schemas/"
cp "$SKILL_DIR"/examples/*.json "$SKILL_DIR"/examples/*.txt "$STAGE_DIR/examples/"

echo "Staged files:"
find "$STAGE_DIR" -type f | sort | sed "s|$STAGE_DIR/||"
echo ""
echo "Total: $(find "$STAGE_DIR" -type f | wc -l | tr -d ' ') files"

PUBLISH_ARGS=("$STAGE_DIR" --slug verdikta-discover --name "Verdikta Discover" --version "$VERSION" --tags latest)
[[ -n "$CHANGELOG" ]] && PUBLISH_ARGS+=(--changelog "$CHANGELOG")

if [[ -n "$DRY_RUN" ]]; then
  echo ""
  clawhub publish "${PUBLISH_ARGS[@]}" --dry-run
  echo "[dry-run] Nothing was uploaded."
  exit 0
fi

clawhub publish "${PUBLISH_ARGS[@]}"
echo "Published; the staging directory is removed on exit."
