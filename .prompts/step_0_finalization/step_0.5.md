Understood — no new functionality, just: (1) retrofit the existing three formats onto a common abstraction with zero behavior change, and (2) add XML on top of that abstraction. No JSON, no INI, no version/edit/delete.

One assumption I need to state up front since XML has no natural "header row" — I'll define it now rather than asking again, and flag it clearly in the prompt so it's easy to overrule in review:

**XML shape assumption:** a valid feed is a single root element containing repeated sibling "record" elements, and the "header" equivalent is the set of **child element tag names** on the *first* record (attributes are ignored for this purpose). This mirrors CSV's "first row = header" concept as closely as XML allows. If your actual XML feeds look different (e.g. attribute-based, deeply nested, mixed schemas), this needs revisiting before real data hits it — but it's a reasonable default to unblock the same validation rules (empty/duplicate/whitespace tag names, id_field-in-header) applying unchanged.

---

# Step 0.4 — Format Abstraction Refactor + XML Support

## Decisions locked for this slice

- No new pages, no version history, no endpoint edit/delete, no JSON/INI.
  Exactly two things happen here: existing formats get refactored behind
  a common interface with no behavior change, and XML is added as a new
  implementation of that interface.
- The refactor must be verifiably behavior-preserving — the Step 0.4
  test suite should be the *existing* regression suite (from the prior
  prompt) passing unchanged, plus new XML-specific tests. If any
  existing test needs to change to pass, that's a signal the refactor
  altered behavior, which is out of scope here.
- XML "header" = child element tag names of the first record element
  under the root, per the assumption above. Attributes are ignored.
  Document this as an explicit, revisitable assumption in the README,
  not a settled design.

## The Prompt

```
Two-part slice. Part A is a pure refactor (no behavior change) of the
existing CSV/XLSX/XLS validation logic behind a shared format-handler
interface. Part B adds XML support as a new implementation of that same
interface. Do not add any other functionality — no version history, no
endpoint edit/delete, no other file formats.

PART A — FORMAT HANDLER ABSTRACTION (refactor, no behavior change)

Introduce a shared interface that all format-specific logic implements,
e.g.:

  interface FileFormatHandler {
    extensions: string[];                 // e.g. ['.csv']
    supportsStreaming: boolean;           // honest per Step 0.3's XLS note
    supportsEncodingCheck: boolean;       // true only for CSV currently
    getHeaderRow(stream: ReadableStream): Promise<string[]>;
  }

- Implement this for CSV, XLSX, and XLS exactly as their current logic
  behaves — this is a refactor, not a rewrite. Move the existing
  per-format parsing code into three handler modules without changing
  what they accept/reject.
- `finalizeUpload` should no longer contain per-format if/else branches
  for header extraction. It should:
  1. Look up the handler by file extension (a small registry/map keyed
     by extension, extensions come from each handler's `extensions`
     array — do not hardcode a switch statement on extension strings
     in finalizeUpload itself, so adding a new format later means
     registering a new handler, not editing this function)
  2. Call `handler.getHeaderRow(stream)`
  3. Run the SAME shared validation rules against the returned array,
     regardless of format: empty header, whitespace-only entries,
     duplicate entries, id_field-in-header check
  4. If `handler.supportsEncodingCheck`, run the UTF-8 check before
     handing the stream to the parser (encoding check moves from a
     CSV-specific inline step to a handler-flag-gated shared step)
- Unregistered/unrecognized extensions should be rejected at
  getUploadUrl the same way as before (extension allowlist check stays
  where it is — the registry is a superset check, not a replacement for
  that early rejection).
- Do NOT change: key format, presigned POST logic, delete-on-failure
  behavior, error classes/messages, MAX_UPLOAD_BYTES enforcement. Those
  are untouched by this refactor.

PART B — XML SUPPORT (new handler)

Structural assumption (explicit, documented, revisitable):
- A valid XML feed is a single root element containing one or more
  sibling child elements, each representing one "record."
- The header equivalent is the set of child element tag names found
  under the FIRST record element. Attributes on any element are
  ignored for header-derivation purposes.
- Example of the assumed shape:
    <feed>
      <record><id>1</id><name>Alice</name></record>
      <record><id>2</id><name>Bob</name></record>
    </feed>
  Header derived: ["id", "name"]

Implement the handler:
- extensions: ['.xml']
- supportsEncodingCheck: true (XML is text-based; reuse the same UTF-8
  check logic as CSV)
- supportsStreaming: use a streaming XML parser (e.g. sax-js or a
  streaming mode of a library like `saxes`) against the S3 read stream,
  reading only far enough to extract the first record's child tag
  names before stopping — do not parse the entire document just to get
  the header, unlike the XLSX exception from 0.3. If true streaming
  short-circuit isn't achievable with your chosen library, document why
  as an exception, same as the 0.3 XLS precedent.
- getHeaderRow implementation:
  - Reject (empty-header-equivalent error) if there's no root element,
    or the root has zero child elements (no records)
  - Reject if the first record element has zero child elements
  - Extract child tag names of the first record, apply the same shared
    validation rules as every other format (duplicate tag names,
    whitespace-only — trim tag name text — and id_field-in-header)
  - Malformed/unparseable XML (not well-formed) → validation error,
    same class as a CSV parse failure, not an infra error

- Update getUploadUrl's extension allowlist to include .xml.
- Update the format registry from Part A to include the new XML
  handler — this should be the ONLY place a new format needs to be
  wired in, proving the abstraction from Part A actually works.

NON-GOALS (explicitly out of scope for this slice)
- No XML Schema (XSD) or DTD validation.
- No namespace handling — assume unnamespaced or ignore namespace
  prefixes for tag-name comparison purposes (document this as another
  revisitable assumption).
- No support for attribute-based records (only child-element-based, per
  the structural assumption above).
- No multi-root, no mixed record shapes across a single file (each
  record MAY have a different set of children — this slice validates
  the FIRST record's shape only, consistent with how XLSX validates
  only the first worksheet's first row; deeper per-row consistency
  checking is out of scope, same boundary as every other format).
- JSON, INI: not part of this slice.
- No version history, endpoint edit/delete, or any other functionality
  beyond format handling.

TESTS
1. Regression: re-run the full existing Step-0-through-0.3 suite
   unchanged. Every test that passed before this refactor must still
   pass, with no test modifications required. Call out explicitly in
   the PR/README if any existing test HAD to change, since that means
   the refactor leaked into behavior.
2. New XML-specific tests, mirroring the pattern used for XLSX in 0.3:
   - Valid XML upload (multiple records, consistent shape) succeeds
     end-to-end, object lands in the bucket at the expected key
   - XML with no root children (zero records) rejected
   - XML with a first record having zero children rejected
   - XML with duplicate child tag names in the first record rejected
   - XML with whitespace-only tag name (if constructible — otherwise
     note as not applicable, since XML tag names have syntactic
     restrictions the parser itself may enforce) rejected or documented
     as N/A
   - XML missing the configured id_field among first-record child tags
     rejected
   - Malformed (not well-formed) XML rejected as validation error, not
     a crash
   - Non-UTF-8 encoded XML file rejected (reusing the encoding check)
   - Confirm object deletion-on-failure applies to XML validation
     failures same as other formats
3. New abstraction test: confirm the format registry is the only
   integration point — e.g. a unit test that instantiates the registry
   and asserts all four handlers (csv, xlsx, xls, xml) are present and
   correctly keyed by extension, without needing to inspect
   finalizeUpload's internals.

DELIVER
- Update the README: document the FileFormatHandler interface, the
  registry pattern, and the four current extensions. Clearly mark the
  XML structural assumptions (record-shape, attributes-ignored,
  first-record-only validation, no namespace handling) as assumptions
  to revisit against real XML feed samples, not settled requirements.
```

## Open note for next discussion

Once this lands, formats-wise you're at CSV/XLSX/XLS/XML with a clean extension point. JSON, INI, and the "basic functionality" backlog (version history, edit/delete) are still parked — worth revisiting once you've seen this abstraction hold up against a real format addition.