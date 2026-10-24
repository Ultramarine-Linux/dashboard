#!/usr/bin/env bash
# Smoke-test a dashboard image:
#  - it must not run as root;
#  - without Tetra's socket, /health fails the Tetra check and nothing else,
#    so the server starts, better-sqlite3 loads for this architecture and
#    migrations apply;
#  - with a stand-in Tetra (fake-tetra.mjs), /health is OK, and SIGTERM stops
#    the container well within Podman's 10-second stop timeout even though
#    Dashboard holds a connection to Tetra;
#  - with ORIGIN set, the OIDC discovery document is served, which needs the
#    state directory to be private (Dashboard keeps its auth secret there);
#  - a blank ORIGIN (an unconfigured hostname) still starts.
# Each runs once as the image's user and once as an arbitrary UID, as the
# Quadlet does.
set -euo pipefail

image=$1
scripts=$(cd "$(dirname "$0")" && pwd)
names=()
files=()

user=$(podman image inspect --format '{{.Config.User}}' "$image")
echo "User: ${user:-<unset>}"
case "${user%%:*}" in
'' | 0 | root)
	echo "::error::The image runs as root" >&2
	exit 1
	;;
esac

tetra_dir=$(mktemp -d)
chmod 755 "$tetra_dir"
node "$scripts/fake-tetra.mjs" "$tetra_dir/tetra.sock" &
tetra_pid=$!
cleanup() {
	for name in "${names[@]}"; do podman rm -f "$name" >/dev/null 2>&1 || true; done
	rm -f "${files[@]}"
	kill "$tetra_pid" 2>/dev/null || true
	rm -rf "$tetra_dir"
}
trap cleanup EXIT
for _ in $(seq 1 20); do
	[ -S "$tetra_dir/tetra.sock" ] && break
	sleep 0.2
done
if [ ! -S "$tetra_dir/tetra.sock" ]; then
	echo "::error::The stand-in Tetra did not start" >&2
	exit 1
fi

# get URL WANT_STATUS BODY_FILE: retry until URL answers WANT_STATUS (the
# server may still be starting); print the last status.
get() {
	local url=$1 want=$2 file=$3 status=000
	for _ in $(seq 1 30); do
		status=$(curl -s --max-time 10 -o "$file" -w '%{http_code}' "$url" || true)
		[ "$status" = "$want" ] && break
		sleep 1
	done
	echo "$status"
}

# smoke NAME EXPECTED_STATUS EXPECTED_BODY OIDC [podman run options...]
# OIDC is the expected status of the OIDC discovery document, or - to skip it.
smoke() {
	local name=$1 want_status=$2 want_body=$3 want_oidc=$4
	shift 4
	names+=("$name")
	podman run -d --replace --name "$name" -p 127.0.0.1::3972 "$@" "$image" >/dev/null
	local port status body file
	port=$(podman port "$name" 3972 | head -n1 | cut -d: -f2)
	file=$(mktemp)
	files+=("$file")
	status=$(get "http://127.0.0.1:${port}/health" "$want_status" "$file")
	body=$(cat "$file")
	echo "$name: /health: HTTP $status: $body"
	if [ "$status" != "$want_status" ] || [ "$body" != "$want_body" ]; then
		podman logs "$name"
		exit 1
	fi

	if [ "$want_oidc" != - ]; then
		status=$(get "http://127.0.0.1:${port}/api/auth/.well-known/openid-configuration" \
			"$want_oidc" "$file")
		echo "$name: OIDC discovery: HTTP $status"
		if [ "$status" != "$want_oidc" ]; then
			cat "$file"
			podman logs "$name"
			exit 1
		fi
	fi

	local started elapsed
	started=$(date +%s)
	podman stop --time 10 "$name" >/dev/null
	elapsed=$(($(date +%s) - started))
	echo "$name: stopped in ${elapsed}s"
	if [ "$elapsed" -ge 8 ]; then
		echo "::error::$name took ${elapsed}s to stop" >&2
		podman logs "$name"
		exit 1
	fi
	podman rm "$name" >/dev/null
}

# Like the Quadlet's mount of the host's state directory: private, and owned
# by the user the container runs as (U).
state=(--tmpfs '/var/lib/ultramarine-dashboard:rw,mode=0700,U')
socket=(-v "$tetra_dir:/run/tetra:ro")
if [ "$(getenforce 2>/dev/null || true)" = Enforcing ]; then
	# The stand-in's socket has the host's label; see dashboard/dev.
	socket+=(--security-opt label=disable)
fi
origin=(-e ORIGIN=http://localhost:3972)

smoke no-tetra 503 'tetra: failed' -
smoke no-tetra-uid 503 'tetra: failed' - --user 300:300 "${state[@]}"
smoke tetra 200 OK 200 "${socket[@]}" "${origin[@]}"
smoke tetra-uid 200 OK 200 --user 300:300 "${state[@]}" "${socket[@]}" "${origin[@]}"
# Until the hostname is set, Tetra's EnvironmentFile may carry `ORIGIN=`.
smoke blank-origin 200 OK 503 "${socket[@]}" -e ORIGIN=
