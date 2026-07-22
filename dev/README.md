# Development environments

This directory contains the supported development environments for Ultramarine
Dashboard. Dashboard is developed against Tetra and the Ultramarine userspace
directly.

## Dashboard + Tetra integration stack

The recommended Linux test environment is the reproducible integration stack in
this directory. It runs PostgreSQL, Dashboard, and Tetra in
containers, with Tetra based on the bare Ultramarine 44 image:

```text
ghcr.io/ultramarine-linux/ultramarine:44
```

This tests the real Dashboard → Tetra authenticated WSS path, TLS certificates,
controller enrollment, signed commands, migrations, generated Dashboard
secrets, and container networking. It does not emulate a complete host: real
systemd, Quadlets, desktop polkit agents, root-owned user changes, and reverse
proxy changes must be tested in a VM or on an Ultramarine host.

### Prerequisites

Install Podman, a Compose provider, OpenSSL, and (for source builds) Rust and
pnpm. For example on Fedora-based systems:

```sh
sudo dnf install podman podman-compose openssl
```

### Start and test

From the Dashboard repository:

```sh
cd dev
chmod +x prepare.sh smoke.sh
./prepare.sh
podman compose --env-file .env up --build
```

In a second terminal, run the non-browser smoke checks:

```sh
cd dev
./smoke.sh
```

Pairing details, reset procedures, certificate handling, and security limitations
are documented below.

The integration stack uses generated development-only credentials and a private
CA. Do not reuse its enrollment token, controller keys, or CA private key in a
production deployment.

### Stop or reset

Stop the stack while retaining its volumes:

```sh
podman compose --env-file .env down
```

Reset the database, Tetra identity, certificates, and generated credentials:

```sh
podman compose --env-file .env down -v
rm -rf certs .env
```

Then run `./prepare.sh` again.

## Fixture UI mode

For UI-only work, use the deterministic fixture mode. It does not require
PostgreSQL, Tetra, Podman, or a Linux host:

```sh
CI=true \
ACCESSIBILITY_FIXTURES=1 \
DATABASE_URL=postgres://fixture:fixture@127.0.0.1:5432/fixture \
pnpm --filter ultramarine-dashboard-app run dev --host 127.0.0.1 --port 5173
```

The fixture database URL satisfies server startup; fixture-backed routes do not
connect to that database. Fixture data lives in
`src/lib/server/accessibility-fixtures.ts` and should remain deterministic.

Useful fixture URLs:

- Managed host: `/projects/accessibility-project/hosts/accessibility-host`
- Podman: `/projects/accessibility-project/hosts/accessibility-host/podman`
- Quadlets: `/projects/accessibility-project/hosts/accessibility-host/quadlets`
- Raw dispatch: `/projects/accessibility-project/hosts/accessibility-host/dispatch`
- Fixture VM: `/projects/accessibility-project/servers/accessibility-server`
