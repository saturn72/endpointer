# 001 — Packages: Shared Types

## Context
Creates the `packages/types` workspace package containing all shared TypeScript types, DTOs, and NATS event contracts used across `apps/web` and `apps/api`. This must exist before either app is scaffolded.

## Depends on
- `.prompts/infra/001-docker-compose.md`

## Goal
A published (local workspace) TypeScript package at `packages/types` exporting all domain types, NATS event payloads, and API contracts shared across the monorepo.

## Tasks
1. Scaffold `packages/types` as a pnpm workspace package
2. Define all domain types
3. Define all NATS event contracts
4. Define all shared DTOs (request/response shapes)
5. Configure `tsconfig.json` and `package.json` for workspace consumption

## Type definitions to create

### Domain models (`src/domain/`)
```typescript
// publisher.ts
Publisher { id, name (slug), displayName, createdAt }

// datafeed.ts
Datafeed { id, publisherId, name, description, currentVersion, lastIngestedAt, rowCount, createdAt }

// endpoint.ts
Endpoint { id, datafeedId, publisherId, name (slug), createdAt }

// subscription.ts
Subscription { id, subscriberId, endpointId, status: 'pending'|'approved'|'rejected', createdAt, updatedAt }

// subscriber.ts
Subscriber { id, clerkUserId, email, createdAt }

// feed-version.ts
FeedVersion { version: string } // semver
FeedRow = Record<string, string>
FeedSnapshot { endpointId, version, ingestedAt, content: FeedRow[], sourceFormat: 'csv'|'xml'|'json' }
```

### NATS events (`src/events/`)
```typescript
// datafeed-version-created.event.ts
DatafeedVersionCreatedEvent {
  subject: 'datafeed.version.created'
  payload: {
    publisherId: string
    datafeedId: string
    endpointId: string
    version: string        // semver e.g. "1.0.22"
    ingestedAt: string     // ISO timestamp
    sourceFormat: 'csv'|'xml'|'json'
    rowCount: number
    s3Key: string          // path to original file in MinIO
  }
}
```

### DTOs (`src/dto/`)
```typescript
// ingestion
UploadFeedDto { file: File, datafeedId: string, endpointId: string }
IngestionResultDto { version: string, rowCount: number, ingestedAt: string }

// feed delivery
FeedRequestDto { publisherName: string, endpointName: string, format: 'csv'|'xml'|'json' }
FeedResponseDto { version: string, content: string, format: string, servedAt: string }

// subscription
CreateSubscriptionRequestDto { endpointId: string }
ApproveSubscriptionDto { subscriptionId: string }
RejectSubscriptionDto { subscriptionId: string }

// usage
UsageRecordDto { subscriberId, endpointId, version, format, requestedAt, responseStatus: number }
```

## Acceptance criteria
- [ ] `packages/types` builds with `tsc --noEmit` and zero errors
- [ ] All types exported from `packages/types/src/index.ts`
- [ ] Package importable from both `apps/web` and `apps/api` via workspace alias `@endpointer/types`
- [ ] No runtime dependencies — types only
- [ ] `DatafeedVersionCreatedEvent` subject string matches exactly `'datafeed.version.created'`
- [ ] `FeedSnapshot.content` typed as `Record<string, string>[]` — format-agnostic

## Output files
- `packages/types/package.json`
- `packages/types/tsconfig.json`
- `packages/types/src/index.ts`
- `packages/types/src/domain/publisher.ts`
- `packages/types/src/domain/datafeed.ts`
- `packages/types/src/domain/endpoint.ts`
- `packages/types/src/domain/subscription.ts`
- `packages/types/src/domain/subscriber.ts`
- `packages/types/src/domain/feed-version.ts`
- `packages/types/src/events/datafeed-version-created.event.ts`
- `packages/types/src/dto/ingestion.dto.ts`
- `packages/types/src/dto/feed.dto.ts`
- `packages/types/src/dto/subscription.dto.ts`
- `packages/types/src/dto/usage.dto.ts`

## Notes
- No Zod here — pure TypeScript types only. Zod schemas live in the app that consumes them.
- Keep types minimal — only what is actually shared. App-internal types stay in the app.
- Use `string` for all IDs in MVP — UUID format enforced at DB level, not type level.
