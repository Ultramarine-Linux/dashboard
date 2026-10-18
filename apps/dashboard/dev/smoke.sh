#!/usr/bin/env sh
set -eu

# Lightweight stack health check. Connecting Dashboard to Tetra is
# intentionally separate because it requires an authenticated Dashboard user.

printf '%s\n' 'Checking Dashboard HTTP endpoint...'
curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null

printf '%s\n' 'Checking Dashboard SQLite database...'
podman compose --env-file .env exec -T dashboard sh -ec \
  'test -f /var/lib/ultramarine-dashboard/dashboard.db'

printf '%s\n' 'Checking Tetra TLS listener...'
openssl s_client \
  -connect 127.0.0.1:7780 \
  -CAfile certs/ca.crt \
  -verify_return_error \
  -servername tetra \
  </dev/null >/dev/null

printf '%s\n' 'Dashboard and Tetra are reachable. Connect them from the Dashboard setup page.'
