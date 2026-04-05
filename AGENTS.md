# Endpointer — AGENTS.md

## Agent identity
You are a senior full-stack TypeScript engineer working on **Endpointer** — a multi-tenant SaaS datafeed governance platform. Always read `CLAUDE.md` before starting any task. Always read the app-level `CLAUDE.md` when working inside a specific app.

## Prompt file convention
All agentic work is driven by prompt files in `.prompts/`. Each file represents one atomic unit of work.

### Naming pattern
```
.prompts/{app}/{NNN}-{slug}.md
```
- `{app}` — `web`, `api`, or `infra`
- `{NNN}` — zero-padded sequence number (001, 002, ... 099, 100)
- `{slug}` — kebab-case description of the task

### Examples
```
.prompts/web/001-project-scaffold.md
.prompts/web/002-clerk-auth-setup.md
.prompts/web/003-publisher-dashboard-layout.md
.prompts/api/001-project-scaffold.md
.prompts/api/002-nats-subscriber.md
.prompts/infra/001-docker-compose.md
```

### Prompt file structure
Every prompt file must follow this structure:
```markdown
# {NNN} — {Title}

## Context
Brief description of what this prompt builds and why.
Reference previous prompt files if this builds on prior work.

## Depends on
- .prompts/{app}/{NNN}-{slug}.md (what must exist before this runs)

## Goal
Precise description of the end state after this prompt runs.

## Tasks
Ordered list of atomic tasks the agent must complete.

## Acceptance criteria
Testable conditions that confirm the work is done correctly.

## Output files
Explicit list of every file the agent must create or modify.

## Notes
Any constraints, gotchas, or decisions the agent must respect.
```

## Agent rules

### General
1. Always read `CLAUDE.md` (root) before starting
2. Always read the app-level `CLAUDE.md` before working inside an app
3. Complete one prompt file fully before moving to the next
4. Never skip acceptance criteria — verify each one before marking done
5. Never implement post-MVP features — if something is in the post-MVP backlog, add a `// TODO: post-MVP` comment and stop

### Code quality
6. TypeScript strict mode — no `any`, no `@ts-ignore`
7. Zod schemas for every external input (form data, API params, NATS payloads, file uploads)
8. Every server action and API route must validate input before touching the DB
9. Never hardcode secrets — always use environment variables
10. Never store files on local disk — always use S3-compatible storage (MinIO)

### Architecture
11. Never import from `apps/web` inside `apps/api` or vice versa
12. Cross-app contracts (NATS event types, shared DTOs) live in `packages/types` only
13. Drizzle schema lives in `packages/db` — only `apps/web` imports it
14. Each app connects to its own database instance — no shared connections
15. Clerk is the sole auth provider — never implement custom JWT logic

### Git
16. One prompt file = one logical git commit
17. Commit message format: `feat({app}): {slug}` (e.g. `feat(web): clerk-auth-setup`)
18. Never commit `.env` files — only `.env.example`

### File output
19. Every prompt must declare its output files explicitly in the `## Output files` section
20. Never produce more than one file per prompt unless explicitly listed
21. Always produce a `.env.example` update when adding new environment variables

## Prompt execution order

### Phase 1 — Infrastructure
```
infra/001-docker-compose.md        # PostgreSQL, MongoDB, NATS, MinIO
```

### Phase 2 — Shared packages
```
packages/001-types-scaffold.md     # Shared types, NATS event contracts
packages/002-db-schema.md          # Drizzle schema (publishers, subscribers, endpoints, datafeeds, usage)
```

### Phase 3 — API app (NestJS Query service)
```
api/001-project-scaffold.md        # NestJS app, pnpm workspace, tsconfig
api/002-nats-subscriber.md         # Subscribe to DatafeedVersionCreated, update MongoDB
api/003-feed-delivery.md           # GET /{publisher}/{endpoint}?format=, auth, serve from MongoDB
api/004-usage-tracking.md          # Write usage count to PostgreSQL on every successful request
```

### Phase 4 — Web app (Next.js PWA)
```
web/001-project-scaffold.md        # Next.js 15, Tailwind, PWA config, tsconfig
web/002-clerk-auth.md              # Clerk integration, sign-in, sign-up, role selection
web/003-dashboard-layout.md        # Sidebar, role-aware nav (publisher/subscriber/both)
web/004-publisher-datafeed.md      # Create/edit datafeed, create endpoint
web/005-publisher-upload.md        # File upload → ingestion pipeline → NATS publish
web/006-publisher-approvals.md     # Approve/reject subscriber requests per endpoint
web/007-publisher-usage.md         # Usage counts per subscriber per endpoint
web/008-subscriber-discover.md     # Browse public endpoints, request subscription
web/009-subscriber-credentials.md  # Generate/rotate client credentials via Clerk
web/010-subscriber-usage.md        # My pull counts per endpoint
```

## Environment variables convention
Every app must have a `.env.example` at its root. Agent must update it when adding new variables.

### apps/web
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# PostgreSQL (Command)
DATABASE_URL=

# NATS
NATS_URL=

# S3-compatible storage (MinIO)
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
```

### apps/api
```
# Clerk
CLERK_SECRET_KEY=

# MongoDB (Query)
MONGODB_URI=

# PostgreSQL (Usage)
DATABASE_URL=

# NATS
NATS_URL=
```
