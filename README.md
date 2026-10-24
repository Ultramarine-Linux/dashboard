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
`dashboard/src/lib/apps` and `dashboard/src/routes/(app)/(server)/apps`.
Applications are deployed as Quadlet resources, so the server must have the
required Tetra, Podman, and systemd/Quadlet support available. Open **Apps** to
create, inspect, update, or remove an application.

Recipes come from
[Ultramarine-Linux/recipes](https://github.com/Ultramarine-Linux/recipes)
and never live in this repository. Dashboard fetches the published catalog at
runtime and caches it in its state directory
(`$UM_DASHBOARD_STATE_DIR/recipes/<catalog>/`). Recipe names, descriptions,
parameter labels, and categories are translated in the recipes repo, not in
`langs/`.

- `RECIPES_URL` is the Fyra Labs catalog's base URL, the one `index.json` is
  under (default `https://recipes.fyralabs.com/v1`).
- `RECIPES_REFRESH_INTERVAL` is how often, in minutes, every catalog is
  refreshed in the background (default 360; `0` only refreshes on startup).
  Refreshes are conditional (ETag / Last-Modified), download only bundles
  that aren't cached, and verify every bundle's digest before the new index
  replaces the old one. A failed refresh keeps the previous catalog.
- The production image mirrors the Fyra Labs catalog endpoint (`index.json`
  and the bundles it lists) into `/app/recipes-seed/fyra` at build time
  (build args `RECIPES_URL`, and `RECIPES_SEED`: `required`, `optional`
  (default), or `off`). The Image workflow builds every published image with
  `required`, so a release can't ship without the catalog. On first start, with no catalog cached yet, Dashboard
  imports the seed (`UM_DASHBOARD_RECIPES_SEED_DIR`) through the same digest
  checks as a download, then refreshes from `RECIPES_URL`. Without a seed or
  network the catalog is empty until a refresh succeeds. To seed by hand,
  mirror `<url>/index.json` and each `recipes[].bundle` path into
  `<seed dir>/fyra/`.
- Administrators can add more catalogs in the same format under
  **Administration → Recipe catalogs** (https only; http works for
  `localhost`), and refresh or remove them there. Recipes from an added
  catalog are always installed as `custom`, whatever the catalog claims; only
  the Fyra Labs catalog's recipes are `official` or `community`.

## Translations

UI strings go through [i18nya](https://github.com/FyraLabs/i18nya). Catalogs are
nested JSON files in `dashboard/src/lib/i18n/langs`, one per BCP 47 locale
(`en.json`, `pt-BR.json`, ...), in the i18next v4 layout so Weblate can edit
them. `en.json` is the source of truth; other locales fall back to it key by
key.

- In components, `import { t, tn, formatDateTime } from '#lib/i18n/index.js'` and use
  `t('ns.key', { name })`, where `ns.key` is the dotted path into `en.json`
  and `{{name}}` is a placeholder in the string. Each placeholder may appear
  only once per string.
- Plurals use i18next suffixes: `tn('apps.services', count)` reads
  `services_one` / `services_other` under `apps`, and `{{count}}` is the
  formatted number. Other languages add the CLDR forms they need (`_few`,
  `_many`, ...).
- On the server (hooks, `load`, actions, remote functions), use
  `serverT('ns.key')` from `#lib/server/i18n.js`.
- A key can't be both a string and a parent of other keys (use `x.label`).
- New languages show up in **Account settings → Appearance → Language**. The
  locale is picked from the `locale` cookie, then `Accept-Language`, then
  English.
- `pnpm i18n:check` validates catalogs against `en.json` and reports coverage;
  it runs in CI.

### Weblate

Translations are managed on [Fyra Labs Weblate](https://weblate.fyralabs.com).
Add English strings in code and `en.json`; everything else comes from Weblate
pull requests. Non-English catalogs are excluded from Prettier, since Weblate
writes them. Component settings:

| Setting                        | Value                                                    |
| ------------------------------ | -------------------------------------------------------- |
| File format                    | i18next JSON file v4                                     |
| File mask                      | `dashboard/src/lib/i18n/langs/*.json`                    |
| Monolingual base language file | `dashboard/src/lib/i18n/langs/en.json`                   |
| Edit base file                 | Off                                                      |
| Template for new translations  | Empty                                                    |
| Language code style            | BCP style using hyphen as a separator                    |
| File format parameters         | sort keys: case sensitive, indent: 1, indent style: tabs |
| Translation flags              | `i18next-interpolation`                                  |
| Version control system         | GitHub pull request, branch `main`                       |

Add-ons: **Cleanup translation files** and **Squash Git commits**. Add a GitHub
webhook to `https://weblate.fyralabs.com/hooks/github/` so Weblate picks up new
strings when `main` changes.

## Build and run

```sh
pnpm --filter ultramarine-dashboard build
cd dashboard  # migrations are read from ./drizzle
# A production build keeps its state in /var/lib/ultramarine-dashboard; use a
# private scratch directory instead.
UM_DASHBOARD_STATE_DIR=$(mktemp -d) PORT=3972 ORIGIN=http://localhost:3972 node build
```

`GET /health` returns `OK` only if the database opens, every migration is
applied, and Tetra answers on its socket; otherwise it returns 503 with the
checks that failed, and logs why. Update checks use it.

### Container image

On a server, Dashboard runs from the production image built by
[`dashboard/Containerfile`](dashboard/Containerfile), from the
repository root:

```sh
podman build -f dashboard/Containerfile -t dashboard .
```

It is a distroless Node.js image that runs as a non-root user and listens on
port 3972 on every interface inside the container. better-sqlite3 is
installed for the target architecture during the build. The Quadlet in
`ultramarine-server-dashboard`
([Ultramarine-Linux/packages](https://github.com/Ultramarine-Linux/packages))
runs it as the host's `ultramarine-dashboard` account, publishes the port on
`127.0.0.1:3972` only (Caddy is the ingress), and mounts `/run/tetra` and
`/var/lib/ultramarine-dashboard`.

The [Image workflow](.github/workflows/image.yml) builds it with the shared
[FyraLabs/actions Docker workflow](https://github.com/FyraLabs/actions/blob/main/.github/workflows/docker.yml)
on native amd64 and arm64 runners and publishes a multi-arch image, signed
with cosign (keyless), to `ghcr.io/ultramarine-linux/dashboard`: `main` from
`main`, `vX.Y.Z` and `latest` from a `vX.Y.Z` tag. The run's summary shows the
image digest. The signature's identity is the shared workflow, run for this
repository:

```sh
cosign verify \
  --certificate-identity-regexp '^https://github\.com/FyraLabs/actions/\.github/workflows/docker\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-github-workflow-repository Ultramarine-Linux/dashboard \
  ghcr.io/ultramarine-linux/dashboard@sha256:…
```

Before anything is published, a smoke test checks a local build of each
architecture: non-root, `/health`, single sign-on's state directory, and that
SIGTERM stops the container quickly
([`.github/scripts/smoke-image.sh`](.github/scripts/smoke-image.sh)); it runs
again on the published image. Pull requests, and dispatches on branches other
than `main`, only build and smoke-test. Prerelease tags (`vX.Y.Z-…`) don't
publish.

GitHub creates the package private on its first publish. Make it public once
(the package's settings on GitHub, linked to `Ultramarine-Linux/dashboard`):
`update.rhai`, bootc on every host, and `cosign verify` all pull it anonymously.

#### Pinning in bootc images

The dashboard image is a [logically bound image](https://bootc-dev.github.io/bootc/logically-bound-images.html)
of the bootc images, pinned by digest so each OS release runs the dashboard it
was built with:

1. Releasing a `vX.Y.Z` tag publishes the image as `vX.Y.Z`.
2. The `update.rhai` of `ultramarine-server-dashboard` picks the newest version
   tag (andax's `oci_tag()` takes `vX.Y.Z` and ignores `main` and `latest`) and
   writes its digest (the multi-arch index digest) to
   `%global dashboard_digest` in the spec. The digest from the workflow summary
   can also be pinned by hand.
3. The package installs the Quadlet with
   `Image=ghcr.io/ultramarine-linux/dashboard@sha256:…`, and links it from
   `/usr/lib/bootc/bound-images.d/`. Ultramarine-Linux/bootc installs the
   package, so the pin is part of the OS image.
4. When a host stages a deployment, bootc pulls every bound image into its own
   store (`/usr/lib/bootc/storage`) before the reboot. The Quadlet reads that
   store through `additionalimagestore`, so the dashboard starts after the
   update without a pull, and a rollback goes back to the previous digest
   together with the OS.

Bound images must be pinned by digest: a tag would let the dashboard change
without an OS update. `main` images are for testing only.

### Environment

- `ORIGIN` — the dashboard's public origin, such as `https://server.example.com`.
  On a server, Tetra writes it to `/etc/ultramarine-dashboard/env` (the
  Quadlet's `EnvironmentFile=`) from the access configuration set during setup
  (`access.set`: hostname and port), and restarts Dashboard when it changes.
  Don't set it to `localhost`: browsers reach the dashboard from other
  machines.

  Dashboard starts without it, or with it blank. Pages then take the origin
  from the request (the Host header and, in the image, Caddy's
  `X-Forwarded-Proto`; adapter-node assumes `https` without it), but
  single sign-on for apps needs a fixed issuer: the OIDC endpoints under
  `/api/auth/` answer 503 with "server hostname not configured", and
  administrators see a banner asking them to set the server's hostname. The
  dev server uses the request's origin for everything.

The image sets `HOST=0.0.0.0`, `PORT=3972`, `PROTOCOL_HEADER=x-forwarded-proto`,
`SHUTDOWN_TIMEOUT=5`, and `UM_DASHBOARD_STATE_DIR=/var/lib/ultramarine-dashboard`,
and starts through `dashboard/serve.js`, which drops a blank `ORIGIN`
that adapter-node would refuse. On SIGTERM, Dashboard
waits up to `SHUTDOWN_TIMEOUT` seconds for requests in flight, then closes its
Tetra connection and exits, within Podman's 10-second stop timeout.

Dashboard stores its state in SQLite (WAL mode) at `/var/lib/ultramarine-dashboard/dashboard.db` in production, or `~/.local/state/ultramarine-dashboard/dashboard.db` in development. `UM_DASHBOARD_STATE_DIR` moves it along with the other state files; `UM_DASHBOARD_DB_PATH` sets the database file directly. Before migrating on startup, Dashboard snapshots the database; see [`dashboard/MIGRATIONS.md`](dashboard/MIGRATIONS.md).

`BETTER_AUTH_SECRET` is generated automatically on first boot when it is not supplied. Dashboard writes it to a mutable, owner-only state file: `/var/lib/ultramarine-dashboard/better-auth-secret` in production, or `~/.local/state/ultramarine-dashboard/better-auth-secret` in development. Set `BETTER_AUTH_SECRET` to use a deployment-managed secret, or `BETTER_AUTH_SECRET_FILE` to use a specific owner-only secret file. Use `UM_DASHBOARD_STATE_DIR` to change the generated-secret state directory.

Optional:

- `TETRA_SOCKET_PATH` — Tetra's socket, if not `/run/tetra/tetra.sock`.
- `TETRA_MOCK=1` — use the in-memory Tetra mock in `pnpm dev`. A production build refuses to start while `TETRA_MOCK` is set to anything, because the mock accepts any registered passkey without checking it.
- `ACCESSIBILITY_FIXTURES=1` — fixture mode for the accessibility suite, which logs every visitor in as an administrator. It only works on the dev server; a production build refuses to start while it is set to anything.
- `ADDRESS_HEADER=X-Forwarded-For` — so Tetra sees the browser's address behind Caddy.
- `INTERNAL_CRON_SECRET`
