# Endpointer — CLAUDE.md

## Project
**Repo:** https://github.com/saturn72/endpointer
**Purpose:** Multi-tenant SaaS datafeed governance platform. Publishers expose managed datafeeds to approved subscribers via authenticated, versioned endpoints.

## How to run the agent
```bash
./run.sh
```
Reads `ROADMAP.md`, executes the first unchecked prompt, marks it done, commits and pushes. One task at a time.

## Monorepo structure
```
endpointer/
├── apps/
│   ├── web/              # Next.js PWA — Command side (all UI + mutations)
│   │   ├── src/
│   │   │   ├── db/       # Drizzle schema + migrations (web only)
│   │   │   └── types/    # Web-internal domain types
│   │   └── ...
│   └── api/              # NestJS — Query side (feed delivery only)
│       ├── src/
│       │   └── types/    # API-internal domain types
│       └── ...
├── .prompts/             # Agentic prompt files (sequential, per app)
│   ├── web/
│   ├── api/
│   └── infra/
├── docs/
│   └── events.md         # NATS event payload contracts (source of truth)
├── CLAUDE.md             # This file — global context
├── AGENTS.md             # Agent rules and conventions
├── ROADMAP.md            # Ordered task checklist
└── run.sh                # Execute next task: ./run.sh
```

## Tech stack
| Concern | Technology |
|---------|-----------|
| Dashboard UI | Next.js 15 (App Router), TypeScript, Tailwind CSS, PWA |
| Feed delivery API | NestJS, TypeScript |
| Auth | Clerk (email+password + SSO + OAuth2 client credentials) |
| Command DB | PostgreSQL (apps/web only, via Drizzle ORM) |
| Query DB | MongoDB (apps/api only) |
| Message bus | NATS (`DatafeedVersionCreated` event) |
| File storage | S3-compatible (MinIO for MVP) |
| Package manager | pnpm (workspaces) |
| Runtime | Node.js 20+ |

## Domain terminology (always use these terms)
- **Publisher** — registers and manages datafeed profiles and endpoints
- **Subscriber** — registers and consumes approved endpoints; a publisher may also be a subscriber
- **Datafeed** — the content unit (1 upstream source)
- **Endpoint** — a named delivery URL on a datafeed (1 datafeed : many endpoints)
- **Ingestion** — the pipeline from file upload to new version being available
- **Version** — semver, auto-incremented patch on every ingestion (always serves latest in MVP)

## URL pattern
```
GET /{publisher_name}/{endpoint_name}?format=csv|xml|json
```
Always serves latest version. No version pinning in MVP.

## CQRS architecture (strictly enforced)
- **Command side** (`apps/web`) — all mutations: publisher/subscriber management, ingestion, approvals
- **Query side** (`apps/api`) — all reads: feed delivery, usage tracking
- Sides communicate **exclusively via NATS** — never via direct HTTP, shared DB, or shared code
- Command writes to PostgreSQL and publishes NATS events — it never reads from MongoDB
- Query reads from MongoDB and writes to its own PostgreSQL — it never touches the Command DB
- Each side evolves independently — a feature change on one side must not force a change on the other
- NATS event payload is the only coupling point — documented in `docs/events.md`

## NATS event contract (source of truth: docs/events.md)
```typescript
// subject: 'datafeed.version.created'
{
  publisherId: string
  datafeedId: string
  endpointId: string
  version: string        // semver e.g. "1.0.22"
  ingestedAt: string     // ISO timestamp
  sourceFormat: 'csv' | 'xml' | 'json'
  rowCount: number
  s3Key: string          // path to original file in MinIO
}
```
Each app defines this type independently in its own `src/types/` — both must match `docs/events.md`.

## Key rules for the agent
1. **Always use latest stable versions** of every package, tool, and utility — use `@latest` on every install
2. **Never share code between apps** — `apps/web` and `apps/api` are fully independent services
3. **CQRS must be compatible and decoupled** — Command and Query sides communicate via NATS only
4. **Always prefer CLI tools** to scaffold and generate content — never write boilerplate by hand
5. Never create a `packages/` directory — there are no shared packages in this repo
6. Each app owns its own database instances — no shared DB connections across apps
7. All file uploads go to S3-compatible storage (MinIO) — never store files on disk
8. Clerk handles all auth — never implement custom auth logic
9. Version is always auto-incremented on ingestion — never manually set in MVP
10. Query service always serves latest version — no version pinning logic in MVP
11. Free tier MVP only — no subscription gating logic yet

## MVP scope (what to build)
- [ ] Publisher: register, create datafeed, create endpoint, upload file, approve subscribers
- [ ] Subscriber: register, discover endpoints, request subscription, generate credentials, pull feed
- [ ] Ingestion: parse CSV/XML/JSON, bump patch version, write to MongoDB, store original in MinIO, emit NATS event
- [ ] Query: authenticate token, resolve endpoint, serve latest from MongoDB, record usage
- [ ] Dashboard: unified PWA, role-aware navigation (publisher / subscriber / both)

## Post-MVP backlog (do not implement — do not delete this list)
- Command API ingestion (publisher pushes programmatically)
- Polling/scheduling service — cron-based, per datafeed, worker types: HTTP fetcher, DB reader
- Publisher-configurable cron expressions per datafeed
- Tier-gated ingestion modes (polling = paid tier)
- Publisher version management (CRUD on versions)
- Subscriber version pinning: `/{publisher_name}/{endpoint_name}@{version}`
- Publisher notified on new version creation
- Rate limiting per subscriber (429 responses)
- Feed diff notifications (webhook/email on new version)
- Full analytics dashboard
- Diagnostics tooling (feed health, error rates, latency)
- Field customization (rename, select, transform)
- Schema validation on ingestion (paid tier)
- Subscription management + tier UI
- Super admin dashboard
- CDN layer (Cloudflare in front of Query service)
- Migrate MinIO → Cloudflare R2
- Per-repo extraction (monorepo → microservices)
- K8s migration
- Multi-language support (Hebrew/RTL first)
- Background sync for uploads (PWA offline)
- Multiple credentials per subscription (team access)
- Version diff viewer
- ETag / conditional requests on feed delivery

## Coding conventions
- TypeScript strict mode everywhere
- Named exports only (no default exports except Next.js pages)
- Zod for all input validation (server actions, API routes, NATS payloads)
- Error handling: never swallow errors, always log with context
- Environment variables via `@t3-oss/env-nextjs` (web) and `@nestjs/config` (api)
- No `any` types
- Prefer `async/await` over `.then()` chains
