# Ultramarine Dashboard

Dashboard for Ultramarine Server management. This app is intended to run self-hosted on an Ultramarine Server host.

## Usage (dev)

1. `pnpm install`
   For a full Linux integration test, follow [`dev/README.md`](dev/README.md).
2. For local application work, configure the environment values below. Dashboard creates and migrates its SQLite database on startup.
3. `pnpm --filter ultramarine-dashboard-app dev`

Without a Tetra build that has the session API, run with `TETRA_MOCK=1` to use
an in-memory Tetra (development only). It has the accounts `admin`/`admin`
(administrator) and `user`/`user` (TOTP enrolled with the secret
`JBSWY3DPEHPK3PXP`, or recovery code `aaaaa-11111`). Passkeys work on
`http://localhost`; the mock does not check passkey signatures.

Details, one-time machine setup, and caveats: [dev/README.md](dev/README.md)

For UI-only work on macOS or without the local database/backend stack, use the
fixture mode documented in [dev/README.md](dev/README.md#fixture-ui-mode).

## Managed applications

Dashboard manages only the server it runs on, through the local Tetra agent.
It talks to Tetra over the Unix socket `/run/tetra/tetra.sock`, and Tetra
identifies it by the socket's peer UID, so there is nothing to enroll.

Accounts are the server's system accounts. Tetra checks the password (PAM),
then a TOTP or recovery code if the account has one, or a passkey, and issues a
session token that Dashboard keeps in an httpOnly cookie and sends with every
call. Tetra authorizes every action; Dashboard only hides pages Tetra says the
user cannot see, and answers 403 for them. First-time setup happens in the
server OOBE, not in Dashboard.

Dashboard can cook and manage recipe-backed applications on this server. The
application catalog and application routes live under
`apps/dashboard/src/lib/apps` and `apps/dashboard/src/routes/(app)/(server)/apps`.
Applications are deployed as Quadlet resources, so the server must have the
required Tetra, Podman, and systemd/Quadlet support available. Open **Apps** to
create, inspect, update, or remove an application.

## Build and run

```sh
pnpm --filter ultramarine-dashboard-app build
ORIGIN=http://localhost:3000 \
node apps/dashboard/build
```

### Environment

Required:

- `ORIGIN` — public dashboard origin.

Dashboard stores its state in SQLite (WAL mode) at `/var/lib/ultramarine-dashboard/dashboard.db` in production, or `~/.local/state/ultramarine-dashboard/dashboard.db` in development. `UM_DASHBOARD_STATE_DIR` moves it along with the other state files; `UM_DASHBOARD_DB_PATH` sets the database file directly. Before migrating on startup, Dashboard snapshots the database; see [`apps/dashboard/MIGRATIONS.md`](apps/dashboard/MIGRATIONS.md).

`BETTER_AUTH_SECRET` is generated automatically on first boot when it is not supplied. Dashboard writes it to a mutable, owner-only state file: `/var/lib/ultramarine-dashboard/better-auth-secret` in production, or `~/.local/state/ultramarine-dashboard/better-auth-secret` in development. Set `BETTER_AUTH_SECRET` to use a deployment-managed secret, or `BETTER_AUTH_SECRET_FILE` to use a specific owner-only secret file. Use `UM_DASHBOARD_STATE_DIR` to change the generated-secret state directory.

Optional:

- `TETRA_SOCKET_PATH` — Tetra's socket, if not `/run/tetra/tetra.sock`.
- `TETRA_MOCK=1` — use the in-memory Tetra mock in `pnpm dev`. A production build refuses to start while `TETRA_MOCK` is set to anything, because the mock accepts any registered passkey without checking it.
- `ACCESSIBILITY_FIXTURES=1` — fixture mode for the accessibility suite, which logs every visitor in as an administrator. It only works on the dev server; a production build refuses to start while it is set to anything.
- `ADDRESS_HEADER=X-Forwarded-For` — so Tetra sees the browser's address behind Caddy.
- `INTERNAL_CRON_SECRET`
