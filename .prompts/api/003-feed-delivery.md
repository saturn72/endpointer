# 003 — API: Feed Delivery Endpoint

## Context
Implements the core Query service endpoint — the single route that subscribers call to pull datafeed content. This is the primary value delivery of the entire platform.

## Depends on
- `.prompts/api/002-nats-subscriber.md`

## Goal
A working `GET /{publisher_name}/{endpoint_name}?format=csv|xml|json` route that authenticates the subscriber via Clerk bearer token, verifies subscription approval, fetches the latest snapshot from MongoDB, serializes to the requested format, and returns the content.

## Tasks
1. Create `FeedController` with the delivery route
2. Create `FeedService` — orchestrates auth, lookup, serialization
3. Create `ClerkAuthGuard` — validates bearer token via Clerk
4. Create `SubscriptionGuard` — verifies subscriber is approved for this endpoint
5. Create `EndpointResolverService` — resolves `publisher_name + endpoint_name` → `endpointId` (reads PostgreSQL)
6. Create `FeedSerializerService` — converts `Record<string,string>[]` to CSV / XML / JSON string
7. Wire everything into `FeedModule`

## Route definition
```
GET /{publisher_name}/{endpoint_name}
Query params:
  format: 'csv' | 'xml' | 'json'  (default: 'json')
Headers:
  Authorization: Bearer <clerk_access_token>
```

## Request flow
```
1. ClerkAuthGuard — verify bearer token → extract subscriberId (Clerk user ID)
2. EndpointResolverService — resolve publisher_name + endpoint_name → endpointId
   - Query PostgreSQL (postgres-api) for endpoint lookup
   - Return 404 if publisher or endpoint not found
3. SubscriptionGuard — verify subscription status = 'approved'
   - Query PostgreSQL (postgres-api) for subscription record
   - Return 403 if not subscribed or status != 'approved'
4. FeedSnapshotRepository — fetch latest snapshot from MongoDB
   - Look up version_pointers for endpointId → latestVersion
   - Fetch feed_snapshots document for endpointId + latestVersion
   - Return 404 if no snapshot exists yet
5. FeedSerializerService — serialize content to requested format
6. Return response with correct Content-Type header
7. Emit usage record event (handled by UsageModule — next prompt)
```

## Serialization formats

### JSON (default)
```
Content-Type: application/json
Body: { version, servedAt, rowCount, data: Record<string,string>[] }
```

### CSV
```
Content-Type: text/csv
Body: header row + data rows, comma-separated, CRLF line endings
```

### XML
```
Content-Type: application/xml
Body:
<feed version="1.0.22" servedAt="...">
  <items>
    <item>
      <{field}>{value}</{field}>
      ...
    </item>
  </items>
</feed>
```

## Error responses
```
401 — missing or invalid bearer token
403 — subscriber not approved for this endpoint
404 — publisher/endpoint not found, or no snapshot available yet
400 — invalid format param
500 — internal error (log full context, return generic message)
```

## PostgreSQL reads (postgres-api)
The API app needs a read-only view of publishers, endpoints, and subscriptions. These are written by `apps/web` to `postgres-web`. For MVP: replicate the minimum needed tables in `postgres-api` — populated by the NATS subscriber when a new version is created.

Actually simpler for MVP: `apps/api` reads directly from `postgres-web` using a read-only connection. Add `DATABASE_URL_WEB` env var pointing to `postgres-web`.

> NOTE: This is a pragmatic MVP shortcut. Post-MVP: proper read model in `postgres-api` populated via events.

## Acceptance criteria
- [ ] `GET /{publisher}/{endpoint}?format=json` with valid token + approved subscription returns JSON feed
- [ ] `GET /{publisher}/{endpoint}?format=csv` returns valid CSV with header row
- [ ] `GET /{publisher}/{endpoint}?format=xml` returns valid XML
- [ ] Missing/invalid token → 401
- [ ] Valid token but not subscribed → 403
- [ ] Unknown publisher or endpoint → 404
- [ ] No snapshot available yet → 404 with clear message
- [ ] Invalid format param → 400
- [ ] Response includes correct `Content-Type` header per format
- [ ] Zero TypeScript errors

## Output files
- `apps/api/src/feed/feed.controller.ts`
- `apps/api/src/feed/feed.service.ts`
- `apps/api/src/feed/feed-serializer.service.ts`
- `apps/api/src/feed/endpoint-resolver.service.ts`
- `apps/api/src/auth/clerk-auth.guard.ts`
- `apps/api/src/auth/subscription.guard.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/.env.example` (updated with `DATABASE_URL_WEB`)

## Notes
- CSV serialization: use `papaparse` or manual string building — no heavy libraries
- XML serialization: manual string building is fine for MVP — field names become XML tags, sanitize special chars
- Clerk token verification: use `@clerk/backend` `verifyToken()` — do not implement JWT verification manually
- `EndpointResolverService` should cache resolved endpoint IDs in memory (simple Map) — avoid a DB hit on every request for the same endpoint
- Post-MVP: move `postgres-web` read to a proper read model in `postgres-api`
