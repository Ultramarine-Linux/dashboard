#!/usr/bin/env sh
set -eu

# Prepare a host-side Tetra listener that the containerized Dashboard enrolls
# with the one-time token from ./prepare.sh.
dev_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tetra_dir=$(CDPATH= cd -- "$dev_dir/../../../../tetra" && pwd)

(cd "$dev_dir" && ./prepare.sh)
mkdir -p "$dev_dir/certs/host-tetra/identity"
chmod 700 "$dev_dir/certs/host-tetra" "$dev_dir/certs/host-tetra/identity"

# shellcheck disable=SC1091
. "$dev_dir/.env"

printf '%s\n' 'Start the host-side Tetra listener with:'
printf '%s\n' "cargo run --manifest-path $tetra_dir/Cargo.toml -- agent-ws-serve --listen 0.0.0.0:7781 --identity-dir $dev_dir/certs/host-tetra/identity --tls-cert $dev_dir/certs/tetra.crt --tls-key $dev_dir/certs/tetra.key --enrollment-token $TETRA_ENROLLMENT_TOKEN"
