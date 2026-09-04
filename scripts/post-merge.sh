#!/bin/bash
set -e

# Post-merge runs with stdin closed. CI mode makes pnpm approve its
# non-interactive modules-directory cleanup instead of waiting for a prompt.
export CI=true
pnpm install --frozen-lockfile
pnpm --filter db push
