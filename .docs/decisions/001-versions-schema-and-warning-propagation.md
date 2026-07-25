# 001 — Versions Schema & Warning Propagation Contract

**Status:** Active  
**Date:** 2026-07-18

## Context

The ingest UI uploads raw CSV files to the `raw-uploads` S3 bucket. Future
services (conversion-service, versioning-service) will process those files and
write structured version documents to MongoDB. This ADR fixes the schema those
services must write to, and the metadata contract for propagating upload-time
warnings through the pipeline.

---

## `versions` MongoDB Collection Schema

```ts
{
  _id: ObjectId,
  endpoint_name: string,   // FK → endpoints.name
  major: number,
  minor: number,
  content: object,         // full converted JSON payload
  warnings: string[],      // [] when no warnings, see contract below
  source_upload_key: string, // the raw-uploads S3 key this came from
  created_at: Date
}
```

**Indexes:**
- Unique on `(endpoint_name, major, minor)` — enforced in `scripts/init-db.ts`
- Compound on `(endpoint_name, major DESC, minor DESC)` — for latest-version queries

---

## Warning Propagation Contract

When the ingest UI detects a warning (currently: declared `id_field` not found
in the CSV header row) and the user acknowledges it, the raw file is uploaded
to S3 with the following **object user-metadata**:

| Metadata key | Value format              | Example                                          |
|---|---|---|
| `warnings`   | JSON-encoded string array | `["id_field 'sku' not found in header row: id, name, price"]` |

### Rules for downstream services

1. **conversion-service**: when processing a raw file from S3, read the
   `warnings` metadata key from the object's user-metadata. If present and
   non-empty, forward the array as-is into the `versions` document's
   `warnings` field.
2. **versioning-service**: when creating a version document, include the
   `warnings` array verbatim. Never discard or overwrite it.
3. If the metadata key is absent or decodes to an empty array, write
   `warnings: []` to the version document.

### Why S3 user-metadata?

The ingest UI's responsibility ends once the file is in the bucket. There is
no shared database between the UI and the conversion service at this stage.
S3 object metadata is the only side-channel available. This is intentional —
it keeps the services decoupled.

---

## Non-Goals

- This ADR does not define how warnings are _surfaced_ in the datafeed API
  (that belongs to the datafeed-service prompt).
- It does not define versioning numbering logic (how major/minor are assigned
  — that belongs to the versioning-service prompt).
