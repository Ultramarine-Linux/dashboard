#!/usr/bin/env sh
set -eu

# Lightweight stack health check. Browser-level enrollment is intentionally
# separate because it requires an authenticated Dashboard administrator.

printf '%s\n' 'Checking PostgreSQL...'
podman compose --env-file .env exec -T postgres pg_isready -U postgres -d ultramarine

printf '%s\n' 'Checking Dashboard HTTP endpoint...'
curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null

printf '%s\n' 'Triggering Dashboard Better Auth secret generation...'
email="integration-$(date +%s)@integration.test"
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data "{\"name\":\"Integration Smoke\",\"email\":\"${email}\",\"password\":\"integration-smoke-password\",\"rememberMe\":false}" \
  http://127.0.0.1:3000/api/auth/sign-up/email >/dev/null
podman compose --env-file .env exec -T dashboard sh -ec \
  'test -f /var/lib/ultramarine-dashboard/better-auth-secret && test "$(stat -c %a /var/lib/ultramarine-dashboard/better-auth-secret)" = 600'

printf '%s\n' 'Checking Tetra TLS listener...'
openssl s_client \
  -connect 127.0.0.1:7780 \
  -CAfile certs/ca.crt \
  -verify_return_error \
  -servername tetra \
  </dev/null >/dev/null

printf '%s\n' 'Checking authenticated Tetra WSS enrollment and command dispatch...'
podman compose --profile smoke --env-file .env run --rm wss-smoke

printf '%s\n' 'Integration services are reachable and the signed WSS path passed.'
