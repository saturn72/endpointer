# 006 — Web: Publisher — Datafeed + Endpoint Management

## Context
Implements the publisher's core management flows: setting up their publisher profile (name/slug), creating datafeeds, and creating endpoints. This is the foundation before any content can be ingested.

## Depends on
- `.prompts/web/005-dashboard-layout.md`

## Goal
Publisher can complete their profile (set URL slug), create datafeeds, and create endpoints. All mutations via server actions. All pages server-rendered.

## Tasks
1. Publisher profile setup page — set `publisher.name` (URL slug) and `display_name`
2. Datafeeds list page — show all datafeeds with status
3. Create datafeed form + server action
4. Datafeed detail page — show endpoints, last ingestion, current version
5. Create endpoint form + server action
6. Slug validation utility — URL-safe, unique check

## Pages + routes
```
/dashboard/feeds                          — datafeed list
/dashboard/feeds/new                      — create datafeed form
/dashboard/feeds/[feedId]                 — datafeed detail
/dashboard/feeds/[feedId]/endpoints/new   — create endpoint form
/dashboard/profile                        — publisher profile setup
```

## Publisher profile setup
- Required before creating datafeeds
- Fields: `publisher_name` (slug — URL safe, lowercase, hyphens), `display_name`
- Slug rules: 3-32 chars, lowercase letters/numbers/hyphens only, no leading/trailing hyphens
- Unique check against DB before saving
- On save: UPDATE `publishers` set name, display_name WHERE clerk_user_id = current
- After save: redirect to `/dashboard/feeds`
- If publisher already has a name: show read-only with edit option

## Create datafeed
```
Fields:
  name*         text — datafeed identifier (slug within publisher namespace)
  description   text — optional, shown to subscribers
Submit → INSERT into datafeeds (publisher_id, name, description, current_version='1.0.0')
Redirect → /dashboard/feeds/{feedId}
```

## Create endpoint
```
Fields:
  name*         text — endpoint slug (e.g. "prices", "inventory")
Submit → INSERT into endpoints (datafeed_id, publisher_id, name)
Redirect → /dashboard/feeds/{feedId}
Resulting public URL shown: https://{domain}/{publisher_name}/{endpoint_name}
```

## Validation rules (Zod)
```typescript
publisherNameSchema: z.string().min(3).max(32).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
datafeedNameSchema: z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
endpointNameSchema: z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
```

## Datafeeds list page content
```
[+ New Datafeed] button

Table:
  Name | Endpoints | Current Version | Last Ingested | Rows
  ---- | --------- | --------------- | ------------- | ----
  prices | 2 | 1.0.22 | 2 hours ago | 1,204
  inventory | 1 | 1.0.5 | 1 day ago | 892

Empty state: "No datafeeds yet. Create your first datafeed to get started."
```

## Datafeed detail page content
```
Datafeed: {name}
Description: {description}
Current version: 1.0.22
Last ingested: {relative time} | {row count} rows

[Upload new version →] (links to upload prompt — next)

Endpoints:
  Name | Public URL | Subscribers | Created
  ---- | ---------- | ----------- | -------
  prices | endpointer.io/acme/prices | 3 approved | 3 days ago

[+ New Endpoint] button
```

## Acceptance criteria
- [ ] Publisher without a name is redirected to `/dashboard/profile` when accessing `/dashboard/feeds`
- [ ] Slug uniqueness enforced — duplicate name returns form error
- [ ] Invalid slug format returns inline form validation error
- [ ] Datafeed created → appears in list immediately (revalidatePath)
- [ ] Endpoint created → appears in datafeed detail immediately
- [ ] Public URL displayed correctly for each endpoint
- [ ] Server actions validate all inputs via Zod before DB write
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/profile/page.tsx`
- `apps/web/src/app/(dashboard)/profile/actions.ts`
- `apps/web/src/app/(dashboard)/feeds/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/new/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/actions.ts`
- `apps/web/src/app/(dashboard)/feeds/[feedId]/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/[feedId]/endpoints/new/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/[feedId]/endpoints/actions.ts`
- `apps/web/src/lib/validations/publisher.ts`

## Notes
- Guard all publisher routes with `requirePublisher()` from `src/lib/auth.ts`
- Use `revalidatePath()` after every mutation — no client-side state management
- Endpoint public URL: use `NEXT_PUBLIC_API_URL` env var as the domain base
- Add `NEXT_PUBLIC_API_URL` to `.env.example`
- Datafeed + endpoint names are immutable after creation in MVP (slug change = breaking URL change)
