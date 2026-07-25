Here's the full current feature set, as it stands after Step 0 → 0.1 → 0.2 → 0.3 (noting where later slices replaced earlier behavior).

## Feature inventory

**Dashboard (`/`)**
- Lists all endpoints (name, id_field, created_at) as links to `/endpoints/{name}`
- Infra-error banner (not a crash) if the Mongo read itself fails; create-form still renders below it
- Create-endpoint form:
  - `name`: required, trimmed, rejects whitespace-only, safe path-segment characters only, no leading/trailing dash/underscore, max length (`MAX_ENDPOINT_NAME_LENGTH = 100`)
  - `id_field`: optional, same safe-string validation, trimmed
  - Duplicate name → validation error ("Endpoint name already exists"), driven by Mongo's unique index + code 11000, distinct from other insert failures
  - Any other Mongo insert failure → infra-error banner, not a crash
  - Success → redirect to `/`

**Endpoint detail (`/endpoints/[name]`)**
- 404 (via `notFound()`) if endpoint doesn't exist at page-load time
- Displays name + id_field (or "none configured")
- Upload flow is **direct-to-S3** (replaced the original multipart Server Action entirely in 0.2):
  1. Client script requests a presigned POST via `getUploadUrl(endpointName, filename)`
  2. Browser POSTs the file bytes straight to SeaweedFS (Node never touches the bytes)
  3. Client calls `finalizeUpload(endpointName, key)`, which streams the object back down and validates it

- `getUploadUrl`:
  - Re-verifies endpoint exists
  - Extension check: `.csv`, `.xlsx`, `.xls` only, case-insensitive
  - Generates key `{endpoint_name}/{uuid}/{filename}`
  - Presigned POST scoped to exact key, `content-length-range: [1, MAX_UPLOAD_BYTES]`, expires after `PRESIGNED_URL_EXPIRY_SECONDS`

- `finalizeUpload`:
  - Re-verifies endpoint exists (race guard)
  - Streams `GetObject` from SeaweedFS
  - Format-aware validation branch: streaming CSV parse / streaming XLSX (first worksheet only) / non-streaming XLS (documented exception)
  - Shared validation rules across formats: zero-byte check, parse-failure, empty header, whitespace-only header columns, duplicate header columns, `id_field`-in-header check
  - UTF-8 encoding check — CSV only, skipped for XLSX/XLS
  - On failure: deletes the object, returns validation error (delete failure itself logged as infra error, but validation error still returned to the user)
  - On success: object stays, success banner
  - `GetObject` failure (object never actually landed) → infra-error banner, not validation error

**Cross-cutting**
- Two distinct, consistently-styled error classes everywhere: validation error (Pico `<mark>`, actionable message) vs. infra error (generic message, raw errors never exposed, logged server-side only)
- Config: `MONGODB_URI`, `MONGODB_DB`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_RAW_BUCKET`, `MAX_UPLOAD_BYTES`, `MAX_ENDPOINT_NAME_LENGTH`, `PRESIGNED_URL_EXPIRY_SECONDS`

**Explicitly not built yet** (so the test prompt shouldn't test for these): auth, version history/listing, endpoint edit/delete, JSON/XML/INI support, multi-sheet XLSX, resumable uploads, job status/polling.

---

## The test prompt

```
Write a comprehensive end-to-end test suite (Playwright, against a
running dev server backed by a local MongoDB + SeaweedFS via
docker-compose — reuse whatever compose setup already exists in the
repo from prior slices) covering the full current feature set of the
Endpointer ingest app. This is a regression checkpoint across four
prior slices (initial build, unhappy-path hardening, direct-to-S3
upload, XLSX/XLS support) — the goal is a single suite that would catch
a regression in ANY of them, not just the newest one.

Organize the suite into these groups, one describe/test-group per area:

1. DASHBOARD — LISTING
   - Empty state: dashboard loads with no endpoints, doesn't crash
   - Lists existing endpoints with correct name/id_field/created_at
   - Simulated Mongo-read failure (stub/mock the driver) renders an
     infra-error banner in place of the list, while the create form
     below it still renders

2. DASHBOARD — CREATE ENDPOINT
   - Valid creation (name only) succeeds and redirects to /
   - Valid creation (name + id_field) succeeds
   - Duplicate name rejected with the specific validation message, not
     a generic error
   - Whitespace-only name rejected
   - Name exceeding MAX_ENDPOINT_NAME_LENGTH rejected
   - Name with unsafe characters rejected
   - Name with leading/trailing dash or underscore rejected (if that's
     the implemented rule — assert against whatever the actual regex
     comment says, don't assume)
   - id_field with unsafe characters rejected
   - Simulated Mongo-insert failure (non-duplicate-key error) surfaces
     infra-error banner, not a crash

3. ENDPOINT DETAIL — PAGE LOAD
   - Existing endpoint loads and displays name + id_field correctly
   - Endpoint with no id_field displays "none configured"
   - Non-existent endpoint name returns Next's 404 page

4. UPLOAD — HAPPY PATH (all three formats)
   - Valid .csv uploads successfully end-to-end: presigned URL issued,
     browser-side POST to SeaweedFS succeeds, finalizeUpload succeeds,
     success banner shown, object exists in the bucket at the expected
     key format
   - Valid .xlsx uploads successfully end-to-end (same assertions)
   - Valid .xls uploads successfully end-to-end (same assertions)
   - Upload to an endpoint WITH id_field configured, where the file
     DOES contain that column, succeeds

5. UPLOAD — REJECTED BEFORE FINALIZE (policy/extension layer)
   - Non-csv/xlsx/xls extension rejected by getUploadUrl before any
     bytes move (assert finalizeUpload is never reached)
   - Oversized file rejected by the presigned POST's content-length-
     range condition (assert the browser-side POST itself fails, not
     a later step)
   - getUploadUrl called for a non-existent/deleted endpoint returns a
     clear error

6. UPLOAD — REJECTED AT FINALIZE (validation layer, per format)
   For CSV, XLSX, and XLS respectively, confirm each of these is
   rejected AND that the object is deleted from the bucket afterward
   (assert absence, not just the error message):
   - Zero-byte file
   - Empty header row
   - Header row with whitespace-only column names
   - Header row with duplicate column names
   - Missing the configured id_field column (endpoint has id_field set,
     file's header doesn't include it)
   - Malformed/corrupted content (e.g. a non-UTF8 file for CSV; a
     renamed/truncated invalid file for XLSX/XLS) — validation error,
     not a crash
   - (CSV only) Non-UTF-8 encoded file rejected

7. UPLOAD — INFRA FAILURE PATHS
   - finalizeUpload called with a key that was never actually uploaded
     (simulates a failed/incomplete browser-side POST) → infra-error
     banner, not a crash, not mistaken for a validation error
   - Simulated SeaweedFS GetObject failure during finalizeUpload →
     infra-error banner
   - Simulated SeaweedFS DeleteObject failure during a validation
     rejection → user still receives the correct VALIDATION error
     message (not an infra error), while the delete failure is
     separately logged (assert on server logs/mock call, not user-
     facing output)
   - Endpoint deleted between getUploadUrl and finalizeUpload (can be
     simulated directly against finalizeUpload even without a delete
     UI feature) → clear error, not a crash

8. ERROR CLASS CONSISTENCY (cross-cutting)
   - For at least one validation-error case and one infra-error case
     per major flow (create endpoint, upload), assert the RENDERED
     ELEMENT/STYLE differs (e.g. distinguishing selector/class/role),
     not just the text — this is testing the two-error-class UX
     pattern itself, not just that errors happen
   - Assert no raw driver/SDK error message or stack trace ever
     appears in rendered HTML for any infra-error case

TEST INFRASTRUCTURE NOTES
- Use a fresh, isolated MongoDB database and SeaweedFS bucket per test
  run (or per test, if fast enough) — do not assume a clean slate and
  do not leave test data behind that could break subsequent runs.
  Provide a setup/teardown helper if one doesn't already exist.
- For infra-failure simulations (Mongo down, S3 down, delete-fails),
  prefer mocking/stubbing the relevant client over actually taking
  down the docker-compose services mid-run, for speed and determinism
  — but note in a comment if a given case would be better covered by
  an actual service-outage test in a separate, slower suite.
- Group tests so a single failing group clearly points at which slice
  regressed (e.g. a failure in group 6 points at validation logic
  introduced in 0.1/0.3, not the upload transport introduced in 0.2).
- Flag, but do not test, anything from the NON-GOALS list below — if
  you find yourself writing a test for one of these, stop, that
  functionality doesn't exist yet and a test for it would be testing a
  bug or a future feature by mistake:
  - auth of any kind
  - version history or listing of uploaded files
  - endpoint edit or delete
  - JSON, XML, or INI upload support
  - multi-sheet XLSX handling
  - resumable/chunked uploads
  - job status, upload progress percentage accuracy, or polling

DELIVER
- The test suite itself, runnable via a documented npm script (e.g.
  `npm run test:e2e`).
- A short README section listing what's covered by group, so a
  reviewer can map "group 6 failed" to "which slice likely regressed"
  without reading the test code first.
```