# Configuration

Dashboard reads its configuration from the environment. On a server, the
Quadlet's `EnvironmentFile=` (`/etc/ultramarine-dashboard/env`) and the image's
defaults (see [container image](container-image.md#runtime)) set it.

## `ORIGIN`

The dashboard's public origin, such as `https://server.example.com`. On a
server, Tetra writes it from the access configuration set during setup
(`access.set`: hostname and port) and restarts Dashboard when it changes. Don't
set it to `localhost`: browsers reach the dashboard from other machines.

Dashboard starts without it, or with it blank. Pages then take the origin from
the request: the Host header and, in the image, Caddy's `X-Forwarded-Proto`
(adapter-node assumes `https` without it). Single sign-on for apps needs a
fixed issuer, though: the OIDC endpoints under `/api/auth/` answer 503 with "server
hostname not configured", and administrators see a banner asking them to set
the server's hostname. The dev server uses the request's origin for
everything.

## State

Dashboard keeps its state in `/var/lib/ultramarine-dashboard` in production,
or `~/.local/state/ultramarine-dashboard` in development.
`UM_DASHBOARD_STATE_DIR` moves it. Dashboard refuses a state directory that
other users can read.

- The database is SQLite (WAL mode) at `dashboard.db`, or wherever
  `UM_DASHBOARD_DB_PATH` points. Dashboard snapshots it before migrating on
  startup (see [database migrations](migrations.md)).
- Without `BETTER_AUTH_SECRET`, Dashboard generates one on first boot and keeps
  it in the owner-only file `better-auth-secret`. `BETTER_AUTH_SECRET_FILE`
  reads it from another owner-only file instead.
- Recipe catalogs are cached under `recipes/` (see
  [recipe catalogs](recipes.md)).

## Other variables

- `TETRA_SOCKET_PATH`: Tetra's socket, if not `/run/tetra/tetra.sock`.
- `ADDRESS_HEADER=X-Forwarded-For`: so Tetra sees the browser's address behind
  Caddy.
- `RECIPES_URL`, `RECIPES_REFRESH_INTERVAL` and
  `UM_DASHBOARD_RECIPES_SEED_DIR`: see [recipe catalogs](recipes.md).
- `TETRA_MOCK=1`: use the in-memory Tetra mock in `pnpm dev`. A production
  build refuses to start while `TETRA_MOCK` is set to anything, because the
  mock accepts any registered passkey without checking it.
- `ACCESSIBILITY_FIXTURES=1`: fixture mode for the accessibility suite, which
  logs every visitor in as an administrator and needs no network. Dev server
  only, and a production build refuses to start while it is set to anything.
- `INTERNAL_CRON_SECRET`

## Health check

`GET /health` returns `OK` only if the database opens, every migration is
applied, and Tetra answers on its socket. Otherwise it returns 503 with the
checks that failed and logs why. Update checks (a new bootc deployment, a new
image) use it.
