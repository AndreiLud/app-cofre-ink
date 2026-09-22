# One image that serves the API and the interface, so a home server runs one thing.

FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY packages/ui/package.json packages/ui/

# No scripts: the only one in the workspace installs git hooks, and an image has no
# repository to install them into.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --filter @cofre/web build

FROM node:24-alpine AS runtime
WORKDIR /app

RUN corepack enable
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/db/package.json packages/db/
COPY --from=build /app/packages/storage/package.json packages/storage/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @cofre/server...

COPY --from=build /app/apps/server/src apps/server/src
COPY --from=build /app/packages/core/src packages/core/src
COPY --from=build /app/packages/db/src packages/db/src
COPY --from=build /app/packages/storage/src packages/storage/src
COPY --from=build /app/apps/web/dist apps/server/public

ENV COFRE_STATIC_DIR=/app/apps/server/public
ENV COFRE_DATABASE=/data/cofre.db
VOLUME /data
EXPOSE 4321

# Node runs the TypeScript directly, so there is no build output to keep in step.
CMD ["node", "--experimental-strip-types", "apps/server/src/main.ts"]
