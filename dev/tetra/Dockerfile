# Build Tetra without the optional native polkit feature. The integration stack
# tests Dashboard ↔ Tetra transport; polkit needs a real user session and is
# tested separately on a Linux host/VM.
FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock build.rs ./
COPY src ./src
COPY native ./native
COPY polkit ./polkit
RUN cargo build --release --no-default-features \
  --features files,recipes,selinux,services,quadlets,reverse-proxy,podman,samba,nfs,users,virtual-machines

# Use the bare Ultramarine userspace as the managed-host runtime. This is the
# closest available container analogue to the intended host family; it is still
# not a replacement for systemd/polkit tests on a full VM or real install.
FROM ghcr.io/ultramarine-linux/ultramarine:44
# The bare Ultramarine image does not include Podman by default. Install it in
# the integration image so Dashboard's Podman tab exercises the real Tetra
# module; production hosts should provide Podman through the host OS instead.
RUN dnf install -y podman && dnf clean all && rm -rf /var/cache/dnf
RUN mkdir -p /var/lib/tetra/identity /var/lib/tetra/config/tls
COPY --from=build /src/target/release/tetra /usr/local/bin/tetra
# Root inside a rootless Podman container is not host root. It is used here only
# so the agent can read the strict 0600 development TLS key mounted by prepare.sh.
# This image is not the privileged-helper/systemd/polkit integration test.
EXPOSE 7780
ENTRYPOINT ["tetra"]
