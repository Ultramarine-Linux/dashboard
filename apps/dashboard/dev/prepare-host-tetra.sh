#!/usr/bin/env sh
set -eu

# Prepare a host-side Tetra listener for the Dashboard device-enrollment flow.
dev_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tetra_dir=$(CDPATH= cd -- "$dev_dir/../../../../tetra" && pwd)

mkdir -p "$dev_dir/certs/host-tetra/identity"
chmod 700 "$dev_dir/certs/host-tetra" "$dev_dir/certs/host-tetra/identity"

printf '%s\n' 'Host-side Tetra enrollment is now initiated by the host, not Dashboard.'
printf '%s\n' 'Start Dashboard, then run:'
printf '%s\n' "cargo run --manifest-path $tetra_dir/Cargo.toml -- enroll --dashboard-url http://127.0.0.1:3000 --verification-url http://127.0.0.1:3000 --agent-url wss://host.containers.internal:7781 --listen 0.0.0.0:7781 --display-name host-tetra --insecure"
printf '%s\n' ''
printf '%s\n' 'Approve the printed device code in Dashboard. After approval, start the listener with:'
printf '%s\n' "cargo run --manifest-path $tetra_dir/Cargo.toml -- agent-ws-serve --listen 0.0.0.0:7781 --identity-dir $dev_dir/certs/host-tetra/identity --tls-cert $dev_dir/certs/host-tetra/tetra.crt --tls-key $dev_dir/certs/host-tetra/tetra.key"
