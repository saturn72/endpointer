# 003 — Web: Project Scaffold

## Context
Scaffolds `apps/web` — the unified Next.js PWA dashboard for both publishers and subscribers. This is the Command side: all profile management, ingestion, approvals, and subscription flows live here as server actions and API routes.

## Depends on
- `.prompts/infra/001-docker-compose.md`
- `.prompts/web/001-types-scaffold.md`
- `.prompts/web/002-db-schema.md`

## Goal
A working Next.js 15 app configured as a PWA, with Tailwind CSS, Clerk auth scaffolded, Drizzle connected to `postgres-web`, and NATS client ready to publish events.

## Tasks
1. Scaffold Next.js 15 app (App Router, TypeScript, Tailwind)
2. Configure pnpm workspace (`package.json` name: `@endpointer/web`)
3. Install and configure:
   - `@clerk/nextjs` — auth provider
   - `@endpointer/db` — Drizzle schema
   - `@endpointer/types` — shared types
   - `nats` — NATS publisher
   - `@aws-sdk/client-s3` — MinIO file upload
   - `@t3-oss/env-nextjs` — type-safe env vars
   - `zod` — input validation
   - `next-pwa` — PWA config
4. Configure `next.config.ts` with PWA settings
5. Create `src/env.ts` — typed environment variables via `@t3-oss/env-nextjs`
6. Create `src/lib/db.ts` — Drizzle client singleton
7. Create `src/lib/nats.ts` — NATS publisher singleton
8. Create `src/lib/s3.ts` — S3 client singleton (MinIO)
9. Create root layout with `<ClerkProvider>`
10. Create `public/manifest.json` for PWA
11. Create `.env.example`

## Environment variables
```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# PostgreSQL (Command)
DATABASE_URL=postgresql://user:pass@localhost:5432/endpointer_web

# NATS
NATS_URL=nats://localhost:4222

# S3-compatible (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=endpointer-feeds
S3_REGION=us-east-1
```

## App router structure to scaffold
```
src/
├── app/
│   ├── layout.tsx              # Root layout, ClerkProvider
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   ├── sign-up/[[...sign-up]]/page.tsx
│   │   └── onboarding/page.tsx  # Role selection after sign-up
│   ├── (dashboard)/
│   │   ├── layout.tsx           # Sidebar + role-aware nav (placeholder)
│   │   └── home/page.tsx        # Activity overview (placeholder)
│   └── api/
│       └── health/route.ts      # GET /api/health → { status: 'ok' }
├── lib/
│   ├── db.ts                    # Drizzle client
│   ├── nats.ts                  # NATS publisher
│   └── s3.ts                    # S3/MinIO client
└── env.ts                       # @t3-oss/env-nextjs config
```

## PWA manifest
```json
{
  "name": "Endpointer",
  "short_name": "Endpointer",
  "description": "Datafeed governance platform",
  "start_url": "/dashboard/home",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [...]
}
```

## Acceptance criteria
- [ ] `pnpm dev` starts on port 3000 with no errors
- [ ] `GET /api/health` returns `{ status: 'ok' }`
- [ ] Clerk `<ClerkProvider>` wraps root layout
- [ ] `/sign-in` and `/sign-up` render Clerk components
- [ ] Drizzle connects to `postgres-web` on startup (test with a simple query)
- [ ] NATS client connects on startup (log confirms)
- [ ] S3 client initializes with MinIO endpoint
- [ ] `src/env.ts` validates all required env vars at startup — app refuses to start if any are missing
- [ ] PWA manifest served at `/manifest.json`
- [ ] TypeScript strict mode, zero errors on `tsc --noEmit`
- [ ] `.env.example` documents all variables

## Output files
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/next.config.ts`
- `apps/web/.env.example`
- `apps/web/src/env.ts`
- `apps/web/src/lib/db.ts`
- `apps/web/src/lib/nats.ts`
- `apps/web/src/lib/s3.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/src/app/(auth)/onboarding/page.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/home/page.tsx`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/public/manifest.json`

## Notes
- Port 3000 for web, port 3001 reserved for `apps/api`
- NATS publisher in Next.js: use a module-level singleton with lazy connect — server actions are not long-lived processes
- Drizzle client: use a module-level singleton pattern (`globalThis.__db`) to avoid multiple connections in dev hot-reload
- RTL support: add `dir` attribute to `<html>` — set to `ltr` for now, `rtl` post-MVP
- Do not implement dashboard UI in this prompt — layout.tsx and home/page.tsx are placeholders only
