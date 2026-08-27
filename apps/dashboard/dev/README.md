# Dashboard + Tetra integration stack

This stack tests Dashboard's host-initiated Tetra enrollment flow. Tetra is
not enrolled by Dashboard automatically and the stack does not use a shared
one-time enrollment token.

## Start

```sh
cd apps/dashboard/dev
./prepare.sh
podman compose --env-file .env up --build -d postgres dashboard
```

Open `http://127.0.0.1:3000`, create the first Dashboard account, then run:

```sh
./enroll-tetra.sh
```

The helper starts a one-shot Tetra enrollment container. It prints a device
verification URL and code. Open the URL in Dashboard, sign in, and approve the
host. Once approval completes, the helper starts the enrolled Tetra listener.

The containerized Tetra endpoint is `wss://tetra:7780` from Dashboard. The
host identity and controller public key are stored in the shared `tetra-state`
volume. No enrollment token is mounted into Dashboard, and no host port
forwarding is needed for this internal integration path.

## Smoke check

```sh
./smoke.sh
```

The smoke check verifies PostgreSQL, Dashboard, and the device enrollment API.
The full device approval still requires an authenticated Dashboard browser
session.

## Host Tetra mode

To run Tetra from the development machine instead of the container, use the
host override and provide the Dashboard URL to `tetra enroll` directly:

```sh
podman compose -f compose.yaml -f compose.host-tetra.yaml --env-file .env \
  up --build --scale tetra=0 postgres dashboard-host

cargo run --manifest-path ../../../../tetra/Cargo.toml -- enroll \
  --dashboard-url http://127.0.0.1:3000 \
  --verification-url http://127.0.0.1:3000 \
  --agent-url wss://host.containers.internal:7781 \
  --listen 0.0.0.0:7781 \
  --display-name host-tetra \
  --insecure
```

Approve the printed code in Dashboard, then start the local `agent-ws-serve`
listener using the generated identity and TLS files. This is still an inbound
listener test for local development; production hosted Dashboard should use
Tetra's outbound `agent-connect` transport through the Cloudflare Worker
gateway.
