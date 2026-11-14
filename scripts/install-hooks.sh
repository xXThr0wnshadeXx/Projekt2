#!/usr/bin/env bash
# Run once per clone, on every machine:  bash scripts/install-hooks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x .githooks/* 2>/dev/null || true
git config core.hooksPath .githooks
echo "Hooks installed (core.hooksPath = .githooks)."
echo "Active: commit-msg (message shape), pre-commit (credentials)."
