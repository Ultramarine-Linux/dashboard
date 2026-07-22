# Build the Dashboard from the repository root supplied as build context.
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false
COPY . .
RUN pnpm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/lib/server/db ./src/lib/server/db
EXPOSE 3000
CMD ["node", "build"]
