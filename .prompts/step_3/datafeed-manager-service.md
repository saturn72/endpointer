# Step 3 - Extract datafeed-manager-service

GitHub issue: `saturn72/endpointer#12`
Priority: P0

## Task

Extract datafeed and endpoint definition ownership from the dashboard into a
new Go service at `src/datafeed-manager-service`, while preserving the current
phase 1 behavior.

Follow the repository GitHub issue workflow in
`.github/copilot-instructions.md`. Work only on issue #12. Open a follow-up
issue for any upload-lifecycle work that belongs to #17 instead.

## Required behavior

- The service owns datafeed and endpoint definitions in MongoDB.
- Enforce owner scoping and unique names per owner.
- Support the phase 1 `static-file` adapter only.
- Provide datafeed CRUD and endpoint CRUD APIs needed by the dashboard.
- Provide the short-lived presigned upload URL API described in ADR 002,
  including ownership checks, server-generated object keys, file format and
  size limits, and no file-byte proxying through the service.
- Keep public reads in `datafeed-service`; do not add a runtime dependency from
  the public read path to the manager.
- Preserve the data model and migration contract in ADR 002.

## Out of scope

- Cron-download and database adapters.
- Multiple datafeeds per endpoint or endpoint transformations.
- Subscription enforcement, billing, queues and speculative infrastructure.
- The upload tracking collection and orphan sweeper, which belong to issue #17
  unless a small interface contract is required here.

## Implementation order

1. Read ADR 002, the current dashboard actions and the existing S3/Mongo
   clients. Identify the smallest API contract before editing.
2. Create the Go service skeleton, configuration, health endpoint, Dockerfile
   and docker-compose entry.
3. Implement Mongo-backed owner-scoped datafeed and endpoint handlers.
4. Implement presigned upload URL issuance with server-owned keys and bounded
   policies.
5. Migrate dashboard actions to call the service instead of writing MongoDB or
   signing uploads directly.
6. Add focused Go unit tests, integration tests where infrastructure is
   available, and dashboard tests for the changed calls.
7. Update service README, project instructions, compose configuration and
   issue #12 with test results and remaining risks.

## Acceptance criteria

- `go test ./...` and `go vet ./...` pass in the new service.
- Dashboard datafeed and endpoint create/list/detail flows work through the
  manager service.
- A user cannot read or mutate another user's datafeed or endpoint.
- Presigned URLs expire quickly, are scoped to one server-generated object key,
  and enforce configured size/type limits.
- Existing migration tests and public URL integration tests still pass.
- No credentials, tokens or local MCP configuration are committed.
- Issue #12 checklist is updated before the implementation is considered
  complete.