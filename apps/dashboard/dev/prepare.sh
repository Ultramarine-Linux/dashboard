#!/usr/bin/env sh
set -eu

# This directory is intentionally gitignored. It holds a development-only CA,
# Tetra server key, and a one-time enrollment token for the local integration
# stack. Do not reuse these artifacts outside this stack.
mkdir -p certs/public
chmod 700 certs
chmod 755 certs/public

if [ ! -f certs/ca.crt ] || [ ! -f certs/ca.key ]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
    -keyout certs/ca.key \
    -out certs/ca.crt \
    -days 7 \
    -subj "/CN=Ultramarine Server Integration CA"
fi

if [ ! -f certs/tetra.crt ] || [ ! -f certs/tetra.key ] \
  || ! openssl x509 -in certs/tetra.crt -noout -text | grep -q 'DNS:tetra-smoke'; then
  rm -f certs/tetra.crt certs/tetra.key
  openssl req -newkey rsa:2048 -nodes \
    -keyout certs/tetra.key \
    -out certs/tetra.csr \
    -subj "/CN=tetra"
  printf 'subjectAltName=DNS:tetra,DNS:tetra-smoke,DNS:localhost,IP:127.0.0.1\n' > certs/tetra.ext
  openssl x509 -req \
    -in certs/tetra.csr \
    -CA certs/ca.crt \
    -CAkey certs/ca.key \
    -CAcreateserial \
    -out certs/tetra.crt \
    -days 7 \
    -sha256 \
    -extfile certs/tetra.ext
  rm -f certs/tetra.ext certs/tetra.csr certs/ca.srl
fi

chmod 600 certs/*.key
chmod 644 certs/*.crt
cp certs/ca.crt certs/public/ca.crt
chmod 644 certs/public/ca.crt

if [ ! -f .env ]; then
  token=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
  printf 'TETRA_ENROLLMENT_TOKEN=%s\n' "$token" > .env
  chmod 600 .env
  printf '%s\n' "Generated TETRA_ENROLLMENT_TOKEN in dev/.env"
fi

printf '%s\n' "Integration CA: dev/certs/ca.crt"
