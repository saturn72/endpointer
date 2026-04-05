# 007 — Web: Publisher — File Upload + Ingestion Pipeline

## Context
Implements the full ingestion pipeline triggered by a publisher uploading a new file. This is the most complex server-side flow: upload → S3 → parse → version bump → MongoDB snapshot → NATS event. All in a single server action.

## Depends on
- `.prompts/web/006-publisher-datafeed.md`

## Goal
Publisher can upload a CSV / XML / JSON file for a datafeed. The pipeline atomically bumps the version, stores the original file in MinIO, writes the snapshot to MongoDB (via NATS), and confirms the new version in the dashboard.

## Tasks
1. Upload page UI — drag-and-drop file input with format validation
2. `uploadFeedAction` server action — full ingestion pipeline
3. `FileParserService` — parses CSV / XML / JSON to `Record<string,string>[]`
4. `VersionService` — bumps semver patch
5. `S3UploadService` — streams file to MinIO, returns s3Key
6. NATS publish — emits `DatafeedVersionCreatedEvent`
7. PostgreSQL update — bumps `datafeeds.current_version`, `last_ingested_at`, `row_count`, `s3_key`
8. Upload result display — shows new version number + row count

## Upload page route
```
/dashboard/feeds/[feedId]/upload
```

## Upload UI
```
Datafeed: {name}  Current version: 1.0.21

[Drag & drop or click to upload]
Accepted formats: CSV, XML, JSON
Max file size: 10MB (free tier)

[Upload & Publish] button

On success:
  ✓ Version 1.0.22 published
  1,204 rows ingested
  [View datafeed →]
```

## uploadFeedAction pipeline (server action)
```typescript
// All steps must complete or roll back version bump

1. Validate file:
   - Accept: .csv, .xml, .json (by content-type + extension)
   - Max size: 10MB (free tier limit — TODO: post-MVP subscription gating)
   - Reject with clear error if invalid

2. Parse file content:
   - CSV: header row = field names, all values as strings
   - XML: configurable root element (default: detect first repeated child of root)
   - JSON: array of objects, or wrap single object in array
   - Reject with row count + error if parse fails
   - Return: { rows: Record<string,string>[], rowCount: number, format: 'csv'|'xml'|'json' }

3. Bump version:
   - Read current version from DB: datafeeds.current_version
   - Increment patch: semver.inc(current, 'patch')
   - New version: string (e.g. "1.0.22")

4. Upload original file to MinIO:
   - Key pattern: {publisherId}/{datafeedId}/{version}/{filename}
   - Upload as stream
   - Return: s3Key string

5. Update PostgreSQL:
   UPDATE datafeeds SET
     current_version = newVersion,
     last_ingested_at = now(),
     row_count = rowCount,
     s3_key = s3Key
   WHERE id = datafeedId

6. Publish NATS event:
   subject: 'datafeed.version.created'
   payload: DatafeedVersionCreatedEvent (from @endpointer/types)

7. Return: { version: newVersion, rowCount, ingestedAt }
```

## Error handling
```
Parse failure → return error, do NOT bump version, do NOT upload to S3
S3 upload failure → return error, do NOT bump version in DB
DB update failure → file already in S3 (orphaned), log s3Key, return error
NATS publish failure → DB already updated — log critical error, return success to user
  (Query service will eventually get the event on NATS reconnect via JetStream durability)
```

## File parser implementation notes

### CSV
- Use `papaparse` — handles edge cases (quoted commas, newlines in values)
- `header: true` — first row as field names
- `skipEmptyLines: true`

### XML
- Use `fast-xml-parser` — lightweight, no DOM dependency
- Auto-detect repeated root child as item element
- All values as strings (`parseAttributeValue: false`)

### JSON
- `JSON.parse` + validate it's an array or wrap object
- All values coerced to strings: `String(value)`

## Acceptance criteria
- [ ] Valid CSV upload → new version in DB, file in MinIO, NATS event emitted
- [ ] Valid XML upload → same
- [ ] Valid JSON upload → same
- [ ] Version increments correctly (1.0.21 → 1.0.22)
- [ ] s3Key follows the defined pattern
- [ ] Dashboard shows new version after upload (revalidatePath)
- [ ] File > 10MB → rejected with clear error before any processing
- [ ] Malformed CSV → rejected with row + error message, no version bump
- [ ] Malformed XML → same
- [ ] Invalid JSON → same
- [ ] NATS publish failure → error logged, user sees success (JetStream handles retry)
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/feeds/[feedId]/upload/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/[feedId]/upload/actions.ts`
- `apps/web/src/lib/ingestion/file-parser.ts`
- `apps/web/src/lib/ingestion/version.ts`
- `apps/web/src/lib/ingestion/s3-upload.ts`
- `apps/web/src/lib/ingestion/nats-publish.ts`

## Notes
- Server action receives `FormData` — extract file with `formData.get('file') as File`
- Convert `File` to `Buffer` for parsing: `Buffer.from(await file.arrayBuffer())`
- `semver` npm package for version bumping — do not implement manually
- NATS publish must use JetStream publish (not core NATS publish) for durability
- Add `papaparse`, `fast-xml-parser`, `semver` to `apps/web/package.json`
