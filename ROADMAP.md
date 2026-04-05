# Endpointer — MVP Roadmap

## How to use
Run the next unchecked item:
```bash
claude "read ROADMAP.md, find the first unchecked task, execute the prompt file it references, then mark it as done"
```
Each task = one prompt file = one git commit.
Never skip a task — each prompt depends on the previous ones completing successfully.

---

## Phase 1 — Infrastructure

- [x] `.prompts/infra/001-docker-compose.md` — PostgreSQL ×2, MongoDB, NATS, MinIO

---

## Phase 2 — Shared packages

- [x] `.prompts/web/001-types-scaffold.md` — shared TypeScript types, NATS event contracts (`@endpointer/types`)
- [x] `.prompts/web/002-db-schema.md` — Drizzle schema + migrations for `postgres-web` (`@endpointer/db`)

---

## Phase 3 — API app (NestJS — feed delivery)

- [x] `.prompts/api/001-project-scaffold.md` — NestJS app scaffold, MongoDB + NATS connections, health endpoint
- [ ] `.prompts/api/002-nats-subscriber.md` — subscribe to `datafeed.version.created`, write snapshots to MongoDB
- [ ] `.prompts/api/003-feed-delivery.md` — `GET /{publisher}/{endpoint}?format=`, Clerk auth, serve from MongoDB
- [ ] `.prompts/api/004-usage-tracking.md` — write usage records to `postgres-api` on every successful request

---

## Phase 4 — Web app (Next.js — unified dashboard)

- [ ] `.prompts/web/003-project-scaffold.md` — Next.js 15 PWA scaffold, Clerk, Drizzle, NATS publisher, MinIO client
- [ ] `.prompts/web/004-clerk-auth.md` — sign in, sign up, role selection onboarding, route protection
- [ ] `.prompts/web/005-dashboard-layout.md` — sidebar, role-aware nav, home overview page
- [ ] `.prompts/web/006-publisher-datafeed.md` — publisher profile, create datafeeds, create endpoints
- [ ] `.prompts/web/007-publisher-upload.md` — file upload → parse → version bump → MinIO → NATS publish
- [ ] `.prompts/web/008-publisher-approvals.md` — approve/reject subscriber requests, publisher usage view
- [ ] `.prompts/web/009-subscriber-discover.md` — browse endpoints, request subscriptions, subscription status
- [ ] `.prompts/web/010-subscriber-credentials.md` — generate/rotate client credentials, subscriber usage view

---

## MVP complete ✓
All tasks checked = MVP is done. See `CLAUDE.md` post-MVP backlog for next phase.
