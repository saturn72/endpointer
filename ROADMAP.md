# Endpointer — MVP Roadmap

## How to use
```bash
./run.sh
```
Finds the first unchecked task, executes the prompt file, marks it done, commits and pushes.
One task at a time. Never skip — each prompt depends on the previous ones.

---

## Phase 1 — Infrastructure
- [x] `.prompts/infra/001-docker-compose.md` — PostgreSQL ×2, MongoDB, NATS, MinIO

---

## Phase 2 — API app (NestJS — Query side)
- [x] `.prompts/api/001-project-scaffold.md` — NestJS scaffold via CLI, MongoDB + NATS connections, health endpoint
- [x] `.prompts/api/002-nats-subscriber.md` — subscribe to `datafeed.version.created`, write snapshots to MongoDB
- [ ] `.prompts/api/003-feed-delivery.md` — `GET /{publisher}/{endpoint}?format=`, Clerk auth, serve from MongoDB
- [ ] `.prompts/api/004-usage-tracking.md` — write usage records to `postgres-api` on every successful request

---

## Phase 3 — Web app (Next.js — Command side)
- [ ] `.prompts/web/001-project-scaffold.md` — Next.js scaffold via CLI, PWA config, Clerk, Drizzle, NATS publisher, MinIO
- [ ] `.prompts/web/002-db-schema.md` — Drizzle schema inside `apps/web/src/db/`, generate + migrate via CLI
- [ ] `.prompts/web/003-clerk-auth.md` — sign in, sign up, role selection onboarding, route protection
- [ ] `.prompts/web/004-dashboard-layout.md` — sidebar, role-aware nav, home overview page
- [ ] `.prompts/web/005-publisher-datafeed.md` — publisher profile, create datafeeds, create endpoints
- [ ] `.prompts/web/006-publisher-upload.md` — file upload → parse → version bump → MinIO → NATS publish
- [ ] `.prompts/web/007-publisher-approvals.md` — approve/reject subscriber requests, publisher usage view
- [ ] `.prompts/web/008-subscriber-discover.md` — browse endpoints, request subscriptions, subscription status
- [ ] `.prompts/web/009-subscriber-credentials.md` — generate/rotate client credentials, subscriber usage view

---

## MVP complete ✓
All tasks checked = MVP is done. See `CLAUDE.md` post-MVP backlog for next phase.
