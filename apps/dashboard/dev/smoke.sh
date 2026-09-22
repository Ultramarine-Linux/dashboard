#!/usr/bin/env sh
set -eu

printf '%s\n' 'Checking PostgreSQL...'
podman compose --env-file .env exec -T postgres pg_isready -U postgres -d ultramarine

printf '%s\n' 'Checking Dashboard HTTP endpoint...'
curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null

printf '%s\n' 'Checking device enrollment endpoint...'
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"display_name":"smoke-host","hostname":"smoke-host","agent_url":"wss://tetra:7780","host_public_key":"c21tb2tlLWhvc3Qta2V5","tls_ca_certificate":""}' \
  http://127.0.0.1:3000/api/tetra/device >/tmp/tetra-device-response.json

grep -q 'device_code' /tmp/tetra-device-response.json
grep -q 'user_code' /tmp/tetra-device-response.json
rm -f /tmp/tetra-device-response.json

printf '%s\n' 'Device enrollment API is reachable. Run ./enroll-tetra.sh for the full approval flow.'
