# Endpointer — AGENTS.md

## How to run
Execute the next task in sequence:
```bash
./run.sh
```
This reads `ROADMAP.md`, finds the first unchecked task, executes the referenced prompt file, marks it done, then commits and pushes. Run once per task. Verify the result before running again.

---

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
.prompts/infra/001-docker-compose.md
.prompts/api/001-project-scaffold.md
.prompts/api/002-nats-subscriber.md
.prompts/web/001-project-scaffold.md
.prompts/web/002-clerk-auth.md
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

### CLI-first rule (critical)
6. **Always prefer CLI tools to scaffold, generate, and create content** — never write boilerplate by hand when a CLI can generate it
7. Use the official CLI for every framework and tool:
   - Scaffold Next.js app: `pnpm create next-app@latest`
   - Scaffold NestJS app: `pnpm dlx @nestjs/cli new`
   - Add NestJS module/service/controller: `nest generate module`, `nest generate service`, `nest generate controller`
   - Generate Drizzle migrations: `drizzle-kit generate`
   - Run Drizzle migrations: `drizzle-kit migrate`
   - Add pnpm workspace package: `pnpm add <pkg> --filter <app>`
8. Only write files manually when no CLI exists for that output
9. Always run the CLI first, then modify the generated output — never start from scratch

### Versioning rule (critical)
10. **Always use the latest stable version of every package, tool, and utility**
11. Never pin to a specific version unless a documented compatibility conflict requires it — and if so, add a comment explaining why
12. When installing packages always use `@latest` tag: `pnpm add <pkg>@latest`
13. Before scaffolding any app, verify the CLI itself is the latest: `pnpm dlx <cli>@latest`

### Code isolation rule (critical)
14. **Never share code between `apps/web` and `apps/api`** — they are independent services
15. Each app defines its own types, utilities, and helpers in its own `src/` directory
16. No cross-app imports — `apps/web` never imports from `apps/api` and vice versa
17. The `packages/` directory must never be created — there are no shared packages in this repo
18. The only cross-app contract is the NATS event payload — documented in `docs/events.md`, each app defines its own local type matching that contract

### CQRS rule (critical)
19. **Command and Query sides must be fully compatible and fully decoupled**
20. Command side (`apps/web`) — handles all mutations: publisher/subscriber management, ingestion, approvals
21. Query side (`apps/api`) — handles all reads: feed delivery, usage tracking
22. Command and Query sides communicate exclusively via NATS — never via direct HTTP calls, shared DB connections, or shared code
23. Command side never reads from the Query DB (MongoDB) — it writes to PostgreSQL and publishes NATS events only
24. Query side never writes to the Command DB (PostgreSQL web) — it reads from MongoDB and writes to its own PostgreSQL only
25. Adding a new feature must not require modifying both sides simultaneously — each side evolves independently
26. NATS event payloads are the only coupling point — changes to event schema must be reflected in `docs/events.md` first, then updated in each app independently

### Code quality
27. TypeScript strict mode — no `any`, no `@ts-ignore`
28. Zod schemas for every external input (form data, API params, NATS payloads, file uploads)
29. Every server action and API route must validate input before touching the DB
30. Never hardcode secrets — always use environment variables
31. Never store files on local disk — always use S3-compatible storage (MinIO)

### Git
32. One prompt file = one logical git commit
33. Commit message format: `feat({app}): {slug}` (e.g. `feat(web): clerk-auth`)
34. Never commit `.env` files — only `.env.example`
35. After every completed prompt: `git add -A && git commit -m 'feat({app}): {slug}' && git push`

### File output
36. Every prompt must declare its output files explicitly in the `## Output files` section
37. Always produce a `.env.example` update when adding new environment variables

## Prompt execution order

### Phase 1 — Infrastructure
```
infra/001-docker-compose.md        # PostgreSQL ×2, MongoDB, NATS, MinIO
```

### Phase 2 — API app (NestJS — Query side)
```
api/001-project-scaffold.md        # nest new, MongoDB + NATS connections, health endpoint
api/002-nats-subscriber.md         # subscribe to datafeed.version.created, write to MongoDB
api/003-feed-delivery.md           # GET /{publisher}/{endpoint}?format=, Clerk auth, serve from MongoDB
api/004-usage-tracking.md          # write usage records to postgres-api on every successful request
```

### Phase 3 — Web app (Next.js — Command side)
```
web/001-project-scaffold.md        # create next-app, PWA config, Clerk, Drizzle, NATS publisher, MinIO
web/002-db-schema.md               # Drizzle schema inside apps/web/src/db/, generate + migrate via CLI
web/003-clerk-auth.md              # sign in, sign up, role selection onboarding, route protection
web/004-dashboard-layout.md        # sidebar, role-aware nav, home overview page
web/005-publisher-datafeed.md      # publisher profile, create datafeeds, create endpoints
web/006-publisher-upload.md        # file upload → parse → version bump → MinIO → NATS publish
web/007-publisher-approvals.md     # approve/reject subscriber requests, publisher usage view
web/008-subscriber-discover.md     # browse endpoints, request subscriptions, subscription status
web/009-subscriber-credentials.md  # generate/rotate client credentials, subscriber usage view
```

## Environment variables convention
Every app must have a `.env.example` at its root. Agent must update it when adding new variables.

### apps/web
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# PostgreSQL (Command — postgres-web port 5432)
DATABASE_URL=

# NATS
NATS_URL=nats://localhost:4222

# S3-compatible storage (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=endpointer-feeds
S3_REGION=us-east-1

# Internal API base URL
INTERNAL_API_URL=http://localhost:3001

# Public API base URL (shown in endpoint URLs)
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### apps/api
```
# Clerk
CLERK_SECRET_KEY=

# MongoDB (Query)
MONGODB_URI=mongodb://localhost:27017/endpointer_query

# PostgreSQL (Usage — postgres-api port 5433)
DATABASE_URL=postgresql://user:pass@localhost:5433/endpointer_api

# PostgreSQL (Web — read only, port 5432)
DATABASE_URL_WEB=postgresql://user:pass@localhost:5432/endpointer_web

# NATS
NATS_URL=nats://localhost:4222

# App
PORT=3001
```
