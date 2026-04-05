# 002 — API: NATS Subscriber

## Context
Implements the NATS subscription in `apps/api`. When `apps/web` publishes a `DatafeedVersionCreatedEvent`, this service receives it, writes the feed snapshot to MongoDB, and updates the version pointer so the Query service always serves the latest version.

## Depends on
- `.prompts/api/001-project-scaffold.md`

## Goal
A NATS subscriber that listens to `datafeed.version.created`, writes to MongoDB, and keeps the version pointer up to date.

## Tasks
1. Create `NatsModule` — manages NATS connection lifecycle
2. Create `FeedIngestionSubscriber` — handles `datafeed.version.created` events
3. Create `FeedSnapshotRepository` — MongoDB reads/writes for snapshots
4. Create `VersionPointerRepository` — MongoDB reads/writes for version pointers
5. Define Mongoose schemas for both collections
6. Wire everything into `AppModule`

## Event payload (from `@endpointer/types`)
```typescript
DatafeedVersionCreatedEvent.payload {
  publisherId: string
  datafeedId: string
  endpointId: string
  version: string        // semver e.g. "1.0.22"
  ingestedAt: string     // ISO timestamp
  sourceFormat: 'csv'|'xml'|'json'
  rowCount: number
  s3Key: string          // path to original file in MinIO
}
```

## MongoDB writes on event received

### 1. Insert feed snapshot
```typescript
// collection: feed_snapshots
{
  endpointId,
  version,
  ingestedAt,
  sourceFormat,
  rowCount,
  s3Key,
  content: []   // NOTE: content NOT stored in snapshot in this event
                // content is fetched from MinIO on demand (post-MVP optimization)
                // For MVP: fetch from MinIO and store inline
}
```

### 2. Upsert version pointer
```typescript
// collection: version_pointers
// upsert on endpointId
{
  endpointId,
  latestVersion: version,
  updatedAt: new Date()
}
```

## Error handling
- If MongoDB write fails: log error with full payload, do NOT acknowledge NATS message (triggers redelivery)
- If payload fails Zod validation: log error, acknowledge message (bad message — do not retry)
- All errors must include `endpointId` and `version` in log context

## Acceptance criteria
- [ ] Subscriber connects to NATS on app start
- [ ] Publishes a test event to `datafeed.version.created` → document appears in `feed_snapshots`
- [ ] Version pointer upserted correctly (second event updates, not inserts)
- [ ] Failed MongoDB write causes NATS message redelivery (not acknowledged)
- [ ] Invalid payload logged and acknowledged (not retried)
- [ ] Zod validates incoming event payload before processing
- [ ] Zero TypeScript errors

## Output files
- `apps/api/src/nats/nats.module.ts`
- `apps/api/src/nats/nats.service.ts`
- `apps/api/src/feed/feed-ingestion.subscriber.ts`
- `apps/api/src/feed/feed-snapshot.repository.ts`
- `apps/api/src/feed/feed-snapshot.schema.ts`
- `apps/api/src/feed/version-pointer.repository.ts`
- `apps/api/src/feed/version-pointer.schema.ts`
- `apps/api/src/feed/feed.module.ts`

## Notes
- Use NATS JetStream for durable subscriptions — not core NATS (ensures delivery on restart)
- Consumer name: `endpointer-api-feed-ingestion`
- Stream name: `DATAFEEDS`
- For MVP: fetch content from MinIO at ingestion time and store inline in MongoDB snapshot. This avoids a MinIO read on every subscriber request.
- Content fetch from MinIO: use `@aws-sdk/client-s3` with the S3-compatible endpoint
