# Ultramarine Dashboard

Dashboard for Ultramarine Server management. This app is intended to run self-hosted on an Ultramarine Server host.

## Usage (dev)

1. `pnpm install`
   For a full Linux integration test, follow [`dev/README.md`](dev/README.md).
2. For local application work, configure the environment values below and run `pnpm --filter ultramarine-dashboard-app db:migrate`.
3. `pnpm --filter ultramarine-dashboard-app dev`

Details, one-time machine setup, and caveats: [dev/README.md](dev/README.md)

For UI-only work on macOS or without the local database/backend stack, use the
fixture mode documented in [dev/README.md](dev/README.md#fixture-ui-mode).

## Managed applications

Dashboard can cook and manage recipe-backed applications on enrolled Tetra hosts.
The application catalog and host application routes are part of the Dashboard app
under `apps/dashboard/src/lib/apps` and
`apps/dashboard/src/routes/(app)/hosts/[id]/apps`. Applications are deployed as
Quadlet resources, so the target host must have the required Tetra, Podman, and
systemd/Quadlet support available. Enroll a host first, then open **Hosts → Apps**
to create, inspect, update, or remove an application.

## Build and run

```sh
pnpm --filter ultramarine-dashboard-app build
ORIGIN=http://localhost:3000 \
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
EMAIL_FROM_ADDRESS=no-reply@localhost \
EMAIL_FROM_NAME="Ultramarine Server" \
EMAIL_REPLY_TO=support@localhost \
node apps/dashboard/build
```

### Environment

Required:

- `ORIGIN` — public dashboard origin.
- `DATABASE_URL` — PostgreSQL connection URL.

`BETTER_AUTH_SECRET` is generated automatically on first boot when it is not supplied. Dashboard writes it to a mutable, owner-only state file: `/var/lib/ultramarine-dashboard/better-auth-secret` in production, or `~/.local/state/ultramarine-dashboard/better-auth-secret` in development. Set `BETTER_AUTH_SECRET` to use a deployment-managed secret, or `BETTER_AUTH_SECRET_FILE` to use a specific owner-only secret file. Use `UM_DASHBOARD_STATE_DIR` to change the generated-secret state directory.

- `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` — email identity values.

Email verification is disabled by default. Set `EMAIL_VERIFICATION_REQUIRED=true` once setup includes a configured mail provider.

Optional:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `INTERNAL_CRON_SECRET`
