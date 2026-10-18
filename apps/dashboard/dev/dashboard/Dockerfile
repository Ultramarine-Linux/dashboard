# Build the Dashboard from the repository root supplied as build context.
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false
COPY . .
RUN pnpm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN pnpm install --filter ultramarine-dashboard... --prod=false --frozen-lockfile --config.confirmModulesPurge=false
COPY --from=build /app/apps/dashboard/build ./build
COPY --from=build /app/apps/dashboard/package.json ./package.json
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/apps/dashboard
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./node_modules
COPY --from=build /app/apps/dashboard/build ./build
COPY --from=build /app/apps/dashboard/package.json ./package.json
# Dashboard applies these migrations itself on startup.
COPY --from=build /app/apps/dashboard/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "build"]
