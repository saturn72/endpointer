# Step 0 — Capability 1: Ingest UI (Next.js)

## Decisions locked for this slice

- Next.js (latest), App Router, Server Components + Server Actions only — no
  client-side JS/state library needed for this slice.
- Styling: **Pico.css via CDN** (classless — semantic HTML, minimal markup,
  near-zero maintenance). `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">`
  in the root layout.
- No auth of any kind (no header, no JWT, nothing) — this is deliberately
  deferred until an actual requirement calls for it.
- Storage: SeaweedFS S3 gateway, talked to directly via `@aws-sdk/client-s3`
  (no abstraction layer over it).
- Endpoint metadata: stored directly in MongoDB from Next.js server code (native
  `mongodb` driver, no ORM) — no separate service for this yet.
- CSV validation bar for this slice, deliberately minimal (happy path only):
  file parses successfully as CSV, and the header row is non-empty. Nothing else.
- This slice's job ends once a valid file is sitting in the `raw-uploads`
  bucket. There is no job/status tracking, no polling — conversion and
  versioning are separate future capabilities that react to the bucket
  independently. The UI does not know or care what happens after upload
  succeeds, beyond showing a success message.

## The Prompt

```
Build a minimal Next.js (latest version, App Router) application that lets a
user create "endpoints" (feed definitions) and upload CSV files as new
versions of an endpoint's data. This is a deliberately small, happy-path-only
slice — no auth, no error recovery beyond basic validation, no file formats
besides CSV.

STYLING
- Use Pico.css via CDN: add
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  to the root layout. Do not add Tailwind, Bootstrap, or any other CSS
  framework. Write plain semantic HTML (nav, main, article, form, etc.) — Pico
  styles bare elements, so avoid unnecessary custom classes/divs.

DATA — MongoDB
- Use the native `mongodb` npm driver (not Mongoose). Connection string from
  env var MONGODB_URI, database name from env var MONGODB_DB.
- Collection `endpoints`, documents shaped:
    {
      _id: ObjectId,
      name: string,        // unique, used as the {feed} path segment later
      id_field: string | null,  // optional column name for future get-by-id
      created_at: Date
    }
  Enforce uniqueness on `name` via a unique index (create it in a small
  startup/init script or migration, documented in the README).

STORAGE — SeaweedFS S3 gateway
- Use @aws-sdk/client-s3 directly (no wrapper/abstraction class — call it
  straight from the server action). Configure via env vars: S3_ENDPOINT,
  S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_RAW_BUCKET. Use
  path-style addressing (forcePathStyle: true) since SeaweedFS requires it.
- Uploaded object key format: `{endpoint_name}/{crypto.randomUUID()}/{original_filename}`

PAGES & FLOW (App Router, Server Components + Server Actions — no client JS)

1. `/` — Dashboard
   - Server Component that queries MongoDB for all endpoints, lists them
     (name, id_field if set, created_at) as links to `/endpoints/{name}`.
   - A simple <form> at the bottom (posting to a Server Action
     `createEndpoint`) with two fields: `name` (required, text) and
     `id_field` (optional, text). On submit:
       - Validate `name` is non-empty and matches a safe path-segment pattern
         (letters, numbers, dashes, underscores only) — reject with an inline
         error message (rendered via a redirect with a query param or a
         useFormState-style pattern; keep it simple) if invalid or if a
         duplicate name already exists (catch the unique index violation).
       - Insert the document, then redirect back to `/`.

2. `/endpoints/[name]` — Endpoint detail + upload
   - Server Component that loads the endpoint doc by name (404 via Next's
     `notFound()` if it doesn't exist).
   - Displays the endpoint's name and id_field (or "none configured").
   - An upload <form> (multipart, posting to a Server Action `uploadVersion`)
     with a single file input restricted to `.csv` client-side (`accept=".csv"`)
     — but do NOT rely on the accept attribute for validation, re-check
     server-side regardless.
   - Server Action `uploadVersion(endpointName, formData)`:
       a. Extract the file from formData. Reject (return an error state
          rendered on the page) if:
          - no file provided
          - file extension is not exactly `.csv`
          - file size exceeds 10MB (define this as a named constant, e.g.
            MAX_UPLOAD_BYTES = 10 * 1024 * 1024 — do not hardcode the raw
            number inline in the validation check)
       b. Read the file content, parse with the `csv-parse` npm package
          (sync API is fine at this size). Reject if:
          - parsing throws (malformed CSV)
          - the resulting header row is empty or has zero columns
       c. On successful validation, PUT the raw file bytes to the SeaweedFS
          S3 bucket at the key format above.
       d. Show a success message on the page (e.g. via a redirect with
          ?uploaded=1 query param, rendered as a Pico `<mark>` or `<ins>`
          success banner) — no job ID, no status tracking, just confirmation
          that the file was accepted and stored.
   - On any validation failure, render a clear inline error message on the
     same page (do not lose the user's place) rather than a generic 500.

CONFIG
- All env vars above, loaded via `process.env` (Next.js handles .env.local
  natively — no need for a custom config module at this size). Document all
  required env vars in a .env.example file at the repo root.

NON-GOALS (explicitly out of scope for this slice — do not build these)
- No authentication/authorization of any kind.
- No file formats other than CSV.
- No job status, processing indicator, or polling — upload success is the end
  of this slice's responsibility.
- No pagination, search, or listing of uploaded versions/content (that's the
  datafeed service, a separate future capability).
- No id_field-exists-in-header validation (deferred to the unhappy-path phase).
- No retry logic, no duplicate-upload detection beyond the Mongo unique index
  on endpoint name.

TESTS
- Write a small set of integration tests (e.g. using Playwright or a simple
  fetch-based test against a running dev server + a local Mongo/SeaweedFS via
  docker-compose) covering:
  - creating an endpoint successfully
  - rejecting a duplicate endpoint name
  - uploading a valid small CSV and confirming it lands in the SeaweedFS
    bucket at the expected key
  - rejecting a non-CSV file
  - rejecting an oversized file
  - rejecting a CSV with an empty header row

DELIVER
- A README section: env vars required, how to run `npm install && npm run dev`
  against a local MongoDB + SeaweedFS (assume docker-compose already provides
  these — reference the compose file if one exists in the repo, otherwise note
  that it's expected to be added alongside this in the same environment).
```

## Open note for next discussion

Once this is reviewed/merged, next up per your roadmap order is **Capability 2:
Conversion service** (Go, subscribes to the `raw-uploads` bucket via SeaweedFS's
`SubscribeMetadata` gRPC stream, converts CSV → JSON, writes to a
`converted-feeds` bucket). Flag if you want to discuss that implementation now
or review this one first.
