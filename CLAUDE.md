# Endpointer — CLAUDE.md

## Project
**Repo:** https://github.com/saturn72/endpointer
**Purpose:** Multi-tenant SaaS datafeed governance platform. Publishers expose managed datafeeds to approved subscribers via authenticated, versioned endpoints.

## Monorepo structure
```
endpointer/
├── apps/
│   ├── web/          # Next.js PWA — unified dashboard (publisher + subscriber UI)
│   └── api/          # NestJS — feed delivery (Query service only)
├── packages/
│   ├── types/        # Shared TypeScript types, DTOs, NATS event contracts
│   └── db/           # Drizzle schema + migrations (used by apps/web only)
├── .prompts/         # Agentic prompt files (sequential, per app)
│   ├── web/
│   ├── api/
│   └── infra/
├── CLAUDE.md         # This file — global context
└── AGENTS.md         # Agent rules and conventions
```

## Tech stack
| Concern | Technology |
|---------|-----------|
| Dashboard UI | Next.js 15 (App Router), TypeScript, Tailwind CSS, PWA |
| Feed delivery API | NestJS, TypeScript |
| Auth | Clerk (email+password + SSO + OAuth2 client credentials) |
| Command DB | PostgreSQL (per app, via Drizzle ORM) |
| Query DB | MongoDB (per app) |
| Message bus | NATS (`DatafeedVersionCreated` event) |
| File storage | S3-compatible (MinIO for MVP) |
| Package manager | pnpm (workspaces) |
| Runtime | Node.js 20+ |

## Domain terminology (always use these terms)
- **Publisher** — registers and manages datafeed profiles and endpoints
- **Subscriber** — registers and consumes approved endpoints
- **Datafeed** — the content unit (1 upstream source)
- **Endpoint** — a named delivery URL on a datafeed (1 datafeed : many endpoints)
- **Ingestion** — the pipeline from file upload to new version being available
- **Version** — semver, auto-incremented patch on every ingestion (always serves latest in MVP)

## URL pattern
```
GET /{publisher_name}/{endpoint_name}?format=csv|xml|json
```
Always serves latest version. No version pinning in MVP.

## CQRS pattern
- **Command side** — Next.js server actions + API routes (mutations, ingestion, approvals)
- **Query side** — NestJS (feed delivery only, reads MongoDB)
- Decoupled via NATS: Command publishes `DatafeedVersionCreated`, Query subscribes

## Key rules for the agent
1. Never couple `apps/web` and `apps/api` directly — all cross-app communication goes via NATS
2. Each app owns its own database — no shared DB connections across apps
3. Shared types live in `packages/types` only — never duplicate type definitions
4. Drizzle schema lives in `packages/db` — imported by `apps/web` only
5. All file uploads go to S3-compatible storage (MinIO) — never store files on disk
6. Clerk handles all auth — never implement custom auth logic
7. Version is always auto-incremented on ingestion — never manually set in MVP
8. Query service always serves latest version — no version pinning logic in MVP
9. Usage count written by Query service to its own PostgreSQL instance on every successful feed request
10. Free tier MVP only — no subscription gating logic yet

## MVP scope (what to build)
- [ ] Publisher: register, create datafeed, create endpoint, upload file, approve subscribers
- [ ] Subscriber: register, discover endpoints, request subscription, generate credentials, pull feed
- [ ] Ingestion: parse CSV/XML/JSON, bump patch version, write to MongoDB, store original in MinIO, emit NATS event
- [ ] Query: authenticate token, resolve endpoint, serve latest from MongoDB, record usage
- [ ] Dashboard: unified PWA, role-aware navigation (publisher / subscriber / both)

## Post-MVP backlog (do not implement, do not delete this list)
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
- Subscription management + tier UI
- Super admin dashboard
- CDN layer (Cloudflare CDN in front of Query service)
- Migrate MinIO → Cloudflare R2
- Schema validation on ingestion (paid tier)
- Per-repo extraction (monorepo → microservices)
- K8s migration
- Multi-language support (Hebrew/RTL first)
- Background sync for uploads (PWA offline)
- Multiple credentials per endpoint (team access)
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
