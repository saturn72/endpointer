# Step 0 — Sub-step 3: Design System, Version Display, Implicit Upload & ID-Field Warning Flow

## Decisions for this slice

- **Design system**: a deliberate, restrained palette — not the generic
  AI-dashboard default (no indigo-on-white gradient, no cream+terracotta, no
  near-black+neon accent). Base neutrals in Tailwind's `zinc` scale, a single
  primary accent (`teal-700`, `#0F766E`) for primary actions and active nav
  state, and `amber` reserved specifically for warnings (ties in naturally
  with the id-field warning flow this step adds) and `red` for destructive/
  error states only. Cards: white surface, `border-zinc-200`, `shadow-sm`,
  `rounded-lg`. Type scale: body `text-sm`, section headings `text-lg
  font-semibold`, page titles `text-2xl font-bold` — nothing larger, this is a
  dense internal tool, not a marketing page.
- **Latest version display**: this requires formalizing the `versions`
  MongoDB collection schema now (nothing writes to it yet — conversion and
  versioning services are still future capabilities — but the UI needs to
  read it, so the shape needs to be fixed once, here, so those future
  services target the same schema).
- **Implicit upload**: selecting a file immediately triggers validation/
  upload (no separate "submit" click), but the browser's native file picker
  is still constrained to `.csv` via `accept=".csv"` — this requires a small,
  narrowly-scoped Client Component wrapping the file input (same category of
  exception as the nav shell in step_0_2: interactivity isolated to this one
  component, page data-loading stays server-side).
- **ID-field warning flow**: if the endpoint has a declared `id_field` and the
  uploaded file's header row doesn't contain it, the user must be asked to
  continue or discard — this needs a two-phase Server Action (validate, then
  confirm) plus a shadcn `AlertDialog`.
- **Warning propagation contract**: since conversion/versioning services
  don't exist yet, an acknowledged warning has nowhere to land except the raw
  file itself. This prompt establishes the contract: acknowledged warnings
  are attached as S3 object user-metadata on the `raw-uploads` PUT, and
  documented in `.docs/decisions/` so the future conversion-service and
  versioning-service prompts know they must carry that metadata forward into
  the version document's `warnings` field.

## The Prompt

```
Extend the Next.js ingest UI with a real design system, a latest-version
display, an implicit (auto-submit) upload flow constrained to CSV, and an
id-field mismatch warning flow. Do not change the Mongo `endpoints` schema,
the S3 raw-uploads key format, or the CSV parse/validation bar from step_0_1 —
extend behavior, don't replace it.

1. DESIGN SYSTEM
   - Configure the Tailwind theme (via shadcn's theme tokens / CSS variables
     in globals.css) with:
       - Neutrals: Tailwind `zinc` scale for backgrounds, borders, muted text.
       - Primary accent: `teal-700` (#0F766E) for primary buttons, active nav
         state, and links.
       - Warning accent: `amber-600`/`amber-100` background, reserved for the
         id-field warning flow in this prompt — don't use amber elsewhere.
       - Destructive/error: `red-600`/`red-50`, reserved for actual errors.
   - Apply consistently across all three existing pages (`/`, `/endpoints`,
     `/endpoints/[name]`):
       - Cards: white surface, `border border-zinc-200`, `shadow-sm`,
         `rounded-lg`, consistent internal padding (`p-6`).
       - Type scale: body `text-sm text-zinc-700`, section headings
         `text-lg font-semibold text-zinc-900`, page titles
         `text-2xl font-bold text-zinc-900`. Remove any remaining
         default-sized headings left over from the Pico migration.
       - Empty states (e.g. zero endpoints): a muted icon + short, direct
         copy telling the user what to do next (e.g. "No endpoints yet —
         create one to start uploading data."), not just blank space.
   - Use next/font to load a single legible sans-serif (e.g. Inter) instead
     of relying on the browser default — this is a dense internal tool, so
     prioritize legibility over personality.

2. LATEST VERSION DISPLAY
   - Add a `versions` collection to MongoDB with documents shaped:
       {
         _id: ObjectId,
         endpoint_name: string,   // matches endpoints.name
         major: number,
         minor: number,
         content: object,        // full converted JSON, embedded
         warnings: string[],     // default [], see section 4
         source_upload_key: string,  // the raw-uploads S3 key this came from
         created_at: Date
       }
     Create a unique index on (endpoint_name, major, minor). Nothing writes to
     this collection yet in this slice (conversion/versioning services are
     future work) — the UI only needs to read from it, so build the read path
     against this schema and it will start showing real data once those
     services exist.
   - On `/endpoints` (list): for each endpoint card, query the max
     (major, minor) version for that endpoint_name and show it as a small
     Badge (e.g. "v1.4"), or "No versions yet" (muted text) if none exist.
   - On `/endpoints/[name]` (detail): show the same latest-version info more
     prominently near the top of the page (e.g. next to the endpoint name),
     with the same "No versions yet" fallback.

3. IMPLICIT UPLOAD, CSV-ONLY CONSTRAINT
   - Wrap the file input in a small Client Component (isolated to this one
     piece of the upload form — the rest of the page stays a Server
     Component). On file selection (`onChange`), immediately trigger
     validation/upload — no separate submit button click required.
   - Keep `accept=".csv"` on the file input to constrain the OS file picker,
     and keep the existing server-side re-validation of extension/size/parse
     from step_0_1 unchanged — the client-side `accept` attribute is a
     convenience, never the actual enforcement.

4. ID-FIELD WARNING FLOW
   - Extend the `uploadVersion` Server Action to accept an
     `acknowledgeMissingIdField: boolean` parameter (default false).
   - Validation order:
       a. Existing checks first (extension, size, CSV parses, header
          non-empty) — reject as before if any fail.
       b. If the endpoint has a non-null `id_field`, check whether that exact
          column name appears in the parsed header row.
          - If it's missing AND `acknowledgeMissingIdField` is false: do NOT
            upload. Return a distinct "warning" result to the client
            containing a clear message, e.g. "The declared id field 'sku'
            was not found in this file's headers (id, name, price)."
          - If it's missing AND `acknowledgeMissingIdField` is true: proceed
            to upload, but attach S3 object user-metadata on the PUT request,
            e.g. a metadata key such as `warnings` with a JSON-encoded array
            of warning strings (e.g. `["id_field 'sku' not found in header
            row: id, name, price"]`). Document this exact metadata key/format
            in `.docs/decisions/` so future conversion-service and
            versioning-service prompts implement reading and forwarding it.
          - If the field is present, or the endpoint has no id_field
            configured, proceed to upload normally with no metadata.
   - Client-side handling: when the Server Action returns a "warning" result,
     show a shadcn `AlertDialog` (using the amber warning styling from
     section 1) with the message and two actions: "Continue upload" (re-runs
     the same Server Action with the same file and
     `acknowledgeMissingIdField: true`) and "Discard" (clears the file input,
     no upload happens, no error shown — this was a user choice, not a
     failure).
   - On successful upload (with or without an acknowledged warning), show the
     existing success Alert from step_0_2; if a warning was acknowledged,
     mention it in the success message (e.g. "Uploaded — note: id field 'sku'
     was not found in this file's headers.").

5. UPDATE DOCS AND COPILOT INSTRUCTIONS (do not skip)
   - Add `.docs/decisions/00X-versions-schema-and-warning-propagation.md`
     documenting: the `versions` collection schema above, and the S3
     user-metadata contract for propagating warnings from upload through
     conversion and versioning (future services must read this doc before
     they're built).
   - Update `.github/instructions/nextjs.instructions.md` to note that
     narrowly-scoped Client Components are acceptable for: (a) nav-shell
     interactivity (from step_0_2), and now (b) the upload form's
     auto-submit-on-select and warning confirmation dialog — still not a
     general allowance for client-side state elsewhere.

NON-GOALS
- No changes to the `endpoints` schema, the raw-uploads S3 key format, or the
  base CSV validation bar (parse success + non-empty header) from step_0_1.
- No building of the conversion or versioning services themselves in this
  slice — only the schema/contract they'll need to honor later.
- No dark mode, no additional pages beyond the existing three.
- No retry/duplicate-detection logic beyond what already exists.

VALIDATION
- Re-run step_0_1's integration tests unchanged — they test upload behavior,
  not markup, and the happy-path ones should still pass.
- Add new tests: uploading a file where the declared id_field is missing from
  the header shows the warning dialog and does not upload until confirmed;
  choosing "Discard" results in no S3 object being created; choosing
  "Continue" uploads with the expected S3 metadata attached; an endpoint with
  no id_field configured never triggers the warning regardless of headers.
```

## Open note for next discussion

With this merged, **Capability 2: Conversion service** becomes `step_0_4` —
Go, subscribes to `raw-uploads` via SeaweedFS's `SubscribeMetadata` gRPC
stream, converts CSV → JSON, writes to `converted-feeds`, and must now also
read and forward the `warnings` S3 metadata documented in this step's
`.docs/decisions/` note. That's also when `.github/instructions/golang.instructions.md`
gets created. Let me know if you want to discuss that now or review this one
first.
