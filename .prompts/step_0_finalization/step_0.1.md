Harden the existing Next.js CSV ingest app (from Step 0) against unhappy
paths. Do not add new pages, new file formats, or new features. Every
change below is either: (a) a new validation rule, (b) handling for a
failure mode that previously fell through to a generic 500 / unhandled
exception, or (c) an error-message UX fix. If you find yourself adding a
new page, a new collection field, or a new format — stop, that's out of
scope for this slice.

ERROR UX PATTERN (applies to both pages)
- Introduce a shared, small helper/component for rendering the two error
  classes distinctly:
  - Validation error → Pico `<mark>` inline banner with the specific,
    actionable message (e.g. "Endpoint name already exists").
  - Infra error → a visually distinct banner (e.g. wrapped in a `<div
    role="alert">` styled via Pico's `<ins>`/negative color conventions,
    or a dedicated CSS class) with a generic message. Never surface raw
    error.message/stack from Mongo or S3 to the client. Log the real
    error server-side (console.error is fine at this size — no logging
    infra needed).
- Both Server Actions (`createEndpoint`, `uploadVersion`) should catch
  errors from Mongo/S3 calls specifically (try/catch around those calls,
  not the whole action) and route them to the infra-error path, distinct
  from the deliberate validation-check returns.

`/` — createEndpoint hardening
1. Race condition: two simultaneous submissions with the same name.
   - Rely on the Mongo unique index (already created in Step 0) but
     confirm the driver's duplicate-key error (code 11000) is caught
     specifically and mapped to the validation error "Endpoint name
     already exists" — not a generic infra error.
2. Name validation edge cases to add:
   - Reject names that are only whitespace (currently "non-empty" may
     pass a string of spaces through — trim before checking).
   - Reject names exceeding a defined max length (add a named constant,
     e.g. MAX_ENDPOINT_NAME_LENGTH = 100).
   - Confirm the existing safe-path-segment regex also rejects leading/
     trailing dashes/underscores if that's not already handled — call
     out your regex explicitly in a comment so it's reviewable.
3. `id_field` validation: if provided, apply the same safe-string check
   as `name` (no arbitrary characters) — it'll eventually be used to look
   up a column, so don't let it silently accept garbage. Trim whitespace.
4. Infra failure: if the Mongo insert fails for any reason other than the
   duplicate-key error (e.g. Mongo unreachable), show the infra-error
   banner, not a crash page.
5. Infra failure on the dashboard read itself: if the query listing
   endpoints fails (Mongo unreachable when loading `/`), render the page
   with an infra-error banner in place of the list, rather than letting
   the page throw. The create form should still render below it if
   possible (fail gracefully per-section, not whole-page).

`/endpoints/[name]` — uploadVersion hardening
1. Zero-byte file: explicitly reject with a clear validation message
   ("File is empty") rather than letting it fall through to the CSV
   parser and produce a confusing parse error.
2. Header row edge cases to add (beyond "non-empty, > 0 columns"):
   - Reject if the header row, once trimmed, contains only whitespace
     column names (e.g. a row of empty strings from a stray comma).
   - Reject if the header row contains duplicate column names
     (case-sensitive exact match is fine for this pass — don't try to
     normalize case/whitespace variants, that's a judgment call to flag
     rather than silently "fix").
3. `id_field`-exists-in-header validation (pulled forward from Step 0
   non-goals): if the endpoint has an `id_field` configured, reject the
   upload if that column name is not present in the parsed header row.
   Clear message: "Uploaded file is missing the configured id column:
   {id_field}".
4. Encoding: detect and reject non-UTF-8 files with a clear message
   rather than passing garbled bytes to csv-parse and getting a cryptic
   parse error. (A simple heuristic/library-based check is fine — don't
   over-engineer full encoding detection.)
5. Interrupted/partial upload: if formData extraction itself throws
   (e.g. malformed multipart body), treat as an infra error, not a
   validation error — the user didn't do anything wrong here.
6. S3/SeaweedFS PUT failure: if the S3 call throws after CSV validation
   has already passed, show the infra-error banner. Explicitly do NOT
   write anything to Mongo in this slice for version tracking (that's
   still out of scope), so there's no partial-state cleanup needed here
   — just confirm the failure path doesn't silently report success.
7. Endpoint-not-found race: if the endpoint is deleted between page load
   and form submission (not currently possible since there's no delete,
   but guard anyway since it's cheap) — re-check existence in the Server
   Action before the S3 PUT, return a clear error if missing, don't rely
   solely on the page-load-time notFound() check.

NON-GOALS (still out of scope — do not build these in this slice)
- No new file formats.
- No retry/backoff logic for infra failures.
- No version history, listing, or Mongo tracking of uploads.
- No endpoint edit/delete.
- No rate limiting or abuse protection.
- No structured logging/observability stack — console.error is sufficient.

TESTS
Extend the existing test suite (same style as Step 0) with cases for:
- duplicate endpoint name via near-simultaneous requests (or simulate by
  calling createEndpoint twice with the same name back-to-back)
- whitespace-only endpoint name rejected
- endpoint name exceeding max length rejected
- id_field with invalid characters rejected
- zero-byte CSV file rejected with correct message
- CSV with duplicate header column names rejected
- CSV with whitespace-only header columns rejected
- CSV missing the configured id_field column rejected
- non-UTF-8 encoded file rejected
- Mongo-unreachable scenario surfaces infra-error banner, not a crash
  (mock/stub the Mongo client for this one rather than requiring an
  actual outage)
- S3-unreachable scenario surfaces infra-error banner on upload (mock/
  stub the S3 client)

DELIVER
- Update the README with the new validation rules and the two error
  classes, so a reviewer understands why an error looks the way it does
  without reading the code.