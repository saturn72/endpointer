# 004 — API: Usage Tracking

## Context
Every successful feed delivery must record a usage event. This prompt implements the usage tracking module in `apps/api` — writing a usage record to `postgres-api` after each successful request.

## Depends on
- `.prompts/api/003-feed-delivery.md`

## Goal
A `UsageModule` that intercepts successful feed responses and writes a usage record to `postgres-api` asynchronously — without blocking the feed response.

## Tasks
1. Create `UsageModule` with `UsageService` and `UsageRepository`
2. Create `usage_records` table in `postgres-api` via Drizzle (separate schema from `postgres-web`)
3. Integrate usage write into `FeedService` — fire and forget after response
4. Expose `GET /usage/{endpointId}` (internal, no auth for MVP — called by `apps/web` dashboard)

## Usage record schema (postgres-api)
```
usage_records
  id              uuid PK default gen_random_uuid()
  subscriber_id   text NOT NULL   -- Clerk user ID
  endpoint_id     uuid NOT NULL
  feed_version    text NOT NULL
  format          text NOT NULL   -- 'csv'|'xml'|'json'
  requested_at    timestamp NOT NULL default now()
  response_status integer NOT NULL
```

## Usage write flow
```
FeedService.deliver() completes successfully
  → setImmediate(() => usageService.record({...}))
  → UsageRepository.insert(record)
  → If insert fails: log error, do NOT throw (never fail a feed response due to usage tracking)
```

## Internal usage query endpoint
```
GET /internal/usage/endpoint/{endpointId}
Response: {
  endpointId: string,
  totalRequests: number,
  bySubscriber: { subscriberId: string, count: number }[]
}
```

This endpoint is called by `apps/web` dashboard to display usage. No auth in MVP — internal network only.

## Drizzle setup for postgres-api
- Install `drizzle-orm` + `drizzle-kit` + `postgres` in `apps/api`
- Create `src/db/schema/usage-records.ts`
- Create `src/db/index.ts` — Drizzle client for `postgres-api`
- `DATABASE_URL` env var points to `postgres-api` (port 5433)

## Acceptance criteria
- [ ] Successful feed request → usage record appears in `postgres-api.usage_records`
- [ ] Failed feed request (401/403/404) → no usage record written
- [ ] Usage write failure does not affect feed response
- [ ] `GET /internal/usage/endpoint/{endpointId}` returns correct counts
- [ ] `totalRequests` matches number of records for that endpoint
- [ ] `bySubscriber` groups correctly
- [ ] Zero TypeScript errors
- [ ] Migration applies cleanly to `postgres-api`

## Output files
- `apps/api/src/usage/usage.module.ts`
- `apps/api/src/usage/usage.service.ts`
- `apps/api/src/usage/usage.repository.ts`
- `apps/api/src/usage/usage.controller.ts`
- `apps/api/src/db/schema/usage-records.ts`
- `apps/api/src/db/index.ts`
- `apps/api/drizzle.config.ts`
- `apps/api/migrations/0001_usage_records.sql`

## Notes
- `setImmediate` for fire-and-forget — keeps response latency clean
- Usage write errors must log: `subscriberId`, `endpointId`, `version`, `format`, error message
- Post-MVP: replace internal HTTP with NATS event for usage, add time-series analytics
- Do not aggregate in MVP — raw records only, aggregate on query
