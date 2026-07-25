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
podman compose --env-file .env up --build -d
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

### Open the Dashboard

Once the stack is running, open this URL in a browser on the same computer:

```text
http://127.0.0.1:3000
```

`127.0.0.1` is intentional: the development Compose file binds Dashboard to
loopback, so it is not exposed directly to other machines on the network. Create
the first Dashboard account from this page.

## Enroll the Tetra WebSocket

The setup script automatically starts the local Tetra listener with a fresh,
one-time enrollment token and generates the development CA. When the development
Compose stack mounts those credentials into Dashboard, setup automatically probes
its allowlisted local endpoints after you choose the server domain and enrolls the
first reachable Tetra host. The token and CA are not shown in the UI for local
setup. Dashboard reads them only from the explicitly mounted, read-only files.

If no local endpoint is reachable, setup still completes and you can register a
remote host later from **Hosts → Register Host**. If the UI says `fetch failed`,
check that Tetra is running on the selected endpoint, that port `7781` is not
occupied by an old process, and that the process was started with the current
token from `dev/.env`. The controller key is generated
and stored in Dashboard's encrypted database under the authenticated administrator
session.

### Local host

1. Start the stack and run `./prepare.sh`.
2. Open `http://127.0.0.1:3000` and create the first Dashboard account.
3. Open **Hosts → Register Host**.
4. Select **Local host**. This fills in `wss://127.0.0.1:7780` and enables the
   authenticated WebSocket flow by default.
5. Set **Name** to something such as `local-ultramarine`. The local endpoint
   should be `wss://tetra:7780` when Dashboard is running in Compose.
6. Copy the token from `dev/.env` into **One-time enrollment token**.
7. Paste the complete contents of `dev/certs/ca.crt` into **Private CA
   certificate**.
8. Select **Register Host**.

The Dashboard generates an Ed25519 controller keypair, sends the public key and
one-time token to Tetra, verifies the Tetra host fingerprint, and stores the
encrypted controller private key plus pinned host key. The enrollment token is
not reusable.

### Remote host

1. Install and start Tetra's TLS WebSocket listener on the remote Ultramarine
   host. Use a non-loopback address with `--tls-cert` and `--tls-key`; plaintext
   `ws://` is intentionally refused for remote listeners.
2. Generate or retrieve the remote host's one-time enrollment token through the
   host's local setup procedure.
3. From **Hosts → Register Host**, select **Remote host**.
4. Enter the remote `wss://` URL, enrollment token, and the CA certificate that
   signed the remote Tetra certificate.
5. Select **Register Host**.

For a remote host, make sure the Dashboard can reach the Tetra port through the
firewall, and prefer a private network or VPN. Do not expose the enrollment
token or CA private key. The CA certificate pasted into Dashboard is public trust
material; only the CA private key must remain on the host that issued it.

The Tetra WebSocket port is separate from the Dashboard web interface. For the
Compose stack, Dashboard connects to Tetra over the internal service name:

```text
wss://tetra:7780
```

Do not substitute `127.0.0.1` here: from inside the Dashboard container,
`127.0.0.1` means the Dashboard container itself, not the Tetra container. You
normally do not open the Tetra address in a browser. Dashboard uses it when
registering and communicating with the managed host. The development CA is in
`dev/certs/ca.crt`, and the one-time enrollment token is in `dev/.env`.

To access the Dashboard from another computer without changing the bind address,
create an SSH tunnel from that computer:

```sh
ssh -N -L 3000:127.0.0.1:3000 user@dashboard-host
```

Then open `http://127.0.0.1:3000` locally. Do not change the bind to `0.0.0.0`
unless you also add appropriate firewalling and HTTPS protection.

### Choose where Tetra runs

The default Compose command runs Tetra in the Ultramarine 44 container:

```sh
podman compose --env-file .env up --build
```

For development work that needs your real machine's Podman, polkit session, or
host filesystem, run Tetra directly on the machine instead:

1. Start PostgreSQL and Dashboard without the container Tetra service:

   ```sh
   podman compose -f compose.yaml -f compose.host-tetra.yaml --env-file .env up --build --scale tetra=0
   ```

2. Prepare a separate host-Tetra certificate and identity directory:

   ```sh
   ./prepare-host-tetra.sh
   ```

3. From the Tetra checkout, stop any old process already listening on port
   `7781`, then run the command printed by the preparation script. Restarting is
   required whenever `dev/.env` is regenerated because the enrollment token is
   one-time and the running Tetra process keeps the token it was started with.
   The process listens on `0.0.0.0:7781`, uses the host's real Tetra binary, and
   stores its identity under `dev/certs/host-tetra/identity`.

4. Open Dashboard at `http://127.0.0.1:3000`, complete first-run setup,
   choose the server subdomain, and submit the setup form. Dashboard will read
   the mounted CA/token and automatically enroll
   `wss://host.containers.internal:7781`. Do not use **Hosts → Register Host**
   for this local flow; that screen is for manual remote enrollment.

If the host Tetra identity was already enrolled by a smoke client or an earlier
Dashboard controller, stop Tetra and reset only the persisted controller key:

```sh
./prepare-host-tetra.sh --reset-controller
```

Then restart Tetra with the newly printed command and submit setup again. The
host identity key itself is preserved; only the enrolled Dashboard controller is
replaced.

`host.containers.internal` is the Podman host-gateway name added by
`compose.host-tetra.yaml`; it is not a public DNS name. The host-Tetra mode uses
port `7781` so it can coexist with the default container Tetra listener on
`7780`. The host process must have its own `podman`, polkit agent, and any other
host services it is expected to manage.

Stop host mode with `Ctrl-C` in the Tetra terminal, then stop the containers:

```sh
podman compose -f compose.yaml -f compose.host-tetra.yaml --env-file .env down
```

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
