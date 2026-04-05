# 001 — API: Project Scaffold

## Context
Scaffolds `apps/api` — the NestJS Query service. This app has one job: authenticate subscribers and serve the latest datafeed snapshot from MongoDB in the requested format (CSV / XML / JSON).

## Depends on
- `.prompts/infra/001-docker-compose.md`
- `.prompts/web/001-types-scaffold.md`

## Goal
A working NestJS app in `apps/api` that starts, connects to MongoDB and NATS, and is ready for feed delivery implementation.

## Tasks
1. Scaffold NestJS app using `@nestjs/cli` inside `apps/api`
2. Configure pnpm workspace (`package.json` name: `@endpointer/api`)
3. Install and configure dependencies:
   - `@nestjs/mongoose` + `mongoose` — MongoDB connection
   - `nats` — NATS client
   - `@nestjs/config` — environment variables
   - `@clerk/backend` — token verification
   - `@endpointer/types` — shared types
4. Create `AppModule` wiring up: `ConfigModule`, `MongooseModule`, NATS connection
5. Create `.env.example` with all required variables
6. Configure `tsconfig.json` (strict mode, path aliases)
7. Confirm app starts with `pnpm dev`

## App responsibilities (scope guard)
This app does ONLY:
- Subscribe to NATS `datafeed.version.created` → update MongoDB
- Serve `GET /{publisher_name}/{endpoint_name}?format=csv|xml|json`
- Verify Clerk bearer token on every request
- Write usage record to `postgres-api` on every successful request

This app does NOT:
- Manage publishers, subscribers, or subscriptions (that is `apps/web`)
- Handle file uploads
- Send emails or notifications

## MongoDB collections to connect
- `feed_snapshots` — `{ endpointId, version, ingestedAt, content: Record<string,string>[], sourceFormat }`
- `version_pointers` — `{ endpointId, latestVersion }`

## Environment variables
```
# Clerk
CLERK_SECRET_KEY=

# MongoDB
MONGODB_URI=mongodb://user:pass@localhost:27017/endpointer_query

# PostgreSQL (usage)
DATABASE_URL=postgresql://user:pass@localhost:5433/endpointer_api

# NATS
NATS_URL=nats://localhost:4222

# App
PORT=3001
```

## Acceptance criteria
- [ ] `pnpm dev` starts the app on port 3001 with no errors
- [ ] App connects to MongoDB on startup (log confirms connection)
- [ ] App connects to NATS on startup (log confirms connection)
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] TypeScript strict mode, zero errors on `tsc --noEmit`
- [ ] `.env.example` documents all variables
- [ ] `@endpointer/types` importable with no errors

## Output files
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/.env.example`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/health/health.controller.ts`

## Notes
- Port 3001 for API, port 3000 reserved for `apps/web`
- Use `@nestjs/config` with validation via Zod or Joi — never access `process.env` directly
- NATS connection should reconnect automatically on disconnect
- Do not use `@nestjs/microservices` for NATS — use the `nats` npm package directly for more control
