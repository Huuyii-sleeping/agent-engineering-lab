FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/skill-registry/package.json apps/skill-registry/package.json
RUN pnpm install --filter skill-registry --prod=false --frozen-lockfile

FROM deps AS build
COPY apps/skill-registry apps/skill-registry
RUN pnpm --filter skill-registry build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV SKILL_REGISTRY_DATA_ROOT=/data
ENV SKILL_REGISTRY_DB=/data/registry.sqlite
ENV SKILL_PACKAGE_ROOT=/data/packages
ENV SKILL_REGISTRY_PORT=3190
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/skill-registry/node_modules /app/apps/skill-registry/node_modules
COPY --from=build /app/apps/skill-registry/package.json /app/apps/skill-registry/package.json
COPY --from=build /app/apps/skill-registry/dist /app/apps/skill-registry/dist
COPY registries /app/registries
EXPOSE 3190
CMD ["node", "apps/skill-registry/dist/main.js"]
