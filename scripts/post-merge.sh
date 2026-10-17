#!/usr/bin/env bash
set -euo pipefail

pnpm install --frozen-lockfile

# The Campnect API uses its legacy SQL bootstrap and compatibility migrations
# at startup. The workspace Drizzle schema is scaffold support, not the source
# of truth for this existing database. Do not run `drizzle-kit push` here:
# against the legacy tables it proposes destructive drops and requires a TTY
# confirmation, which post-merge setup does not have.
pnpm run typecheck
