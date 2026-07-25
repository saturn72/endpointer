Two formats left from your original list — JSON and INI — plus "finalize the phase" means this prompt should close out with a full-system regression pass and consolidated documentation, not just add features.

## Structural decisions for JSON and INI — consistent with the precedent already set

Every format so far validates only the *first record's shape* (XLSX: first worksheet's first row; XML: first record's child tags) rather than checking consistency across all records. I'm extending that same precedent to JSON and INI rather than inventing new rules per format — flagging clearly since it's a real assumption, not a discovered requirement:

- **JSON**: valid feed = a top-level array of objects. Header = keys of the **first object only**. (Rejects: non-array root, empty array, first element not an object/is empty.)
- **INI**: treat each `[section]` as a record; header = keys within that section. Header equivalent is derived from the **first section only**. If the file has no sections (flat key=value only), treat the whole file as a single implicit record and its keys as the header. Flagging explicitly: INI is a much looser fit for the "tabular feed" model than the other four formats — worth revisiting whether it belongs in this capability at all once real INI feed samples exist, rather than treating this as settled.

---

# Step 0.5 — JSON + INI Support, Phase Close-Out

## Decisions locked for this slice

- Adds the final two formats from the original request list (JSON, INI)
  as new `FileFormatHandler` implementations, using the registry from
  Step 0.4 — no changes to `finalizeUpload`, `getUploadUrl`, or the
  upload transport itself beyond registering two new handlers and
  extending the extension allowlist.
- This closes the "Endpointer step 0.1 — harden step 0" phase as
  originally scoped (unhappy-path hardening + format support). Version
  history, endpoint edit/delete, and any other "extend basic
  functionality" work remain explicitly parked for a future phase, not
  touched here.
- No auto-conversion between formats, no cross-format consistency
  checks — same boundaries as every prior format slice.

## The Prompt

```
Add JSON and INI as supported upload formats, implementing
FileFormatHandler for each per the registry pattern from Step 0.4. Then
perform a phase close-out pass: full regression suite, consolidated
documentation, and an explicit review of what remains out of scope.
Do not add any functionality beyond format support and documentation.

PART A — JSON HANDLER

Structural assumption (explicit, documented, revisitable):
- A valid JSON feed is a top-level JSON array, where each array element
  is an object representing one record.
- Header equivalent = keys of the FIRST element only (consistent with
  how XLSX validates only the first worksheet's first row, and XML
  validates only the first record's children — not full-file
  consistency checking).
- Example:
    [
      { "id": 1, "name": "Alice" },
      { "id": 2, "name": "Bob" }
    ]
  Header derived: ["id", "name"]

Implement:
- extensions: ['.json']
- supportsEncodingCheck: true (reuse the existing UTF-8 check)
- supportsStreaming: use a streaming JSON parser (e.g. `stream-json`)
  against the S3 read stream, so the whole file doesn't need to be
  buffered just to inspect the first element. If true early-stop isn't
  achievable with the chosen library for this shape, document why,
  consistent with the XLS/XML precedent for honest exceptions.
- getHeaderRow:
  - Reject if the top-level parsed value is not an array
  - Reject if the array is empty
  - Reject if the first element is not a non-null object, or is an
    empty object ({})
  - Extract the first element's own keys (Object.keys equivalent, not
    inherited/nested keys) as the header array
  - Apply the same shared validation rules as every other format:
    duplicate keys aren't possible in valid JSON objects by
    construction, so that check is effectively a no-op here — note
    this in a code comment rather than silently skipping the shared
    validation function
  - Whitespace-only key names: reject if any key, trimmed, is empty
  - id_field-in-header: same check, applied to the extracted key list
  - Malformed/invalid JSON → validation error, same class as any other
    parse failure, not an infra error

PART B — INI HANDLER

Structural assumption (explicit, documented, revisitable — flag in
README as the least settled of all five formats, since INI is
fundamentally key-value/config-shaped rather than tabular):
- A valid INI feed has one or more [section] headers, each followed by
  key=value lines. Each section is treated as one "record."
- Header equivalent = the set of keys within the FIRST section only.
- If the file has NO section headers at all (pure flat key=value from
  the top of the file), treat the entire file as a single implicit
  record, and its keys as the header.
- Example:
    [record1]
    id=1
    name=Alice

    [record2]
    id=2
    name=Bob
  Header derived: ["id", "name"]

Implement:
- extensions: ['.ini']
- supportsEncodingCheck: true
- supportsStreaming: INI files are small, line-oriented, and typically
  don't warrant a specialized streaming parser — a straightforward
  line-by-line read (stop once the first section's boundary is found,
  i.e. the next [section] line or EOF) satisfies the same
  "don't buffer more than necessary" spirit as the other handlers.
  Use a simple line-reader over the stream rather than pulling in a
  full INI parsing library if one isn't already a dependency —
  document the choice either way.
- getHeaderRow:
  - Reject if the file has zero non-comment, non-blank lines (fully
    empty INI-equivalent of an empty header)
  - Reject if the first section (or the implicit whole-file section,
    if no headers exist) has zero key=value lines
  - Extract keys (left-hand side of each key=value line, trimmed) from
    the first section only
  - Apply shared validation rules: duplicate keys within that section
    rejected, whitespace-only keys rejected, id_field-in-header check
  - Malformed lines (no `=`, outside any recognizable key=value or
    [section] syntax) → validation error, not an infra error

- Update getUploadUrl's extension allowlist to include .json and .ini.
- Register both new handlers in the Step 0.4 registry — this should be
  the only integration point required, per the abstraction's design
  goal.

PART C — PHASE CLOSE-OUT

1. Full regression pass: re-run the entire existing test suite (all
   formats, all error classes, all infra-failure simulations) unchanged
   against the app with JSON/INI added. No existing test should need
   modification — if one does, flag why, since it indicates the new
   formats leaked into shared logic.
2. New tests for JSON and INI, mirroring the exact pattern used for
   XML in Step 0.4:
   - Valid upload succeeds end-to-end for each format
   - Each format's "no records" / "empty first record" equivalent
     rejected
   - Duplicate key names rejected (INI only — note JSON's structural
     inability to have this case in the test comments rather than
     omitting the test silently)
   - Whitespace-only key names rejected (both)
   - Missing configured id_field rejected (both)
   - Malformed content (invalid JSON syntax; INI with unparseable
     lines) rejected as validation error, not a crash (both)
   - Non-UTF-8 encoded file rejected (both)
   - Object deletion-on-failure confirmed for both formats' validation
     failures
   - Registry test extended: assert all SIX handlers (csv, xlsx, xls,
     xml, json, ini) are present and correctly keyed by extension
3. Consolidated documentation pass on the README:
   - One table listing all six supported extensions, their streaming
     status, encoding-check applicability, and their structural
     assumption in one line each
   - A single consolidated "assumptions to revisit against real data"
     section pulling together every documented assumption across
     formats (XLSX first-worksheet-only, XML record/attribute/
     namespace assumptions, JSON first-element-only, INI first-section-
     only and its looser tabular fit) — so a future reviewer sees all
     open questions in one place rather than scattered across slice
     history
   - A single consolidated NON-GOALS section for the whole phase
     (hardening + all formats), explicitly listing what was intentionally
     deferred: auth, version history/listing, endpoint edit/delete,
     resumable uploads, job status/polling, cross-format conversion,
     multi-sheet/multi-record consistency validation beyond the first
     record, XSD/schema validation, namespace handling
4. Do NOT start any of the deferred items above — this slice's job ends
   at documentation, not new functionality.

NON-GOALS (explicitly out of scope for this slice)
- No other new file formats beyond JSON and INI (TSV, YAML, etc. are
  not requested and not in scope — flag as future candidates in the
  README's revisit section if worth mentioning, but do not implement).
- No version history, endpoint edit/delete, or any other functionality
  beyond format support and documentation.
- No cross-format or cross-record consistency validation.

DELIVER
- Updated README per Part C, item 3.
- Full passing test suite (all six formats + all cross-cutting checks).
- A short top-of-README "Phase Status" note stating this closes the
  hardening + format-support phase, and listing the consolidated
  non-goals as the explicit boundary of what's built so far.
```

## Open note for next phase

This closes the phase cleanly. Whenever you're ready, the natural next phase is the parked "basic functionality" backlog — version history/listing, endpoint edit/delete — plus Capability 2 (the Go conversion service) is still waiting from the original roadmap note. Your call on which comes first.