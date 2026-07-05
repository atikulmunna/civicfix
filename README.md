# CivicFix 
A full-stack web app for reporting and resolving local civic issues. Citizens
report problems (potholes, broken lights, garbage, flooding) with a photo and
map location; the community confirms and discusses them; admins verify and
assign them to departments; departments resolve them, with status tracked end
to end through an explicit state machine and in-app notifications.

## Stack

- **Backend:** Node + Express + TypeScript, Prisma ORM, PostgreSQL 16 + PostGIS,
  JWT auth (httpOnly cookie access token + rotating refresh token), argon2id
  hashing, Multer + magic-byte upload validation, Zod, Vitest.
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4,
  React-Leaflet + OpenStreetMap, Vitest + React Testing Library.
- **Free-tier only.** No paid APIs. Local file storage for uploads; OSM tiles.

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

**Backend (`backend/.env`)**, see `backend/.env.example`:

- `DATABASE_URL`: Postgres connection (matches docker-compose, port 5433)
- `JWT_ACCESS_SECRET`: long random string (required)
- `JWT_ACCESS_EXPIRES_IN` (default `15m`), `REFRESH_TOKEN_TTL_DAYS` (default `7`)
- `CORS_ORIGIN` (default `http://localhost:3000`)
- `MAX_UPLOAD_BYTES` (default 5 MB), `LOCAL_UPLOAD_DIR` (default `uploads`)
- Rate limits: `RATE_LIMIT_REPORTS_PER_HOUR`, `RATE_LIMIT_COMMENTS_PER_HOUR`,
  `RATE_LIMIT_AUTH_PER_15MIN`

**Frontend (`frontend/.env.local`)**, see `frontend/.env.example`:

- `NEXT_PUBLIC_API_URL`: backend base URL (default `http://localhost:5000/api/v1`)

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
Recommended free hosts: **Supabase** (DB), **Fly.io** (API), **Vercel** (web).
Fly keeps one machine always on, so there are no cold starts. The repo is
pre-configured, and you only enter the env values below.

### 1. Database: Supabase
1. Create a project, then in the SQL editor run: `create extension if not exists postgis;`
2. Settings → Database → copy the connection string (**URI**) → this is `DATABASE_URL`.
3. From your machine, apply the schema once:
   ```bash
   cd backend
   DATABASE_URL="<supabase-uri>" npx prisma migrate deploy
   DATABASE_URL="<supabase-uri>" npm run seed   # optional demo data
   ```

### 2. API: Fly.io
Install [`flyctl`](https://fly.io/docs/flyctl/install/) and `fly auth login`, then:
```bash
cd backend
fly launch --no-deploy --copy-config   # uses fly.toml; pick a unique app name if taken
fly secrets set \
  DATABASE_URL="<supabase-uri>" \
  JWT_ACCESS_SECRET="$(openssl rand -hex 32)" \
  CORS_ORIGIN="https://<your-app>.vercel.app"   # fill in after step 3
fly deploy
```
- `Dockerfile` builds the image (Prisma client + compiled `dist`); `fly.toml`
  keeps one 512 MB machine always on with a `/health` check.
- You get a URL like `https://civicfix-api.fly.dev`.
- Redeploy after any backend change with `fly deploy` (or wire up the Fly
  GitHub Action for auto-deploy on push).

### 3. Web: Vercel
- Add New → Project → import this repo, **Root Directory: `frontend`**.
- Environment variables:
  - `BACKEND_URL` = your Fly URL (e.g. `https://civicfix-api.fly.dev`)
  - `NEXT_PUBLIC_API_URL` = `/api/v1`
- Deploy. `next.config.ts` proxies `/api/*` and `/uploads/*` to the backend, so
  the browser stays same-origin and the httpOnly auth cookies work.

Vercel redeploys automatically on every push to `main`; redeploy the API with
`fly deploy`.

| Where | Variable | Value |
|---|---|---|
| Fly | `DATABASE_URL` | Supabase connection URI (`fly secrets set`) |
| Fly | `JWT_ACCESS_SECRET` | long random string (`fly secrets set`) |
| Fly | `CORS_ORIGIN` | your Vercel URL (`fly secrets set`) |
| Fly | `NODE_ENV` / `PORT` | `production` / `8080` (preset in `fly.toml`) |
| Vercel | `BACKEND_URL` | your Fly URL |
| Vercel | `NEXT_PUBLIC_API_URL` | `/api/v1` |

> **Free-tier notes:** Fly requires a card on file but keeps a single small
> machine effectively free; `min_machines_running = 1` avoids cold starts.
> Supabase free projects pause after ~7 days idle (resume from the dashboard).
> Uploaded images live on the machine's ephemeral disk, so they are cleared on
> redeploy. Attach a Fly volume, or wire up Supabase Storage / Cloudinary in
> `backend/src/lib/uploads.ts`, if you need them to persist.
