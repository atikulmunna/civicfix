# CivicFix backend: container image for Fly.io.
# Two stages: build (compiles TS + generates the Prisma client), then a slim
# runtime that carries only production deps + the compiled dist.

# ---- build ----
FROM node:20-slim AS build
# openssl is required by Prisma's query engine (both to generate and at runtime).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install all deps (incl. dev) against the lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client, then compile TypeScript to dist/.
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies; the generated Prisma client in node_modules/.prisma
# is not an npm package, so prune leaves it in place.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 8080
CMD ["node", "dist/server.js"]
