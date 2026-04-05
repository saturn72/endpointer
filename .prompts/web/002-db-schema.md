# 002 — Packages: Drizzle DB Schema

## Context
Creates the `packages/db` workspace package containing the Drizzle ORM schema and migrations for the Command side PostgreSQL database (`endpointer_web`). Used exclusively by `apps/web`.

## Depends on
- `.prompts/infra/001-docker-compose.md`
- `.prompts/web/001-types-scaffold.md`

## Goal
A Drizzle schema covering all Command side tables, with migrations ready to run against `postgres-web`.

## Tasks
1. Scaffold `packages/db` as a pnpm workspace package
2. Install `drizzle-orm`, `drizzle-kit`, `postgres` (pg driver)
3. Define all tables
4. Configure `drizzle.config.ts`
5. Generate and run initial migration

## Tables to define

### `publishers`
```
id          uuid PK default gen_random_uuid()
clerk_user_id  text UNIQUE NOT NULL
name        text UNIQUE NOT NULL  -- URL slug e.g. "acme-widgets"
display_name text NOT NULL
created_at  timestamp default now()
```

### `subscribers`
```
id          uuid PK default gen_random_uuid()
clerk_user_id  text UNIQUE NOT NULL
email       text NOT NULL
created_at  timestamp default now()
```

### `datafeeds`
```
id              uuid PK default gen_random_uuid()
publisher_id    uuid FK → publishers.id NOT NULL
name            text NOT NULL
description     text
current_version text NOT NULL default '1.0.0'
last_ingested_at timestamp
row_count       integer
s3_key          text   -- path to latest original file in MinIO
created_at      timestamp default now()
UNIQUE(publisher_id, name)
```

### `endpoints`
```
id           uuid PK default gen_random_uuid()
datafeed_id  uuid FK → datafeeds.id NOT NULL
publisher_id uuid FK → publishers.id NOT NULL
name         text NOT NULL  -- URL slug e.g. "prices"
created_at   timestamp default now()
UNIQUE(publisher_id, name)
```

### `subscriptions`
```
id            uuid PK default gen_random_uuid()
subscriber_id uuid FK → subscribers.id NOT NULL
endpoint_id   uuid FK → endpoints.id NOT NULL
status        text NOT NULL default 'pending'  -- 'pending'|'approved'|'rejected'
created_at    timestamp default now()
updated_at    timestamp default now()
UNIQUE(subscriber_id, endpoint_id)
```

### `usage_records`
```
id            uuid PK default gen_random_uuid()
subscriber_id uuid FK → subscribers.id NOT NULL
endpoint_id   uuid FK → endpoints.id NOT NULL
feed_version  text NOT NULL
format        text NOT NULL   -- 'csv'|'xml'|'json'
requested_at  timestamp NOT NULL default now()
response_status integer NOT NULL
```

## Acceptance criteria
- [ ] `packages/db` builds with zero TypeScript errors
- [ ] Package importable from `apps/web` via workspace alias `@endpointer/db`
- [ ] All 6 tables defined with correct types, PKs, FKs, and constraints
- [ ] `drizzle-kit generate` produces a valid migration file
- [ ] Migration applies cleanly to `endpointer_web` database with zero errors
- [ ] `drizzle.config.ts` reads `DATABASE_URL` from environment — no hardcoded connection strings

## Output files
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/drizzle.config.ts`
- `packages/db/src/index.ts`
- `packages/db/src/schema/publishers.ts`
- `packages/db/src/schema/subscribers.ts`
- `packages/db/src/schema/datafeeds.ts`
- `packages/db/src/schema/endpoints.ts`
- `packages/db/src/schema/subscriptions.ts`
- `packages/db/src/schema/usage-records.ts`
- `packages/db/migrations/0001_init.sql` (generated)

## Notes
- Use `pgTable` from `drizzle-orm/pg-core`
- All UUIDs use `uuid('id').primaryKey().defaultRandom()`
- `status` on subscriptions is a text column with a check constraint — not a Postgres enum (easier to extend)
- Do not add indexes in MVP — post-MVP performance optimization
- `DATABASE_URL` must point to `postgres-web` (port 5432), not `postgres-api`
