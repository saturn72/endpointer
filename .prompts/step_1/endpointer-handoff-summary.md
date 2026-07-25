# Endpointer — Project Handoff Summary

**Purpose of this document:** paste/attach this into a new chat to continue
development with full context, without re-deriving decisions already made.

---

## 1. What this project is

**Endpointer** is a system for ingesting tabular-ish feed files, versioning
them, and (eventually) serving them as converted feeds. It's being built
capability-by-capability, slice-by-slice, with each slice specified as a
detailed prompt before implementation, reviewed here first.

**Roadmap (from the original plan):**
- **Capability 1 — Ingest UI** (Next.js) ← *everything below is this
  capability, and it's the only one built so far*
- **Capability 2 — Conversion service** (Go) — subscribes to the
  `raw-uploads` bucket via SeaweedFS's `SubscribeMetadata` gRPC stream,
  converts uploaded files → JSON, writes to a `converted-feeds` bucket.
  **Not started. Next capability after this one, per original roadmap note.**

---

## 2. Stack (as currently built)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest), App Router | Server Components + Server Actions only for most of the app |
| Client JS | Minimal, one deliberate exception | Upload orchestration script only (see §5) — no framework, no client state library |
| Styling | Pico.css v2, via CDN | Classless — plain semantic HTML, no Tailwind/Bootstrap, minimal custom classes |
| Database | MongoDB, native `mongodb` driver | No Mongoose/ORM |
| Object storage | SeaweedFS (S3-compatible gateway) | Via `@aws-sdk/client-s3` directly, no wrapper abstraction; path-style addressing (`forcePathStyle: true`) |
| Auth | None | Deliberately deferred, no requirement yet |
| Deployment target | **Self-hosted Node (Docker/VM)** | Confirmed explicitly — not serverless, no request-duration/body-size platform ceiling. This fact justified some architecture choices below (see §5). |

---

## 3. Data model

**MongoDB collection: `endpoints`**
```
{
  _id: ObjectId,
  name: string,              // unique (enforced via unique index), safe path-segment chars only
  id_field: string | null,   // optional column/key name for future get-by-id
  created_at: Date
}
```
- Unique index on `name`, created via a startup/init script (documented in README).
- `name` validation: non-empty after trim, max length `MAX_ENDPOINT_NAME_LENGTH = 100`,
  safe path-segment characters only (letters/numbers/dashes/underscores), no
  leading/trailing dash or underscore.
- `id_field` (if provided): same safe-string validation as `name`, trimmed.
- **No other collections exist yet.** No version/upload-history collection —
  every upload's fate ends at "object exists in bucket or it doesn't." This is
  a known gap (see §8).

**SeaweedFS object key format:**
```
{endpoint_name}/{crypto.randomUUID()}/{original_filename}
```
Bucket: `raw-uploads` (per original roadmap note — S3_RAW_BUCKET env var).

---

## 4. Pages & flows (current)

### `/` — Dashboard
- Lists all endpoints (name, id_field, created_at) as links to `/endpoints/{name}`.
- Infra-error banner (Mongo read failure) renders in place of the list; create
  form still renders below it independently (fails per-section, not whole-page).
- Create-endpoint form → Server Action `createEndpoint`:
  - Validates `name`/`id_field` per §3 rules.
  - Duplicate name → validation error via catching Mongo's duplicate-key error
    (code 11000) specifically — not a generic infra error.
  - Any other Mongo insert failure → infra-error banner.
  - Success → redirect to `/`.

### `/endpoints/[name]` — Endpoint detail + upload
- 404 (Next's `notFound()`) if endpoint doesn't exist at page-load.
- Displays name + id_field ("none configured" if null).
- Upload flow is **direct-to-S3** (see §5 for why and how) — this replaced an
  earlier multipart-through-Server-Action design entirely; that old code path
  no longer exists.

---

## 5. Upload architecture — direct-to-S3 (the most important design decision)

**Why:** to support large files without buffering them through the Node
server. Considered three options (buffered Server Action → streaming Route
Handler → direct-to-S3 presigned upload) and **chose direct-to-S3**, even
though self-hosted Node has no platform ceiling that would have forced this —
it was a deliberate choice to fully decouple file bytes from the app server.

**This choice reopened two decisions from the original "no client JS" and
"single Server Action" design** — accepted deliberately:
- A small client-side orchestration script now exists (upload progress via
  native `<progress>`, sequencing the two calls below). No framework, no
  client state library, no client-side content validation — server remains
  the sole source of truth.
- Upload is now a **two-Server-Action sequence**, not one.

**Flow:**
1. **`getUploadUrl(endpointName, filename)`**
   - Re-verifies endpoint exists.
   - Extension check happens here (before any bytes move) — currently allows
     `.csv`, `.xlsx`, `.xls`, `.xml`, `.json`, `.ini` (see §6 for full history).
   - Generates the object key (format in §3).
   - Uses `createPresignedPost` (from `@aws-sdk/s3-presigned-post`) — **not**
     a plain presigned PUT — specifically so `content-length-range` can be
     baked into the signed policy, enforcing `MAX_UPLOAD_BYTES` at the
     storage layer before any app code runs on the bytes.
   - Presigned POST is scoped to the exact key, expires after
     `PRESIGNED_URL_EXPIRY_SECONDS`.
2. **Browser POSTs the file directly to SeaweedFS.** Node never sees the
   file bytes at all during this step.
3. **`finalizeUpload(endpointName, key)`**
   - Re-verifies endpoint exists (race guard — endpoint could theoretically
     be deleted mid-flow, guarded against even though delete doesn't exist
     yet as a feature).
   - Streams the object back down via `GetObjectCommand` (no full buffering).
   - Runs format-aware validation (see §6).
   - **On validation failure:** issues `DeleteObjectCommand` to remove the
     now-invalid object, then returns the validation error. If the delete
     itself fails, that's logged as an infra error server-side, but the
     original validation error is still what the user sees (the actionable
     one takes priority).
   - **On success:** object stays in the bucket, success banner shown.
   - **If `GetObjectCommand` fails** (e.g. the browser-side POST never
     actually completed) → infra-error banner, not mistaken for a validation
     error.

**Key consequence of this design:** validation now happens *after* storage,
with deletion-on-failure as the compensating action — not before storage as
in the original Step 0 design. This was accepted deliberately in exchange for
keeping the user experience synchronous (no job IDs, no polling — still a
hard non-goal, see §8).

---

## 6. File format support — the abstraction layer

**Currently supported extensions:** `.csv`, `.xlsx`, `.xls`, `.xml`, `.json`, `.ini`
(all six originally requested formats are done; INI was flagged as the
loosest conceptual fit — see assumptions below).

**Abstraction (introduced specifically to make format addition mechanical):**
```ts
interface FileFormatHandler {
  extensions: string[];            // e.g. ['.csv']
  supportsStreaming: boolean;      // honest flag — not all formats can truly short-circuit
  supportsEncodingCheck: boolean;  // UTF-8 check only applies to text-based formats
  getHeaderRow(stream: ReadableStream): Promise<string[]>;
}
```
- `finalizeUpload` looks up a handler from a **registry keyed by extension**
  — no per-format if/else branching in the main flow. Adding a new format
  means registering a new handler, not editing `finalizeUpload`.
- Shared validation rules run identically regardless of format, against
  whatever header array `getHeaderRow()` returns:
  - Empty header rejected
  - Whitespace-only entries rejected
  - Duplicate entries rejected
  - `id_field`-in-header check (if endpoint has `id_field` configured)
  - Parse/malformed-content failures → validation error, same class as any
    other rejection, never an infra error
- Encoding check (UTF-8) is handler-flag-gated (`supportsEncodingCheck`) —
  applies to CSV/XML/JSON/INI (text-based), explicitly skipped for XLSX/XLS
  (binary formats with their own internal string encoding).

**Per-format structural assumption (each is "first record only" — none of
these validate consistency across all records in a file; this mirrors across
every format deliberately):**

| Format | "Header" derivation | Key caveats |
|---|---|---|
| CSV | First row | Baseline; sync parser (0.1) → streaming parser (post-0.2) |
| XLSX | First row of **first worksheet only** | Multi-sheet files: other sheets silently ignored |
| XLS | First row of first worksheet | **Non-streaming exception** — legacy binary format, most libraries can't stream it; bounded by `MAX_UPLOAD_BYTES` as mitigation, documented as an honest gap, not silently regressed |
| XML | Child element tag names of the **first record** under root | Assumes root → repeated sibling record elements. Attributes ignored. No namespace handling. Assumption explicitly flagged as revisitable against real data. |
| JSON | Keys of the **first array element** | Assumes top-level array of objects. Duplicate-key check is a structural no-op (valid JSON objects can't have dupe keys) — noted, not silently skipped. |
| INI | Keys within the **first `[section]`** (or whole file if no sections exist, treated as one implicit record) | **Flagged as the loosest fit** — INI is inherently key-value/config-shaped, not tabular. Worth revisiting whether it belongs in this capability at all, once real INI feed samples exist. |

**All structural assumptions above are documented in the README's
consolidated "assumptions to revisit against real data" section — treat them
as working defaults, not settled requirements, especially XML/INI.**

---

## 7. Error handling model (cross-cutting, applies everywhere)

Two distinct, consistently-styled error classes — this distinction is
load-bearing across the whole app, not just upload:

- **Validation error** (user's input/file is wrong): Pico `<mark>`-style
  inline banner, specific and actionable message, preserves user's place on
  the page.
- **Infra error** (Mongo/S3 unreachable or erroring): visually distinct
  banner (different selector/class/role — tested explicitly), generic
  message only, **raw driver/SDK error messages/stacks are never exposed to
  the client** — logged server-side (`console.error` is sufficient at this
  size, no logging infra).

Both Server Actions catch Mongo/S3 calls specifically (not the whole action)
to route failures to the correct class rather than lumping everything into
one generic try/catch.

---

## 8. Explicit non-goals (accumulated across every slice — still true)

- **No auth of any kind.**
- **No version history or listing** of uploaded files per endpoint —
  upload succeeds or fails, nothing is tracked afterward. This is the
  biggest functional gap if you want to actually browse what's been
  uploaded.
- **No endpoint edit or delete.** Create-only.
- **No job status, processing indicator, or polling** — upload
  success/failure is synchronous and is the end of this capability's
  responsibility. (This was preserved deliberately even through the
  direct-to-S3 redesign — see §5.)
- **No resumable/chunked uploads** — a failed large upload restarts from
  scratch.
- **No cross-format conversion** at this layer (that's Capability 2's job).
- **No cross-record/multi-row consistency validation** — every format
  checks only the first record's/row's shape.
- **No XSD/DTD validation, no XML namespace handling.**
- **No content-based format sniffing** — the file extension is trusted;
  a mismatched extension (e.g. a `.csv`-renamed binary) is caught only if
  the parser itself throws, not proactively.
- **No pagination/search** anywhere.
- **No rate limiting or abuse protection.**

## 9. Open questions / decisions parked, not yet resolved

These came up but were explicitly deferred — worth resolving before touching
the related area again:
- Whether INI genuinely belongs in this capability given its non-tabular
  shape, once real sample files exist.
- The XML/JSON/INI structural assumptions in §6 have never been validated
  against real feed samples — they're reasonable defaults, not confirmed
  requirements.
- What "basic functionality" extension should look like concretely — last
  discussion identified three candidates (version history/listing, endpoint
  edit/delete, view/download a previously uploaded file) but scope was never
  finalized before this format-completion phase took priority.
- If/when endpoint delete is built: whether to cascade-delete its S3 objects
  or leave them orphaned — not decided.

---

## 10. Testing status

A full end-to-end regression suite (Playwright, against local
MongoDB+SeaweedFS via docker-compose) exists covering:
- Dashboard listing (empty state, normal state, Mongo-failure banner)
- Endpoint creation (all validation rules, duplicate handling, infra failure)
- Endpoint detail page (load, 404, no-id_field display)
- Upload happy path for **all six formats**
- Upload rejection at the presigned-POST/policy layer (extension, oversized
  file, non-existent endpoint)
- Upload rejection at the finalize/validation layer, **per format**, with
  explicit assertion that the object is deleted from the bucket after a
  validation failure (not just that an error message appeared)
- Infra-failure simulations (Mongo down, S3 down, delete-fails-but-user-
  still-sees-validation-error, endpoint-deleted-mid-flow)
- Error-class UX consistency (distinct rendered elements, no raw error
  leakage)
- Format-registry completeness (all six handlers present, correctly keyed)

This suite should be treated as the regression baseline for anything built
next — a good sanity check after any further changes is "does this suite
still pass unmodified."

---

## 11. Suggested next steps (pick one to open the new chat with)

1. **Capability 2 — Conversion service (Go)**, per the original roadmap —
   subscribes to `raw-uploads` via SeaweedFS `SubscribeMetadata`, converts to
   JSON, writes to `converted-feeds`.
2. **"Basic functionality" backlog** for Capability 1 — version
   history/listing, endpoint edit/delete, view/download uploaded files.
   Scope was never finalized; start there.
3. **Validate the format assumptions** (§6/§9) against real sample files
   before building more on top of XML/JSON/INI, especially INI's fit.

---

*This document reflects the state after: Step 0 (initial build) → Step 0.1
(unhappy-path hardening) → Step 0.2 (direct-to-S3 large-file support) →
Step 0.3 (XLSX/XLS) → Step 0.4 (format abstraction refactor + XML) → Step 0.5
(JSON + INI, phase close-out). All prompts for these slices exist in prior
chat history if implementation details need to be re-derived.*
