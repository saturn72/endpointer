Starting with XLSX/XLS, per the sequencing we agreed on — it's the closest fit to the tabular model already in place, so it's the right one to prove the new architecture generalizes before tackling JSON/XML's harder "what counts as valid structure" questions.

One architecture note before the prompt: XLSX files are zip-based binary containers, not line-delimited text — most streaming XLSX parsers (e.g. `sax` mode of libraries like `exceljs` or the dedicated streaming reader in `xlsx-stream-reader`) don't stream over an arbitrary readable the same trivially-composable way `csv-parse`'s Transform stream does. I'm scoping this so the S3 read is still a stream (no full-buffer download), but flagging that XLSX's true "stop reading after the header" short-circuit is weaker than CSV's — worth knowing going in rather than discovering mid-implementation.

---

# Step 0.3 — Capability 1: XLSX/XLS Format Support

## Decisions locked for this slice

- Adds `.xlsx` and `.xls` as accepted upload formats, alongside CSV — not
  replacing it. Endpoint upload accepts either.
- Reuses the direct-to-S3 architecture from Step 0.2 as-is: presigned POST
  upload, then `finalizeUpload` streams the object back from SeaweedFS,
  validates, deletes on failure. No changes to that flow's shape.
- Only the **parsing/validation layer** inside `finalizeUpload` gains a
  format branch. Everything else (endpoint lookup, key format, error
  classes, success banner) stays identical across formats.
- Header/structural validation rules from CSV carry over conceptually to
  XLSX/XLS: first row = header, same empty/whitespace/duplicate-column
  checks, same `id_field`-in-header check. "First row" for XLSX means
  the first row of the **first worksheet only** — multi-sheet files are
  explicitly not supported this slice (see non-goals).
- Streaming caveat: unlike CSV, most XLSX parsers can't guarantee a true
  "stop after first row" short-circuit due to the zip-based file format.
  Use a streaming XLSX reader (e.g. `exceljs`'s streaming/worksheet
  reader) to avoid holding the *entire parsed workbook* in memory at
  once, but accept that some portion of the file must be read/decompressed
  before the header row is available — document this tradeoff in the
  README rather than pretending it's identical to CSV's short-circuit
  behavior.

## The Prompt

```
Add .xlsx and .xls upload support alongside the existing CSV support,
using the direct-to-S3 architecture from Step 0.2 (presigned POST
upload, finalizeUpload validates via streaming read-back from
SeaweedFS, deletes object on validation failure). Do not change the
upload flow's shape — only add a format branch to the validation layer.

FORMAT DETECTION
- Extend the extension check in getUploadUrl to accept .csv, .xlsx, and
  .xls (case-insensitive). Reject anything else, same as before.
- Store the detected format (derived from extension) and pass it through
  to finalizeUpload so it knows which parser branch to use — do not
  re-sniff file content to guess format; trust the extension the same
  way the CSV-only slice did (content-based format validation is a
  separate concern from structural validation, and out of scope here).

PARSING — XLSX (.xlsx)
- Use a streaming-capable reader (e.g. exceljs's streaming API) against
  the S3 GetObject stream. Avoid loading the full workbook into memory
  via the non-streaming API.
- Read only the first worksheet. If the workbook has zero worksheets,
  treat as equivalent to "empty header" — same rejection message style
  as CSV's empty header case.
- Extract the first row of that worksheet as the header row. Apply the
  same validation rules as CSV: reject if empty, if all cells are
  whitespace-only, if there are duplicate column names (compare cell
  values as strings, trimmed), and check id_field-in-header the same
  way.
- Note explicitly in code comments where the "stop reading early" logic
  applies and where it doesn't, given the streaming caveat described
  above — don't claim a false symmetry with the CSV short-circuit.

PARSING — XLS (legacy binary format, .xls)
- .xls is a different, older binary format (OLE2-based, not zip-based)
  from .xlsx — most modern JS libraries (including exceljs) do not
  support streaming, or in some cases don't support .xls at all. If
  your chosen library only offers a non-streaming .xls reader, that's
  acceptable for this slice given the same MAX_UPLOAD_BYTES cap already
  bounds worst-case memory use — but call this out explicitly as a
  documented exception to the "streaming everywhere" principle from
  Step 0.2, not a silent regression.
- Same header validation rules apply once parsed: empty/whitespace/
  duplicate columns, id_field-in-header check.

VALIDATION ERROR MESSAGES
- Keep error messages format-aware but consistent in tone with existing
  CSV messages, e.g. "Uploaded file is missing the configured id
  column: {id_field}" — same message regardless of format, since the
  user shouldn't need to know which parser rejected it.
- Corrupted/unreadable file (parser throws for either format — e.g. not
  actually a valid xlsx/xls despite the extension) maps to the same
  validation-error class as a CSV parse failure, not an infra error.

ENCODING CHECK
- The UTF-8 encoding check from Step 0.1 was CSV/text-specific and does
  not apply to XLSX/XLS (both are binary formats with their own internal
  string encoding handled by the parsing library). Skip this check for
  these two formats — do not attempt to apply it to binary content.

NON-GOALS (explicitly out of scope for this slice)
- No multi-sheet support — only the first worksheet is read; additional
  sheets are silently ignored (not validated, not rejected, not
  mentioned to the user). Flag as a candidate for a future slice if
  multi-sheet feeds turn out to matter.
- No cell-type validation (numbers vs strings vs dates in data rows) —
  header-row structural checks only, same scope boundary as CSV.
- No formula evaluation — if cells contain Excel formulas, read the
  cached/last-computed value only (standard library behavior), do not
  attempt to evaluate formulas server-side.
- No conversion between xlsx/xls/csv at this layer — the raw uploaded
  bytes are what get stored in SeaweedFS, in whatever format they came
  in (format-to-format conversion is Capability 2's job, per the
  original roadmap).
- JSON and XML support remain separate future slices, not bundled here.

TESTS
Extend the existing suite with:
- valid .xlsx upload (multi-column, single sheet) succeeds end-to-end
- valid .xls upload succeeds end-to-end
- .xlsx with empty first worksheet rejected
- .xlsx with zero worksheets rejected
- .xlsx with duplicate header column names rejected
- .xlsx missing the configured id_field column rejected
- .xls equivalent of at least one of the above (duplicate headers or
  missing id_field) to confirm the legacy-format branch is exercised
- corrupted file with .xlsx extension (e.g. a renamed .csv or truncated
  binary) rejected as a validation error, not a crash/infra error
- confirm object deletion-on-failure (from Step 0.2) still applies
  correctly for XLSX/XLS validation failures, not just CSV

DELIVER
- Update the README: list all three now-supported extensions, document
  the first-worksheet-only limitation, and document the XLS streaming
  exception (non-streaming parse, bounded by MAX_UPLOAD_BYTES) so a
  reviewer understands why that one path differs from the rest of the
  architecture.
```

## Open note for next discussion

Once this lands, the next slice is **JSON support** — and before I write that prompt, we need to settle the structural question I flagged earlier: is a JSON upload expected to be an array of flat objects (so "header" = the union or intersection of keys across objects), or something looser? That decision shapes the whole validation branch, so worth a short back-and-forth before I draft it, rather than me guessing.