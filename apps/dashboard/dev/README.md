# Dashboard + Tetra integration stack

This stack tests Dashboard's connection to the Tetra agent on the machine it
manages. Dashboard stores its state in SQLite under the `dashboard-state`
volume; there is no separate database service.

## Start

```sh
cd apps/dashboard/dev
./prepare.sh
podman compose --env-file .env up --build -d dashboard tetra
```

`prepare.sh` generates a development-only CA, a Tetra TLS certificate, and a
one-time `TETRA_ENROLLMENT_TOKEN` in `dev/.env`. Do not reuse these outside this
stack.

Open `http://127.0.0.1:3000`, create the first Dashboard account, then choose
**Detect local Tetra** on the setup page. Dashboard reads the mounted token and
CA, enrolls its controller key with Tetra at `wss://tetra:7780`, and stores the
connection. The host identity and controller public key are stored in the
`tetra-state` volume.

## Smoke check

```sh
./smoke.sh
```

The smoke check verifies Dashboard, its SQLite database, and the Tetra TLS
listener. Connecting Dashboard to Tetra still requires an authenticated
Dashboard browser session.

## Host Tetra mode

To run Tetra from the development machine instead of the container:

```sh
./prepare-host-tetra.sh
podman compose -f compose.yaml -f compose.host-tetra.yaml --env-file .env \
  up --build --scale dashboard=0 dashboard-host
```

Start the listener with the command printed by `prepare-host-tetra.sh`, then
choose **Detect local Tetra** in Dashboard.
