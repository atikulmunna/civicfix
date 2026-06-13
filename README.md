# CivicFix 
A full-stack web app for reporting and resolving local civic issues. Citizens
report problems (potholes, broken lights, garbage, flooding) with a photo and
map location; the community confirms and discusses them; admins verify and
assign them to departments; departments resolve them — with status tracked end
to end through an explicit state machine and in-app notifications.

## Stack

- **Backend:** Node + Express + TypeScript, Prisma ORM, PostgreSQL 16 + PostGIS,
  JWT auth (httpOnly cookie access token + rotating refresh token), argon2id
  hashing, Multer + magic-byte upload validation, Zod, Vitest.
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4,
  React-Leaflet + OpenStreetMap, Vitest + React Testing Library.
- **Free-tier only** — no paid APIs. Local file storage for uploads; OSM tiles.

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL + PostGIS)

## Quick start

```bash
# 1. Database (PostgreSQL + PostGIS on host port 5433)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env            # adjust secrets as needed
npm install
npx prisma generate
npx prisma migrate deploy       # apply schema + PostGIS trigger/index
npm run seed                    # demo data (optional but recommended)
npm run dev                     # http://localhost:5000

# 3. Frontend (in a second terminal)
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL defaults to localhost:5000
npm install
npm run dev                     # http://localhost:3000
```

Open http://localhost:3000.

### Demo logins (after `npm run seed`)

All seeded accounts use the password **`Password123!`**:

| Role | Email |
|---|---|
| Super admin | `super@civicfix.local` |
| Admin | `admin@civicfix.local` |
| Department worker | `worker.publicworks@civicfix.local` |
| Citizen | `citizen1@civicfix.local` |

## Environment variables

**Backend (`backend/.env`)** — see `backend/.env.example`:

- `DATABASE_URL` — Postgres connection (matches docker-compose, port 5433)
- `JWT_ACCESS_SECRET` — long random string (required)
- `JWT_ACCESS_EXPIRES_IN` (default `15m`), `REFRESH_TOKEN_TTL_DAYS` (default `7`)
- `CORS_ORIGIN` (default `http://localhost:3000`)
- `MAX_UPLOAD_BYTES` (default 5 MB), `LOCAL_UPLOAD_DIR` (default `uploads`)
- Rate limits: `RATE_LIMIT_REPORTS_PER_HOUR`, `RATE_LIMIT_COMMENTS_PER_HOUR`,
  `RATE_LIMIT_AUTH_PER_15MIN`

**Frontend (`frontend/.env.local`)** — see `frontend/.env.example`:

- `NEXT_PUBLIC_API_URL` — backend base URL (default `http://localhost:5000/api/v1`)

## Testing

```bash
cd backend && npm test     # integration + unit tests (real Docker DB)
cd frontend && npm test     # component tests (Vitest + React Testing Library)
```

The backend suite runs against the Docker database, so make sure
`docker compose up -d` is running and migrations are applied first.

## Project structure

```
backend/
  prisma/                 schema, migrations (PostGIS), seed.ts
  src/
    config/               validated env
    lib/                  prisma, errors, http envelope, uploads, sanitize
    middleware/           requireAuth/requireRole, rate limiting
    modules/
      auth/               register/login/logout/refresh/me, tokens, password
      reports/            CRUD, geo (PostGIS), status-machine (§26)
      community/          comments, votes, subscriptions
      admin/              workflow, analytics, users + catalog CRUD
      notifications/      status-change notifications
      users/              self-service profile (/users/me)
frontend/
  app/                    App Router pages (public, citizen, admin, department)
  components/             UI primitives, cards, map, charts, providers
  lib/                    api client, types, formatting, map helpers
```

## Key design notes

- **Status state machine (§26):** all report status changes flow through one
  guarded transition (`assertTransition`) that enforces legal moves, role
  permissions, required side effects, and always writes a status-history row.
- **Auth:** short-lived access JWT in an httpOnly cookie + opaque rotating
  refresh token stored hashed and revocable server-side; logout revokes it.
- **Geospatial:** `location geography(Point,4326)` is derived from lat/lng by a
  DB trigger and indexed with GiST; nearby/duplicate use `ST_DWithin`.
- **Uploads:** image type verified by magic bytes (not client content-type),
  size-capped, stored with random keys outside the app webroot.

## Deployment (free tier)

Three services: a managed Postgres+PostGIS database, the API, and the web app.
Recommended free hosts: **Supabase** (DB), **Render** (API), **Vercel** (web).
The repo is pre-configured — you only enter the env values below.

### 1. Database — Supabase
1. Create a project, then in the SQL editor run: `create extension if not exists postgis;`
2. Settings → Database → copy the connection string (**URI**) → this is `DATABASE_URL`.
3. From your machine, apply the schema once:
   ```bash
   cd backend
   DATABASE_URL="<supabase-uri>" npx prisma migrate deploy
   DATABASE_URL="<supabase-uri>" npm run seed   # optional demo data
   ```

### 2. API — Render
- New + → **Blueprint** → select this repo. `render.yaml` pre-fills the build,
  start, health check, and auto-generates `JWT_ACCESS_SECRET`.
- Set the two `sync: false` vars in the dashboard:
  - `DATABASE_URL` — the Supabase URI
  - `CORS_ORIGIN` — your Vercel URL (fill in after step 3)
- You get a URL like `https://civicfix-api.onrender.com`.

### 3. Web — Vercel
- Add New → Project → import this repo, **Root Directory: `frontend`**.
- Environment variables:
  - `BACKEND_URL` = your Render URL (e.g. `https://civicfix-api.onrender.com`)
  - `NEXT_PUBLIC_API_URL` = `/api/v1`
- Deploy. `next.config.ts` proxies `/api/*` and `/uploads/*` to the backend, so
  the browser stays same-origin and the httpOnly auth cookies work.

Both Render and Vercel redeploy automatically on every push to `main`.

| Where | Variable | Value |
|---|---|---|
| Render | `DATABASE_URL` | Supabase connection URI |
| Render | `JWT_ACCESS_SECRET` | auto-generated by `render.yaml` |
| Render | `CORS_ORIGIN` | your Vercel URL |
| Render | `NODE_ENV` | `production` (preset) |
| Vercel | `BACKEND_URL` | your Render URL |
| Vercel | `NEXT_PUBLIC_API_URL` | `/api/v1` |

> **Free-tier notes:** Render free services sleep after ~15 min idle (first
> request is slow); Supabase free projects pause after ~7 days idle (resume from
> the dashboard). Uploaded images live on the API's ephemeral disk, so they are
> cleared on redeploy — wire up Supabase Storage / Cloudinary in
> `backend/src/lib/uploads.ts` if you need them to persist.
