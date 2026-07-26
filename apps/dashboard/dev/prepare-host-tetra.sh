#!/usr/bin/env sh
set -eu

# Resolve the Dashboard dev directory even when this script is invoked by path.
dev_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tetra_dir=$(CDPATH= cd -- "$dev_dir/../../tetra" && pwd)
reset_controller=false
if [ "${1:-}" = "--reset-controller" ]; then
  reset_controller=true
elif [ "${1:-}" != "" ]; then
  printf '%s\n' 'Usage: ./prepare-host-tetra.sh [--reset-controller]' >&2
  exit 2
fi

# Prepare credentials for a Tetra process running on the development machine.
# This uses a separate certificate and identity directory from container Tetra,
# so either development mode can be used without overwriting enrollment state.
mkdir -p "$dev_dir/certs/host-tetra/public"
chmod 700 "$dev_dir/certs/host-tetra" "$dev_dir/certs/host-tetra/public"

if [ ! -f "$dev_dir/certs/ca.crt" ] || [ ! -f "$dev_dir/certs/ca.key" ]; then
  printf '%s\n' 'Run ./prepare.sh first so the development CA exists.' >&2
  exit 1
fi

if [ ! -f "$dev_dir/certs/host-tetra/tetra.crt" ] || [ ! -f "$dev_dir/certs/host-tetra/tetra.key" ]; then
  openssl req -newkey rsa:2048 -nodes \
    -keyout "$dev_dir/certs/host-tetra/tetra.key" \
    -out "$dev_dir/certs/host-tetra/tetra.csr" \
    -subj '/CN=host.containers.internal'
  printf 'subjectAltName=DNS:host.containers.internal,DNS:localhost,IP:127.0.0.1\n' > "$dev_dir/certs/host-tetra/tetra.ext"
  openssl x509 -req \
    -in "$dev_dir/certs/host-tetra/tetra.csr" \
    -CA "$dev_dir/certs/ca.crt" \
    -CAkey "$dev_dir/certs/ca.key" \
    -CAcreateserial \
    -out "$dev_dir/certs/host-tetra/tetra.crt" \
    -days 7 \
    -sha256 \
    -extfile "$dev_dir/certs/host-tetra/tetra.ext"
  rm -f "$dev_dir/certs/host-tetra/tetra.ext" "$dev_dir/certs/host-tetra/tetra.csr" "$dev_dir/certs/ca.srl"
fi

chmod 600 "$dev_dir/certs/host-tetra/tetra.key"
chmod 644 "$dev_dir/certs/host-tetra/tetra.crt"

if [ ! -f "$dev_dir/.env" ]; then
  printf '%s\n' 'Run ./prepare.sh first so the enrollment token exists.' >&2
  exit 1
fi

token=$(sed -n 's/^TETRA_ENROLLMENT_TOKEN=//p' "$dev_dir/.env")
if [ -z "$token" ]; then
  printf '%s\n' 'TETRA_ENROLLMENT_TOKEN is missing from dev/.env.' >&2
  exit 1
fi

if [ "$reset_controller" = true ]; then
  rm -f "$dev_dir/certs/host-tetra/identity/controller-ed25519-public.key"
  printf '%s\n' 'Removed the host-Tetra controller enrollment. The next start accepts the one-time token.'
fi

if [ -f "$dev_dir/certs/host-tetra/identity/controller-ed25519-public.key" ]; then
  printf '%s\n' 'WARNING: host Tetra is already enrolled. Use --reset-controller before restarting if Dashboard must enroll a new controller.' >&2
fi

printf '%s\n' 'Host Tetra credentials prepared.'
if command -v ss >/dev/null 2>&1 && ss -ltn | grep -q ':7781 '; then
  printf '%s\n' 'WARNING: port 7781 is already in use. Stop the old host-Tetra process before starting the command below.' >&2
  printf '%s\n' 'The enrollment token is one-time and changes when dev/.env is regenerated.' >&2
fi
printf '%s\n' ''
printf '%s\n' 'Start (or restart) Tetra from the tetra checkout with:'
printf '%s\n' "cargo run --manifest-path $tetra_dir/Cargo.toml --release --no-default-features --features files,recipes,selinux,services,quadlets,reverse-proxy,podman,samba,nfs,users,virtual-machines -- agent-ws-serve --listen 0.0.0.0:7781 --identity-dir $dev_dir/certs/host-tetra/identity --tls-cert $dev_dir/certs/host-tetra/tetra.crt --tls-key $dev_dir/certs/host-tetra/tetra.key --enrollment-token $token"
printf '%s\n' ''
printf '%s\n' 'Start Dashboard setup and submit the server domain.'
printf '%s\n' 'Dashboard will automatically discover and enroll this local endpoint:'
printf '%s\n' '  wss://host.containers.internal:7781'
printf '%s\n' 'Do not use Hosts → Register Host for this flow; that screen is for manual remote enrollment.'
