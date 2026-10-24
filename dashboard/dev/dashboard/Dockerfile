# Development server (vite dev) for the compose stack. Only a dev server can
# use TETRA_MOCK=1: production builds refuse to start with it set. Build from
# the repository root; dev/compose.yaml mounts src/ and static/ over the
# copies below for live reload.
FROM docker.io/library/node:24-trixie-slim

# pnpm runs better-sqlite3's node-gyp step on install. It uses the bundled
# prebuilt binary when there is one, but node-gyp still needs these.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

# Dashboard refuses a state directory others can read. A new named volume
# takes this directory's mode on first use.
RUN install -d -m 0700 /var/lib/ultramarine-dashboard

WORKDIR /src
ENV CI=true
COPY package.json ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY dashboard/package.json dashboard/package.json
RUN pnpm install --frozen-lockfile --filter ultramarine-dashboard...
COPY dashboard dashboard

WORKDIR /src/dashboard
EXPOSE 3972
CMD ["pnpm", "exec", "vite", "dev", "--host", "0.0.0.0", "--port", "3972", "--strictPort"]
