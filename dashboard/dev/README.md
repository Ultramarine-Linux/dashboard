# Dashboard development stack

Dashboard talks to Tetra over the Unix socket `/run/tetra/tetra.sock`, and
Tetra identifies it by the socket's peer UID; there is nothing to enroll. This
stack runs Dashboard in a container against either the in-memory Tetra mock or
a Tetra on this machine. Dashboard keeps its SQLite database in a named volume.

Both services publish `127.0.0.1:3972`, so run one at a time.

## Mock Tetra

```sh
cd dashboard/dev
podman compose up --build -d dashboard
./smoke.sh
```

This runs the dev server (`vite dev`) with `TETRA_MOCK=1`; only a dev server
accepts the mock. `src/` and `static/` are mounted, so edits reload. Open
`http://localhost:3972` and sign in as `admin`/`admin` or `user`/`user` (see the
[top-level README](../../README.md#usage-dev)). Use `localhost` rather than
`127.0.0.1`: passkeys need a hostname.

## Local Tetra socket

This runs the production image (`dashboard/Containerfile`) against a Tetra
on this machine. Tetra only accepts the dashboard's account on its socket, so
the container maps your account onto the image's user and Tetra is told to treat
your account as the dashboard.

1. Start Tetra with `--dashboard-user "$USER"` and scratch state, from a Tetra
   checkout:

   ```sh
   cargo build
   sudo install -d -m 0755 /run/tetra-dev
   sudo target/debug/tetra agent-serve \
     --socket /run/tetra-dev/tetra.sock \
     --dashboard-user "$USER" \
     --identity-dir /tmp/tetra-identity --state-dir /tmp/tetra-state
   ```

   The socket is `root:root 0660`. Let your group connect:

   ```sh
   sudo chgrp "$(id -gn)" /run/tetra-dev/tetra.sock
   ```

   On a host with the `tetra` package, you can instead run `tetra.service` with
   `TETRA_DASHBOARD_USER=$USER` in a drop-in and add yourself to the `tetra`
   group; the socket is then `/run/tetra/tetra.sock`.

2. Start the dashboard:

   ```sh
   cd dashboard/dev
   TETRA_SOCKET_DIR=/run/tetra-dev podman compose --profile tetra up --build -d dashboard-tetra
   ./smoke.sh
   ```

   `TETRA_SOCKET_DIR` defaults to `/run/tetra`.

Sign in at `http://localhost:3972` with an account on this machine.
Administrators are members of `ultramarine-admin` or `wheel`. With scratch state
Tetra has no access configuration, so passkeys are off.

The container runs with `label=disable`, because SELinux does not let a
container connect to the socket otherwise. That is a shortcut for development,
not how the production Quadlet runs.

## Smoke check

`./smoke.sh` requests `/health`, which returns `OK` only if the database opens,
every migration is applied and Tetra answers. Otherwise it prints the checks
that failed; the dashboard's log (`podman compose logs`) has the reason. Set
`DASHBOARD_URL` to check another address.
