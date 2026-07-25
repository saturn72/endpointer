# Step 0 — Sub-step 6: Datafeed Service (Go)

## Decisions for this slice

- New component: `src/datafeed-service`. Third Go service — follows the
  existing `.github/instructions/golang.instructions.md`, no new
  instructions file needed.
- No auth, consistent with the rest of Step 0. No `user_name` in the URL
  either — we're still single-tenant, so paths are just `/{endpoint_name}`
  and `/{endpoint_name}/{id}`.
- Always serves the **latest** version for an endpoint (max major, then max
  minor). No version-selection query param yet — that's a natural next
  capability once there's a reason to need it (e.g. someone actually wants a
  pinned older version), not built speculatively now.
- Get-all: offset-based pagination, default `limit=100`, capped at a max
  (e.g. 500) even without auth, since an unbounded query is real risk
  regardless of who's calling it.
- Get-by-id: only works if the endpoint has a non-null `id_field`; otherwise
  400. Looks up the record within the latest version's already-embedded
  `content` array — no separate index needed at this size (this is the same
  tradeoff flagged back when we chose to embed full content in Mongo: fine
  now, worth revisiting if content/version sizes grow).
- Router: Go 1.22+ stdlib `net/http` ServeMux with its method+path pattern
  matching — no chi/gorilla, consistent with "no unnecessary abstraction"
  elsewhere in this repo.
- Surfacing warnings: get-all responses include any `warnings` recorded on
  the version (from the `step_0_3` id-field-mismatch flow) in a small
  `_meta` wrapper, so a feed consumer isn't silently left unaware that (say)
  the declared id_field didn't match this data. Get-by-id stays a clean bare
  record on success — no wrapper — since wrapping a single record makes it
  awkward to consume; if that record's version has warnings, that's already
  visible via the get-all endpoint for the same endpoint.

## The Prompt

```
Create a new Go service, src/datafeed-service, exposing the converted feed
data over HTTP: a paginated get-all endpoint and a get-by-id endpoint. Reads
directly from MongoDB — no caching layer, no auth, happy path only.

1. PROJECT LAYOUT
   - Idiomatic Go layout, consistent with conversion-service and
     versioning-service:
       cmd/datafeed-service/main.go
       internal/httpapi/       (handlers, request parsing, response shaping)
       internal/mongoclient/   (thin Mongo client setup, native mongo-driver)
       go.mod / go.sum
   - Config via env vars:
       MONGODB_URI, MONGODB_DB
       PORT (default 8080)
       DEFAULT_PAGE_SIZE = 100   (named constant, not a magic number inline)
       MAX_PAGE_SIZE = 500       (named constant)
     Add these to .deploy/.env.example.

2. ENDPOINTS
   Use Go's stdlib net/http ServeMux (1.22+ method+path patterns) — do not
   add a third-party router.

   a. GET /{endpoint_name}?page=&limit=
      - Look up the endpoint in the `endpoints` collection. 404
        ("endpoint not found") if it doesn't exist.
      - Query the `versions` collection for the latest version (max major,
        then max minor) for this endpoint_name. 404
        ("no data available for this endpoint yet") if none exist.
      - Parse `page` (default 1) and `limit` (default DEFAULT_PAGE_SIZE, cap
        at MAX_PAGE_SIZE). 400 on non-positive or non-integer values.
      - Slice the version's `content` array in application code according to
        page/limit (offset-based: skip (page-1)*limit, take limit).
      - Respond:
          {
            "data": [ ...page of records... ],
            "pagination": {
              "page": <int>, "limit": <int>,
              "total": <int>,        // total records in this version's content
              "total_pages": <int>
            },
            "_meta": {
              "version": "<major>.<minor>",
              "warnings": [...]       // from the version doc, [] if none
            }
          }

   b. GET /{endpoint_name}/{id}
      - Look up the endpoint. 404 if it doesn't exist.
      - 400 ("this endpoint has no id_field configured") if `id_field` is
        null for this endpoint.
      - Look up the latest version. 404 ("no data available for this
        endpoint yet") if none exist.
      - Scan the version's `content` array for a record where
        record[id_field] == {id} (string comparison). Return that record
        directly as the JSON body (no wrapper) on a match.
      - 404 ("record not found") if no match.

   c. GET /healthz — no auth, checks Mongo connectivity, returns 200/503.

3. CROSS-CUTTING
   - Consistent JSON error shape across all failure responses:
       { "error": "<message>" }
   - Structured logging via log/slog for each request (method, path, status,
     latency) and for any unexpected errors.
   - Panic recovery middleware — a bad request should never crash the
     process; return 500 with a generic error body and log the actual panic
     server-side.

4. UPDATE COPILOT INSTRUCTIONS
   - Update .github/copilot-instructions.md's build/run section to include
     src/datafeed-service (go build / go run, env vars, how
     .deploy/docker-compose.yml wires it) — verify these commands actually
     work as part of this task.
   - No changes needed to .github/instructions/golang.instructions.md.

5. DEPLOY WIRING
   - Add a datafeed-service entry to .deploy/docker-compose.yml (same
     multi-stage Go Dockerfile pattern as the other two Go services), wired
     to the mongodb container, exposing PORT to the host for manual testing.

NON-GOALS
- No authentication/authorization.
- No version-selection query param — always latest.
- No regex/fuzzy/name-based search (that's a distinct future capability, not
  this one — get-by-id is exact match on id_field only).
- No caching layer of any kind yet.
- No changes to conversion-service, versioning-service, or the dashboard.

TESTS
- Unit tests: pagination math (page/limit -> correct slice bounds, edge
  cases like page beyond total_pages returning an empty data array rather
  than an error), id-field lookup against a sample content array.
- Integration tests (seed MongoDB directly with an endpoints doc and a
  versions doc): get-all happy path with correct pagination metadata and
  warnings passthrough; get-all with invalid page/limit returns 400;
  get-by-id happy path; get-by-id on an endpoint with no id_field returns
  400; get-by-id with a non-matching id returns 404; requests against a
  nonexistent endpoint return 404; requests against an endpoint with no
  versions yet return 404 with the distinct "no data available" message.
- End-to-end smoke test spanning the full Step 0 pipeline (step_0_1 through
  this one): upload a CSV via the dashboard, wait for a version to appear,
  then call GET /{endpoint_name} against datafeed-service and confirm the
  returned data matches the uploaded CSV's rows.

DELIVER
- README section in src/datafeed-service documenting env vars, both
  endpoints' request/response shapes, and how to run it locally against
  docker-compose.
```

## Open note for next discussion

This completes **Step 0** end-to-end: a file can be uploaded through the
dashboard and read back as JSON through datafeed-service, with the full
pipeline (ingest → convert → version → serve) working on the happy path.
Worth a full manual run-through of all six sub-steps together before moving
on. Per your roadmap, next up is the **unhappy-path phase** — hardening every
capability built so far (real error recovery, the deferred validations like
duplicate-upload handling, offset/checkpoint persistence for the two Go
watchers, major-version-bump support, and eventually the backlog items:
auth, subscriptions/retention, get-by-name/regex/fuzzy search, caching).
Let me know which of those you want to tackle first, or if you'd rather do a
review pass across all of Step 0 before starting on it.
