# Container image and releases

On a server, Dashboard runs from the production image built by
[`dashboard/Containerfile`](../dashboard/Containerfile). Build it from the
repository root:

```sh
podman build -f dashboard/Containerfile -t dashboard .
```

It's a distroless Node.js image that runs as a non-root user and listens on
port 3972 on every interface inside the container. better-sqlite3 is
installed for the target architecture during the build, so build each
architecture on a native runner or under emulation with `--platform`. The
build also seeds the recipe catalog (see [recipe catalogs](recipes.md#the-seed)).

The Quadlet in `ultramarine-server-dashboard`
([Ultramarine-Linux/packages](https://github.com/Ultramarine-Linux/packages))
runs it as the host's `ultramarine-dashboard` account, publishes the port on
`127.0.0.1:3972` only (Caddy is the ingress), and mounts `/run/tetra` and
`/var/lib/ultramarine-dashboard`.

## Runtime

The image sets `HOST=0.0.0.0`, `PORT=3972`, `PROTOCOL_HEADER=x-forwarded-proto`,
`SHUTDOWN_TIMEOUT=5` and `UM_DASHBOARD_STATE_DIR=/var/lib/ultramarine-dashboard`
(see [configuration](configuration.md)). It starts through
[`dashboard/serve.js`](../dashboard/serve.js), which drops a blank `ORIGIN`
that adapter-node would refuse.

On SIGTERM, Dashboard waits up to `SHUTDOWN_TIMEOUT` seconds for requests in
flight, then closes its Tetra connection and exits, within Podman's 10-second
stop timeout.

## Publishing

The [Image workflow](../.github/workflows/image.yml) builds the image with the
shared
[FyraLabs/actions Docker workflow](https://github.com/FyraLabs/actions/blob/main/.github/workflows/docker.yml)
on native amd64 and arm64 runners and publishes a multi-arch image, signed
with cosign (keyless), to `ghcr.io/ultramarine-linux/dashboard`:

| Ref            | Tags                             |
| -------------- | -------------------------------- |
| `main`         | `main`                           |
| `vX.Y.Z` tag   | `vX.Y.Z` and `latest`            |
| `vX.Y.Z-…` tag | none (prerelease)                |
| pull request   | none (build and smoke test only) |

Dispatches on branches other than `main` only build and smoke-test too. The
run's summary shows the image digest.

Before anything is published, a smoke test
([`.github/scripts/smoke-image.sh`](../.github/scripts/smoke-image.sh)) checks
a local build of each architecture: non-root, `/health`, single sign-on's
state directory, and that SIGTERM stops the container quickly. It runs again
on the published image.

GitHub creates the package private on its first publish. Make it public once
(the package's settings on GitHub, linked to `Ultramarine-Linux/dashboard`):
`update.rhai`, bootc on every host, and `cosign verify` all pull it
anonymously.

### Verifying

The signature's identity is the shared workflow, run for this repository:

```sh
cosign verify \
  --certificate-identity-regexp '^https://github\.com/FyraLabs/actions/\.github/workflows/docker\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-github-workflow-repository Ultramarine-Linux/dashboard \
  ghcr.io/ultramarine-linux/dashboard@sha256:…
```

## Pinning in bootc images

The dashboard image is a
[logically bound image](https://bootc-dev.github.io/bootc/logically-bound-images.html)
of the bootc images, pinned by digest so each OS release runs the dashboard it
was built with:

1. Releasing a `vX.Y.Z` tag publishes the image as `vX.Y.Z`.
2. The `update.rhai` of `ultramarine-server-dashboard` picks the newest version
   tag (andax's `oci_tag()` takes `vX.Y.Z` and ignores `main` and `latest`) and
   writes its digest (the multi-arch index digest) to
   `%global dashboard_digest` in the spec. The digest from the workflow summary
   can also be pinned by hand.
3. The package installs the Quadlet with
   `Image=ghcr.io/ultramarine-linux/dashboard@sha256:…` and links it from
   `/usr/lib/bootc/bound-images.d/`. Ultramarine-Linux/bootc installs the
   package, so the pin is part of the OS image.
4. When a host stages a deployment, bootc pulls every bound image into its own
   store (`/usr/lib/bootc/storage`) before the reboot. The Quadlet reads that
   store through `additionalimagestore`, so the dashboard starts after the
   update without a pull, and a rollback goes back to the previous digest
   together with the OS.

Bound images must be pinned by digest, since a tag would let the dashboard
change without an OS update. `main` images are for testing only.
