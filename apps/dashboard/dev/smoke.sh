#!/usr/bin/env sh
set -eu

# Checks /health on the running stack: the database opens, every migration is
# applied, and Tetra (the mock, or the one on the socket) answers.
url=${DASHBOARD_URL:-http://127.0.0.1:3972}

printf 'Checking %s/health...\n' "$url"
if ! body=$(curl --silent --show-error --max-time 15 --fail-with-body "$url/health"); then
  printf '%s\n' "$body" >&2
  exit 1
fi
printf '%s\n' "$body"
