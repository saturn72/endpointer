# FeedHub Admin Dashboard

Next.js 16 ingest UI for the Endpointer Platform. Manages endpoints and accepts datafeed file uploads in multiple formats.

## Phase status

**Hardening + format-support phase: CLOSED** (Steps 0 – 0.6).

This dashboard is feature-complete for the initial hardening scope:

- Endpoint create with server-side validation (name format, length, uniqueness, id\_field)
- Two-step presigned-POST upload with client-side format detection
- Six supported upload formats: CSV, XLSX, XLS, XML, JSON, INI
- Full server-side validation pipeline (encoding, parse, header structure, id\_field presence, delete-on-failure)
- Comprehensive regression test suite (12 groups, ~60 tests)

**Non-goals / explicitly deferred** (not built in this phase — see [Non-goals](#non-goals)):

- Endpoint edit / delete
- Version history listing on the endpoint detail page
- Resumable / chunked uploads
- Upload job status polling
- Cross-format or cross-record consistency validation beyond the first record
- XSD / schema validation for XML
- Multi-sheet support beyond the first worksheet (XLSX / XLS)
- Namespace-aware XML handling
- Authentication / authorisation
- TSV, YAML, or any other formats beyond the six above

---

## Architecture overview

### Endpoint management

Endpoints are records in MongoDB that describe a named datafeed: its URL-safe name and an optional `id_field` that identifies unique rows in uploaded files.

### Upload flow — two-step direct-to-S3

File uploads use a two-step presigned POST flow so that file bytes never transit the Next.js server. This allows large files to upload without hitting Next.js body-size limits or request timeouts.

```
Browser                     Next.js (server)              SeaweedFS / S3
  │                               │                              │
  │── file selected               │                              │
  │──── getUploadUrl() ──────────►│ validate extension           │
  │                               │ verify endpoint exists       │
  │                               │ generate presigned POST URL  │
  │◄──── { url, fields, key } ────│                              │
  │                               │                              │
  │──── fetch POST (file bytes) ────────────────────────────────►│
  │◄──────────────────────────────────────────────── 204 ────────│
  │                               │                              │
  │──── finalizeUpload(key) ─────►│ GetObjectCommand             │
  │                               │──── stream first row ───────►│
  │                               │◄─── chunk ──────────────────│
  │                               │ validate headers, encoding   │
  │                               │ id_field check               │
  │                               │                              │
  │                [failure]      │── DeleteObjectCommand ───────►│
  │                [success]      │                              │
  │◄──── { status } ─────────────│                              │
```

#### Why validation runs post-storage

Validation happens in `finalizeUpload`, _after_ the file has landed in S3. This is necessary because the server never receives the file bytes in this flow.

**Compensating action on failure**: if any validation rule fails, `finalizeUpload` immediately issues a `DeleteObjectCommand` to remove the invalid object from the bucket before returning the error to the user. Delete failures are logged but do not change the validation error returned to the user.

- A valid upload → object persists in S3.
- An invalid upload → object is deleted; user sees the specific validation error.
- A lost or abandoned upload (browser closed mid-flow) → orphaned object stays in S3 until a future cleanup job runs (not yet implemented — non-goal for this phase).

#### Presigned POST policy

- **content-length-range [1, 10 MB]** — rejects zero-byte files at the policy level.
- **5-minute expiry** — short enough that a leaked URL is useless quickly.

### Validation rules

Applied in `finalizeUpload`:

| Rule | Error message |
|---|---|
| Extension not in registry (`.csv`, `.xlsx`, `.xls`, `.xml`, `.json`, `.ini`) | "Only .csv, .xlsx, .xls, .xml, .json, .ini files are accepted" (checked in `getUploadUrl` before bytes move) |
| File is empty (0 bytes) | "File is empty" |
| Not valid UTF-8 (text formats only — CSV, XML, JSON, INI) | "File must be UTF-8 encoded…" |
| Parse error | "File could not be parsed as valid \<format\>" |
| Header row is empty or all-whitespace | "File must have a non-empty header row" |
| Duplicate column names in header | "Header row contains duplicate column names" |
| id\_field not found in header | "Uploaded file is missing the configured id column: \<id\_field\>" |

### Format handler abstraction

All upload formats implement a shared `FileFormatHandler` interface:

```typescript
interface FileFormatHandler {
    extensions: string[];          // e.g. ['.csv']
    supportsStreaming: boolean;     // true if format stops after extracting the first header
    supportsEncodingCheck: boolean; // true for text formats (UTF-8 check applied)
    getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult>;
}
```

Handlers live under `src/actions/formats/`. The **registry** (`formats/registry.ts`) is the single integration point: it imports all handlers and calls `registerHandler()` for each. `finalizeUpload` in `endpoints.ts` never contains per-format logic — it looks up the handler by extension and calls `getHeaderRow`. To add a new format, only `formats/registry.ts` needs to change.

### Supported formats

| Extension | Streaming | UTF-8 check | First-record-only structural assumption |
|---|---|---|---|
| `.csv` | Yes — stops at first newline or 64 KB | Yes | First row = header |
| `.xlsx` | Partial — zip container requires full stream but avoids full object tree | No (binary) | First worksheet, first row only |
| `.xls` | No — full buffer (OLE2 exception, bounded by 10 MB) | No (binary) | First worksheet, first row only |
| `.xml` | Yes — stops after first record's closing tag | Yes | Root → record children → first record's direct child tag names |
| `.json` | Yes — stops after first array element is emitted by `stream-json` | Yes | Top-level array; first element's own keys |
| `.ini` | Yes — stops at start of second `[section]` or EOF | Yes | First `[section]` (or entire flat file) keys |

---

## Format-specific notes

**CSV (`.csv`)** streams up to the first newline or 64 KB, then parses with `csv-parse/sync` (first row only). Memory usage is bounded regardless of file size.

**XLSX (`.xlsx`)** uses exceljs `WorkbookReader` streaming against the S3 response stream. Only the **first worksheet** is inspected; additional sheets are silently ignored. A true stop-after-header short-circuit is not achievable with the zip-based XLSX container; exceljs must consume the full stream, though it avoids materialising a full object tree in memory.

**XLS (`.xls`)** uses SheetJS (xlsx package) in **full-buffer mode**. The legacy OLE2 container format is not supportable in streaming mode — this is a documented exception to the streaming-everywhere principle. The full file is buffered before parsing, bounded by MAX\_UPLOAD\_BYTES (10 MB). Only the **first worksheet** is inspected.

**XML (`.xml`)** uses a sax streaming parser (`strict: true`). The stream is stopped immediately after the first record element's closing tag. Namespace prefixes are stripped before comparison (e.g. `ns:field` → `field`). Attributes are ignored for header derivation.

**JSON (`.json`)** uses `stream-json` with `StreamArray`. The stream is destroyed after the first array element is emitted. Duplicate keys in a single JSON object are technically spec-allowed but have implementation-defined behavior; V8 / stream-json silently keep the last value, so the shared duplicate-key check in `finalizeUpload` is effectively a no-op for JSON — this is noted in code but is not a separate error path.

**INI (`.ini`)** uses a hand-rolled line reader (no external INI library). It reads line-by-line and stops at the start of the second `[section]` header. Flat key=value files without any `[section]` header are supported and treated as a single implicit record. Comment lines (`;` or `#` prefix) and blank lines are skipped. A line that is not a comment, not a section header, and contains no `=` sign is a validation error.

---

## Assumptions to revisit against real data

The following design choices are explicit and documented but may need adjustment once real feed samples are available. They are collected here so a future reviewer sees all open questions in one place rather than scattered across slice history.

**XLSX / XLS — first worksheet only**  
Additional worksheets in a multi-sheet workbook are silently ignored. If a real feed uses a non-first sheet for its data, a configuration option or naming convention will be needed.

**XML — record/child tag model**  
The handler assumes the feed structure is `<root><record><field1>…</field1></record>…</root>`. Feeds that use attributes as field values, have multiple nesting levels, use mixed content, or rely on namespace semantics for record discrimination will not work correctly without revisiting the XML handler.

**XML — namespace prefix stripping**  
Namespace prefixes are stripped by taking the local part of the element name (`ns:field` → `field`). This loses namespace context. Documents where two prefixes point to different namespaces but have the same local name will silently deduplicate. True namespace-aware handling is out of scope for this phase.

**JSON — first element only**  
The handler validates only the first element's keys. Arrays where different objects have different key sets (heterogeneous records) will pass validation as long as the first element's keys satisfy the id\_field check. Full per-row consistency checking is out of scope.

**INI — first section only and loose tabular fit**  
INI is the least settled format. The tabular-feed model (records × fixed column names) maps naturally to CSV, XLSX/XLS, JSON arrays, and XML record lists, but maps loosely to INI's intended key-value/config semantics. The first-section-only assumption mirrors every other format's first-record-only rule but should be validated against real INI feed samples before treating this implementation as production-ready. If real INI feeds have heterogeneous sections, a different structural convention will be needed.

---

## Non-goals

The following items were intentionally excluded from the hardening + format-support phase. They are listed explicitly so future contributors understand what is and is not built.

- **Authentication / authorisation** — no user accounts, sessions, or API keys. Out of scope for this phase.
- **Endpoint edit / delete** — endpoints can be created but not modified or removed through the UI.
- **Version history listing** — the endpoint detail page does not list past upload versions.
- **Resumable / chunked uploads** — all uploads go through a single presigned POST with a hard 10 MB limit.
- **Upload job status polling** — `finalizeUpload` is synchronous from the browser's perspective; no background job queue.
- **Cross-format / cross-record consistency validation** — only the first record's structure is inspected. Rows 2…N may have different shapes; this is not validated.
- **XSD / schema validation for XML** — no DTD or XSD is applied.
- **Multi-sheet support (XLSX / XLS)** — only the first worksheet is inspected.
- **Namespace-aware XML handling** — namespace prefixes are stripped; namespace semantics are not preserved.
- **TSV, YAML, and other formats** — only the six formats above are supported. TSV and YAML are natural candidates for a future format slice.
- **Orphaned-object cleanup** — files abandoned mid-upload (browser closed) remain in S3 until a future cleanup job is implemented.

---

## Running locally

```bash
# 1. Start infrastructure
docker compose -f ../../.deploy/docker-compose.yml up -d

# 2. Install dependencies
npm install

# 3. Create MongoDB indexes (once)
npm run db:init

# 4. Copy and fill in env vars
cp ../../.deploy/.env.example .env.local  # then edit .env.local

# 5. Run dev server
npm run dev   # → http://localhost:3000
```

## Running tests

```bash
# Requires the full docker-compose stack to be running
npm test
```

Tests use Playwright and interact with the real local SeaweedFS and MongoDB instances. The `global-setup.ts` creates the S3 bucket if it does not exist.
