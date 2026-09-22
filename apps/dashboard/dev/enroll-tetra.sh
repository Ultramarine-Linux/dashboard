#!/usr/bin/env sh
set -eu

# Host-initiated enrollment for the containerized integration Tetra.
# Dashboard does not generate or push the controller key in this flow.

podman compose --env-file .env --profile enroll run --rm tetra-enroller

printf '%s\n' 'Enrollment approved. Starting the enrolled Tetra listener...'
podman compose --env-file .env --profile tetra up -d tetra
