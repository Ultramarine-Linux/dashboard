#!/usr/bin/env sh
set -eu

# The dev stack now uses host-initiated Tetra device enrollment. No shared
# enrollment token or private CA is required; tetra enroll generates the host
# identity and certificate in the shared Tetra volume.
if [ ! -f .env ]; then
  : > .env
  chmod 600 .env
fi

printf '%s\n' 'Prepared Dashboard dev environment.'
printf '%s\n' 'Start Dashboard with: podman compose --env-file .env up --build -d postgres dashboard'
printf '%s\n' 'Then run ./enroll-tetra.sh and approve the displayed device code.'
