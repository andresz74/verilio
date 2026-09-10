# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.1.0-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10.2-alpine

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json eslint.config.mjs ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json packages/contracts/tsconfig.json packages/contracts/tsconfig.build.json ./packages/contracts/
COPY packages/db/package.json packages/db/tsconfig.json packages/db/tsconfig.build.json ./packages/db/
COPY packages/domain/package.json packages/domain/tsconfig.json packages/domain/tsconfig.build.json ./packages/domain/
COPY packages/invoice-pdf/package.json packages/invoice-pdf/tsconfig.json packages/invoice-pdf/tsconfig.build.json ./packages/invoice-pdf/
COPY packages/ui/package.json packages/ui/tsconfig.json packages/ui/tsconfig.build.json ./packages/ui/

RUN --mount=type=cache,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm build && pnpm --filter @verilio/api deploy --prod /release/api

FROM ${NODE_IMAGE} AS api

ARG VERILIO_VERSION=development
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Verilio API" \
      org.opencontainers.image.version="${VERILIO_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000
ENV MIGRATIONS_PATH=/opt/verilio/migrations

WORKDIR /opt/verilio/api

COPY --from=build --chown=node:node /release/api ./
COPY --from=build --chown=node:node /workspace/packages/db/migrations /opt/verilio/migrations

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]

FROM ${CADDY_IMAGE} AS gateway

ARG VERILIO_VERSION=development
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Verilio Gateway" \
      org.opencontainers.image.version="${VERILIO_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"

RUN addgroup -S -g 10001 verilio && \
    adduser -S -D -H -u 10001 -G verilio verilio

COPY --chown=verilio:verilio deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=verilio:verilio /workspace/apps/web/dist /srv/verilio

USER verilio

EXPOSE 8080
