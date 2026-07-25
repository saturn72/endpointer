# Step 0 — Sub-step 4: Conversion Service (Go)

## Decisions for this slice

- New component: `src/conversion-service`, a standalone Go binary — first Go
  service in the repo, so this prompt also creates
  `.github/instructions/golang.instructions.md`.
- Event source: SeaweedFS filer's native **`SubscribeMetadata` gRPC stream**
  (no Kafka/SQS/webhook — this was already decided as the event mechanism
  back in the architecture discussion), filtered to the `raw-uploads` bucket
  path prefix.
- "Approved" = the same bar as the UI's own validation: the file parses
  cleanly as CSV with no row errors. There is no separate manual/automatic
  approval gate beyond that for this happy-path slice.
- Output: converted JSON goes to a second bucket, `converted-feeds`, at a key
  that mirrors the source path (same `{endpoint_name}/{upload_uuid}/`
  prefix) so the versioning service (next capability) can trace it back.
- This service must honor the **warning propagation contract** from
  `step_0_3`'s `.docs/decisions/` note: if the source raw file has a
  `warnings` user-metadata entry, copy it forward onto the converted object.
- This service does not touch MongoDB and does not delete anything from
  `raw-uploads` — it only reads raw files and writes converted ones. Cleanup
  of the bucket it writes to is the versioning service's job, next.
- No checkpoint/offset persistence yet (subscribe from service-start time
  going forward) — if the service restarts, it picks up only new uploads
  from that point on. This is a known gap, flagged as backlog, not solved
  here.

## The Prompt

```
Create a new Go service, src/conversion-service, that watches the
raw-uploads SeaweedFS bucket for new CSV files and converts each one to JSON
in a second bucket, converted-feeds. This is happy-path only: no retries, no
dead-letter handling, no formats besides CSV.

1. PROJECT LAYOUT
   - Idiomatic Go layout under src/conversion-service:
       cmd/conversion-service/main.go   (entrypoint, wiring only)
       internal/watcher/                (SubscribeMetadata client + event loop)
       internal/converter/              (CSV -> JSON conversion logic)
       internal/blobclient/             (thin S3 client setup — call
                                          @aws-sdk-equivalent directly, i.e.
                                          aws-sdk-go-v2's s3 package; no
                                          abstraction interface over it,
                                          consistent with how the UI talks to
                                          S3 directly)
       go.mod / go.sum
   - Config via env vars, loaded once at startup, no config framework needed
     at this size:
       SEAWEEDFS_FILER_GRPC_ADDR   (e.g. seaweedfs:18888)
       S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
       S3_RAW_BUCKET       (default: raw-uploads)
       S3_CONVERTED_BUCKET (default: converted-feeds)
     Add all of these to .deploy/.env.example.

2. STARTUP
   - On startup, ensure S3_CONVERTED_BUCKET exists (idempotent CreateBucket
     call against the SeaweedFS S3 gateway; tolerate "already exists"
     errors, fail loudly on anything else).
   - Connect to the SeaweedFS filer's gRPC endpoint and open a
     SubscribeMetadata stream filtered to the raw-uploads bucket's path
     prefix, starting from "now" (service start time) — do not attempt to
     replay historical uploads, and do not persist a resume offset for this
     slice (note this as a known gap in a code comment: a future durability
     pass needs to persist the last-processed timestamp/offset so a restart
     doesn't silently skip files uploaded during the downtime window).

3. ON EACH NEW-FILE EVENT
   - Filter out anything that isn't a newly created file under the
     raw-uploads prefix (ignore directory events, deletes, etc.).
   - Fetch the object from S3 (GetObject), including its user metadata.
   - Parse it as CSV (encoding/csv). "Approved" for this slice means: it
     parses without error and has at least one header column — the same bar
     the UI already enforces, checked again here defensively since this
     service could in principle receive files from other sources later.
     - If parsing fails, log the error clearly (include the source key) and
       skip the file — do not crash the service, do not write anything to
       converted-feeds. (No dead-letter bucket yet — that's backlog.)
   - Convert to a JSON array of objects (first row = keys, each subsequent
     row = one object) using Go's encoding/json.
   - Read the source object's `warnings` user-metadata key, if present
     (JSON-encoded string array per step_0_3's decision doc). If present,
     attach it unchanged as `warnings` user-metadata on the destination PUT.
   - PUT the resulting JSON to S3_CONVERTED_BUCKET at a key of
     {endpoint_name}/{upload_uuid}/data.json, where endpoint_name and
     upload_uuid are parsed from the source key's first two path segments
     (source format is {endpoint_name}/{upload_uuid}/{original_filename},
     established in step_0_1).

4. GRACEFUL SHUTDOWN
   - Handle SIGTERM/SIGINT: stop accepting new events, let any in-flight
     conversion finish, then exit cleanly. This matters for k8s rolling
     deploys later even though we're running via docker-compose now.

5. GITHUB COPILOT INSTRUCTIONS (do not skip — this is the first Go service)
   - Create .github/instructions/golang.instructions.md with
     `applyTo: "src/*-service/**"` covering:
       - Idiomatic Go project layout (cmd/, internal/), not a layout copied
         from another language's conventions.
       - No abstraction layer over the AWS S3 SDK — call it directly, same
         rule as the Next.js dashboard's S3 usage.
       - Structured logging via log/slog; wrap errors with fmt.Errorf("%w")
         for context, don't swallow errors silently.
       - Table-driven tests are the default test style; gofmt and go vet
         must be clean before considering a change done.
       - Same cross-cutting philosophy as the rest of the repo: don't add
         infrastructure (queues, caches, retries, dead-letter handling)
         ahead of an actual stated requirement — flag gaps as comments/
         backlog instead of solving them speculatively.
   - Update .github/copilot-instructions.md's build/run section to include
     how to build and run src/conversion-service (go build / go run, and
     how .deploy/docker-compose.yml wires its env vars) — verify these
     commands actually work as part of this task.

6. DEPLOY WIRING
   - Add a conversion-service entry to .deploy/docker-compose.yml (build
     from a Dockerfile in src/conversion-service, multi-stage: a Go builder
     stage producing a static binary, then a minimal final image such as
     distroless or scratch), wired to the same seaweedfs container as the
     dashboard, with the env vars from section 1.

NON-GOALS
- No formats other than CSV.
- No dead-letter queue, no retry logic beyond "log and skip on failure."
- No offset/checkpoint persistence (flagged as a known gap, not solved).
- No MongoDB access from this service — it only reads raw-uploads and writes
  converted-feeds.
- No deletion of anything from raw-uploads.

TESTS
- Unit tests for the CSV->JSON converter: valid CSV, CSV with only a header
  row (edge case — should still produce valid empty-array JSON, not error,
  since the UI's own validation already guarantees a non-empty header before
  upload), and malformed CSV (should return an error the caller can log and
  skip on).
- An integration test (can use a local docker-compose SeaweedFS instance):
  upload a raw CSV directly to raw-uploads, run the service briefly, and
  assert the corresponding JSON object appears in converted-feeds with the
  expected key and content, including a case where the source object carries
  `warnings` metadata and asserting it's copied onto the destination object.

DELIVER
- README section in src/conversion-service documenting the env vars and how
  to run it locally against docker-compose.
```

## Open note for next discussion

With this merged, **Capability 3: Versioning service** becomes `step_0_5` —
Go, subscribes to `converted-feeds` (same `SubscribeMetadata` mechanism),
computes the next `major.minor` for the endpoint, writes the version document
into MongoDB's `versions` collection (schema already fixed in `step_0_3`,
including carrying forward any `warnings` metadata), and then cleans the
object out of `converted-feeds`. It shares `src/conversion-service`'s Go
conventions, so no new instructions file is needed there — just a new
`src/versioning-service` directory. Let me know if you want to discuss that
now or review this one first.
