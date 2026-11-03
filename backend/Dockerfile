# CivicFix backend: container image for Fly.io.
# Two stages: build (generates the Prisma client + compiles TS), then a slim
# runtime that carries only production deps + the compiled dist.
# Node 24 LTS (matches .nvmrc and package.json engines).

# ---- build ----
FROM node:24-slim AS build
# openssl is required by Prisma's schema engine (prisma migrate deploy).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install all deps (incl. dev) against the lockfile for a reproducible build.
# The schema and Prisma config come first: npm ci's postinstall runs
# `prisma generate`, which writes the client into src/generated/.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Compile TypeScript (app code and the generated client) to dist/.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies. The compiled client in dist/ needs only
# @prisma/client and the pg adapter at runtime.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

# Run as the image's unprivileged `node` user, not root. It owns the app
# files and the local uploads directory (the only path the app writes to).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
# Read by Fly's release_command (prisma migrate deploy).
COPY --from=build --chown=node:node /app/prisma.config.ts ./
COPY --chown=node:node package.json ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 8080
CMD ["node", "dist/server.js"]
