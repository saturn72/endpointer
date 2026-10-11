# Step 2 — Datafeeds management

Domain model: see `.docs/decisions/002-datafeed-endpoint-domain-model.md`.

## Goal

Add a **Datafeeds** menu item in the dashboard where a user creates and manages
datafeeds, and connects endpoints to them.

## Scope (phase 1)

- Datafeed CRUD in the dashboard (list, create, detail, edit, delete).
- Only the `static-file` adapter. The adapter picker is shown but extra adapters
  are listed as "coming soon".
- Upload a file to a datafeed -> new datafeed version. The browser uploads
  directly to S3 via a short-lived presigned URL issued by the manager service
  (ADR 002 "Upload security"), then the existing convert/version pipeline runs.
- Public URLs follow `<domain>/<user_name>/<endpoint_name>[/version/<major>.<minor>]`;
  the legacy `/{endpoint_name}` route is retired.
- The datafeed creation form can create an endpoint in the same step
  (default on); see the flow diagram in ADR 002.
- Endpoint creation selects exactly one datafeed and a version policy
  (latest / pinned).
- Migrate existing endpoints to auto-created datafeeds (ADR 002).
- New Go service `src/datafeed-manager-service` owning definitions; dashboard
  calls it.
- Inline help text/tooltips in the datafeed creation UI explaining: what a
  datafeed is, what an adapter is, supported file formats, the ID field, and
  what an endpoint is. No separate help page.

## Out of scope

- Cron and database adapters, source credentials/secrets.
- Multiple datafeeds per endpoint, endpoint transformations (subset, rename, join).
- Authentication changes, caching, queues.

## Suggested order

1. Finalize ADR 002 open questions with the user.
2. Schema + `scripts/init-db.ts` indexes + idempotent migration script.
3. `datafeed-manager-service` skeleton (build, Dockerfile, docker-compose entry).
4. Re-key `versioning-service` and `datafeed-service` to datafeed.
5. Dashboard: sidebar item, Datafeeds pages, endpoint form changes.
6. Tests (Go unit, Playwright integration) and docs update.

## Design

No Stitch screens exist yet for Datafeeds. Create/extend them in project
`14388681312300072135` before building UI, or confirm the user accepts
design-by-convention from existing screens.
