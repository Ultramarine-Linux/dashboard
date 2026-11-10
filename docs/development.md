# Development

```sh
pnpm install
TETRA_MOCK=1 pnpm dev
```

Dashboard creates and migrates its SQLite database on startup, in
`~/.local/state/ultramarine-dashboard` (see [configuration](configuration.md)).
No other configuration is needed in development.

## Mock Tetra

`TETRA_MOCK=1` runs an in-memory Tetra (see [Tetra](tetra.md#the-mock)), for
when you don't have a Tetra build with the session API. Its accounts:

| Account | Password | Notes                                                                        |
| ------- | -------- | ---------------------------------------------------------------------------- |
| `admin` | `admin`  | administrator                                                                |
| `user`  | `user`   | TOTP enrolled with the secret `JBSWY3DPEHPK3PXP`, recovery code `aaaaa-11111` |

Passkeys work on `http://localhost`. Use `localhost` rather than `127.0.0.1`,
since passkeys need a hostname.

## Checks and tests

```sh
pnpm check                # svelte-check
pnpm lint                 # prettier
pnpm i18n:check           # translation catalogs
pnpm test:unit            # vitest
pnpm test:accessibility   # playwright and axe, in fixture mode
```

The accessibility suite runs the dev server with `ACCESSIBILITY_FIXTURES=1`,
which logs every visitor in as an administrator against the mock and needs no
network.

## Production build

```sh
pnpm build
cd dashboard  # migrations are read from ./drizzle
# a production build keeps its state in /var/lib/ultramarine-dashboard, so use
# a private scratch directory instead
UM_DASHBOARD_STATE_DIR=$(mktemp -d) PORT=3972 ORIGIN=http://localhost:3972 node build
```

A production build needs a real Tetra and refuses `TETRA_MOCK`. To build the
container image, see [container image](container-image.md).

## Container stack

[`dashboard/dev`](../dashboard/dev) runs Dashboard in a container against
either the mock or a Tetra on this machine, with its SQLite database in a named
volume. Both services publish `127.0.0.1:3972`, so run one at a time.

### Against the mock

```sh
cd dashboard/dev
podman compose up --build -d dashboard
./smoke.sh
```

This runs the dev server (`vite dev`) with `TETRA_MOCK=1`. `src/` and
`static/` are mounted, so edits reload. Open `http://localhost:3972` and sign
in with a [mock account](#mock-tetra).

### Against a local Tetra

This runs the production image (`dashboard/Containerfile`) against a Tetra on
this machine. Tetra only accepts the dashboard's account on its socket, so the
container maps your account onto the image's user and Tetra is told to treat
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
   group. The socket is then `/run/tetra/tetra.sock`.

2. Start the dashboard:

   ```sh
   cd dashboard/dev
   TETRA_SOCKET_DIR=/run/tetra-dev podman compose --profile tetra up --build -d dashboard-tetra
   ./smoke.sh
   ```

   `TETRA_SOCKET_DIR` defaults to `/run/tetra`.

Sign in at `http://localhost:3972` with an account on this machine.
Administrators are members of `ultramarine-admin` or `wheel`. With scratch
state Tetra has no access configuration, so passkeys are off.

The container runs with `label=disable`, because SELinux doesn't let a
container connect to the socket otherwise. That's a development shortcut. The
production Quadlet doesn't run that way.

### Smoke check

`./smoke.sh` requests `/health` (see
[configuration](configuration.md#health-check)) and prints the checks that
failed, if any. The dashboard's log (`podman compose logs`) has the reason. Set
`DASHBOARD_URL` to check another address.
