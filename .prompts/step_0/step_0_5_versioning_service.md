# Step 0 — Sub-step 5: Versioning Service (Go)

## Decisions for this slice

- New component: `src/versioning-service`. Second Go service in the repo —
  it follows the same `.github/instructions/golang.instructions.md` created
  in `step_0_4`, no new instructions file needed.
- Event source: same mechanism as conversion-service — SeaweedFS filer's
  `SubscribeMetadata` gRPC stream, this time filtered to the
  `converted-feeds` bucket path prefix.
- Versioning scheme (already locked back in the architecture discussion):
  `major.minor`, always auto-bump minor within the current max major for
  that endpoint. No major-bump support yet — the UI doesn't offer requesting
  one, so this service never needs to branch on that; first version for a
  never-seen endpoint is `1.0`.
- Writes to MongoDB's `versions` collection, exact schema fixed in
  `step_0_3` (embed full content, `warnings` array, unique index on
  `(endpoint_name, major, minor)`). This service owns that collection —
  it's the only writer, so it's responsible for ensuring the unique index
  exists at startup.
- Must carry forward the `warnings` user-metadata from the source
  `converted-feeds` object (if present) into the version document's
  `warnings` field — completing the propagation contract from `step_0_3`.
- After a successful write, deletes the object from `converted-feeds` (the
  "clean the bucket" step from the roadmap) — `raw-uploads` is untouched,
  it's the permanent raw archive.
- Milestone: once this is merged, the full happy-path pipeline runs
  end-to-end for the first time — upload → raw-uploads → conversion-service
  → converted-feeds → versioning-service → MongoDB — and the "latest
  version" badge already built into the UI in `step_0_3` will start showing
  real data with no further UI changes needed.

## The Prompt

```
Create a new Go service, src/versioning-service, that watches the
converted-feeds SeaweedFS bucket for new JSON files, assigns each one the
next major.minor version for its endpoint, stores the version (with full
content embedded) in MongoDB, and removes the object from converted-feeds
once stored. Happy path only.

1. PROJECT LAYOUT
   - Same idiomatic Go layout convention as conversion-service:
       cmd/versioning-service/main.go
       internal/watcher/       (SubscribeMetadata client + event loop —
                                 structurally similar to conversion-service's,
                                 but don't share code across the two services
                                 by way of a premature shared internal
                                 package; a small amount of duplication
                                 between two independent services is fine at
                                 this size)
       internal/versioning/    (next-version computation logic)
       internal/mongoclient/   (thin Mongo client setup, native mongo-driver,
                                no ORM — same rule as the dashboard's Mongo
                                usage)
       go.mod / go.sum
   - Config via env vars:
       SEAWEEDFS_FILER_GRPC_ADDR
       S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
       S3_CONVERTED_BUCKET (default: converted-feeds)
       MONGODB_URI, MONGODB_DB
     Add these to .deploy/.env.example (reuse the same var names already
     established for MongoDB in the dashboard, and for S3/SeaweedFS in
     conversion-service, rather than inventing new ones).

2. STARTUP
   - Connect to MongoDB. Ensure the unique index on
     versions(endpoint_name, major, minor) exists (create it if missing —
     this service owns that collection, so it's responsible for this,
     documented in its own README rather than a separate migration tool).
   - Connect to the SeaweedFS filer's gRPC endpoint, open a
     SubscribeMetadata stream filtered to the converted-feeds prefix,
     starting from service-start time — same known gap as
     conversion-service: no offset persistence yet, flagged as backlog, not
     solved here.

3. ON EACH NEW-FILE EVENT
   - Parse endpoint_name and upload_uuid from the converted-feeds key
     ({endpoint_name}/{upload_uuid}/data.json, per conversion-service's
     output format).
   - Fetch the object from S3 (GetObject), including its user metadata.
   - Parse the body as JSON (should already be well-formed, since
     conversion-service produced it — if it somehow isn't, log the error
     with the key and skip; don't crash the service).
   - Read the `warnings` user-metadata key if present (JSON-encoded string
     array); default to an empty array if absent.
   - Compute the next version for this endpoint_name:
       - Query MongoDB's versions collection for the max (major, minor) for
         this endpoint_name.
       - If none exist: major = 1, minor = 0.
       - Otherwise: major = current max major, minor = current max minor + 1.
   - Insert the version document:
       {
         endpoint_name, major, minor,
         content: <parsed JSON>,
         warnings: <from metadata, or []>,
         source_upload_key: <the converted-feeds key just processed>,
         created_at: time.Now()
       }
     If the insert fails due to the unique index (a duplicate
     major.minor — e.g. from a duplicate event), log it clearly and skip;
     don't crash, don't retry in a loop (no dedup/retry logic beyond this
     for the happy-path slice — flag as backlog).
   - On successful insert, delete the object from converted-feeds. If the
     insert succeeded but the delete fails, log the error clearly (the
     object will just sit there; a cleanup pass for orphaned
     converted-feeds objects is backlog, not solved here).

4. GRACEFUL SHUTDOWN
   - Same as conversion-service: handle SIGTERM/SIGINT, finish any in-flight
     event, then exit.

5. UPDATE COPILOT INSTRUCTIONS
   - Update .github/copilot-instructions.md's build/run section to include
     src/versioning-service (go build / go run, env vars, how
     .deploy/docker-compose.yml wires it) — verify these commands actually
     work as part of this task.
   - No changes needed to .github/instructions/golang.instructions.md — this
     service follows the same conventions as conversion-service.

6. DEPLOY WIRING
   - Add a versioning-service entry to .deploy/docker-compose.yml (same
     multi-stage Go Dockerfile pattern as conversion-service), wired to the
     same seaweedfs and mongodb containers, with the env vars from section 1.

NON-GOALS
- No major-version-bump support (the UI doesn't request one yet).
- No dedup/retry logic beyond logging and skipping on a unique-index
  conflict.
- No cleanup pass for orphaned converted-feeds objects if a delete fails.
- No offset/checkpoint persistence (same known gap as conversion-service).
- No changes to the endpoints collection or the dashboard.

TESTS
- Unit tests for the next-version computation: no existing versions for an
  endpoint -> 1.0; existing versions 1.0, 1.1, 1.2 -> next is 1.3; versions
  belonging to a different endpoint_name must not affect the computation.
- Integration test (against local docker-compose Mongo + SeaweedFS): PUT a
  converted JSON object into converted-feeds (one variant with `warnings`
  metadata, one without), run the service briefly, and assert: the version
  document lands in MongoDB with the expected major.minor/content/warnings,
  and the object is removed from converted-feeds afterward.
- End-to-end smoke test spanning step_0_1 through step_0_5: upload a CSV via
  the dashboard, and — polling with a short timeout — confirm a version
  document eventually appears in MongoDB and the dashboard's "latest version"
  badge reflects it. This is the first point where that badge shows real
  data instead of "No versions yet."

DELIVER
- README section in src/versioning-service documenting env vars, the index
  it creates on startup, and how to run it locally against docker-compose.
```

## Open note for next discussion

With this merged, the full ingest→convert→version pipeline runs end-to-end.
**Capability 4: Datafeed service** becomes `step_0_6` — the last piece of the
Step 0 roadmap: `GET /{endpoint}` (paginated get-all) and `GET
/{endpoint}/{id}` (get-by-id, only functional when `id_field` is configured),
reading directly from the `versions` collection this service just started
populating. Let me know if you want to discuss that now or review this one
first.
