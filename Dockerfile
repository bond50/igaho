# syntax=docker/dockerfile:1.6

############################
# Shared Node base (Debian slim, not Alpine)
############################
ARG NODE_VERSION=24.11.0-slim

FROM node:${NODE_VERSION} AS base
WORKDIR /app

# Basic OS deps (includes wget for HEALTHCHECK)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     wget \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack (Node 24 ships corepack)
RUN corepack enable

ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

############################
# Deps (cache pnpm store)
############################
FROM base AS deps

# Copy only manifests + prisma for better layer caching AND to satisfy prisma generate
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install prod + dev deps so prisma CLI is available during build
# (pnpm store cache mounted for speed)
# NOTE: DO NOT disable optional deps; sharp needs platform-specific optional packages.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --dangerously-allow-all-builds

############################
# Build (standalone)
############################
FROM base AS build
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Show toolchain versions (so CI logs reveal what's running)
# NOTE: Prisma uses local CLI, not dlx (but we log both for debug).
RUN node -v && pnpm -v && pnpm dlx next --version || true && pnpm prisma -v || true

# Generate Prisma client (no DB connection needed)
RUN pnpm prisma generate

# Next.js standalone build (requires next.config.js => output: 'standalone')
ARG CI=1
ENV CI=${CI}

RUN --mount=type=cache,target=/app/.next/cache \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm run build

############################
# Runtime
############################
FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    RUN_MIGRATIONS=true \
    NEXT_CACHE_DIR=/app/.next/cache

# Non-root user (uid/gid = 1001)
RUN groupadd -g 1001 nodejs \
  && useradd -u 1001 -g nodejs -m nextjs

# App files from standalone build (server.js + minimal runtime bundle)
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Bring full node_modules from build (includes next + @swc/helpers + prisma CLI + sharp)
COPY --from=build /app/node_modules ./node_modules

# Ensure Next image optimizer cache is writable by non-root
RUN mkdir -p /app/.next/cache /app/public/uploads \
 && chown -R 1001:1001 /app/.next /app/public /app/prisma /app/node_modules /app/prisma.config.ts

# Entry script: optionally run migrations, then start Next server
RUN printf '%s\n' '#!/usr/bin/env sh' \
  'set -e' \
  'echo "entrypoint: starting (RUN_MIGRATIONS=${RUN_MIGRATIONS})"' \
  'if [ "${RUN_MIGRATIONS}" = "true" ]; then' \
  '  if [ -n "${DATABASE_URL:-}" ]; then' \
  '    if [ -x "/app/node_modules/.bin/prisma" ]; then' \
  '      echo "entrypoint: running prisma migrate deploy...";' \
  '      /app/node_modules/.bin/prisma migrate deploy || { echo "migrate failed"; exit 1; }' \
  '    else' \
  '      echo "entrypoint: prisma CLI missing"; exit 1' \
  '    fi' \
  '  else' \
  '    echo "entrypoint: DATABASE_URL missing; cannot run migrations" >&2; exit 1' \
  '  fi' \
  'fi' \
  'exec node server.js' > /entrypoint.sh \
 && chmod +x /entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
