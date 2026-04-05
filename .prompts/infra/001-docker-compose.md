# 001 — Infrastructure: Docker Compose

## Context
Sets up the full local development infrastructure for Endpointer.
This is the first prompt to run — all subsequent prompts depend on these services being available.

## Depends on
Nothing — this is the first prompt.

## Goal
A working `docker-compose.yml` at the repo root that starts all infrastructure services needed for local development. Running `docker compose up -d` must bring up all services with no manual configuration.

## Tasks
1. Create `docker-compose.yml` with the following services:
   - **postgres-web** — PostgreSQL for `apps/web` (Command side: publishers, subscribers, endpoints, datafeeds, usage)
   - **postgres-api** — PostgreSQL for `apps/api` (Query side: usage counts)
   - **mongodb** — MongoDB for `apps/api` (feed snapshots, version pointers)
   - **nats** — NATS server (message bus)
   - **minio** — MinIO S3-compatible storage (original uploaded files)

2. Create `.env.example` at repo root with all service connection strings

3. Create `docker-compose.override.yml.example` for any local overrides

4. Create `infra/init/postgres-web.sql` — init script creating the `endpointer_web` database
5. Create `infra/init/postgres-api.sql` — init script creating the `endpointer_api` database

## Service configuration

### postgres-web
- Image: `postgres:16-alpine`
- Port: `5432`
- Database: `endpointer_web`
- Credentials via environment variables

### postgres-api
- Image: `postgres:16-alpine`
- Port: `5433`
- Database: `endpointer_api`
- Credentials via environment variables

### mongodb
- Image: `mongo:7`
- Port: `27017`
- Database: `endpointer_query`
- Credentials via environment variables

### nats
- Image: `nats:2.10-alpine`
- Port: `4222` (client), `8222` (monitoring)
- Enable JetStream: `-js` flag

### minio
- Image: `minio/minio:latest`
- Port: `9000` (API), `9001` (console)
- Default bucket: `endpointer-feeds`
- Start command: `server /data --console-address ":9001"`

## Acceptance criteria
- [ ] `docker compose up -d` starts all 5 services with no errors
- [ ] `docker compose ps` shows all services as healthy
- [ ] PostgreSQL web DB accessible on port 5432
- [ ] PostgreSQL api DB accessible on port 5433
- [ ] MongoDB accessible on port 27017
- [ ] NATS accessible on port 4222, monitoring on 8222
- [ ] MinIO console accessible on port 9001
- [ ] All credentials reference environment variables — no hardcoded secrets
- [ ] `.env.example` documents every variable used in `docker-compose.yml`

## Output files
- `docker-compose.yml`
- `.env.example`
- `docker-compose.override.yml.example`
- `infra/init/postgres-web.sql`
- `infra/init/postgres-api.sql`

## Notes
- Use Docker named volumes for all data persistence (not bind mounts)
- Add `healthcheck` to each service so dependent services wait correctly
- All service names must match the environment variable names in `.env.example`
- MinIO bucket creation can be done via `mc` in an init container or via the console — document whichever approach is used
- This setup is for local development only — production deployment is Docker Compose on VPS (separate prompt)
