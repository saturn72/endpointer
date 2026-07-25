Replace the upload mechanism on /endpoints/[name] with a direct-to-S3
(SeaweedFS) upload flow, to support large files without routing bytes
through the Next.js server. This changes HOW the file gets to storage
and WHEN validation runs — it does not change WHAT is validated (reuse
all validation rules from Step 0 and Step 0.1 as-is: extension check,
CSV parse, empty/duplicate/whitespace header checks, id_field-in-header
check, encoding check).

CLIENT-SIDE SCRIPT (new — minimal, orchestration only)
- A small client script on the /endpoints/[name] page (this is now the
  one deliberate exception to "no client-side JS" from Step 0 — keep it
  scoped to exactly this: requesting a presigned URL, performing the
  browser-side PUT/POST, then calling finalize. No framework, no client
  state library, no client-side validation logic — validation stays
  server-side only).
- On file selection, show a simple progress indicator (native <progress>
  element is fine) during the direct upload.

SERVER ACTION 1 — getUploadUrl(endpointName, filename)
- Verify the endpoint exists (404-equivalent error if not — re-check
  here even though the page already loaded it, per the existing
  endpoint-not-found race guard from Step 0.1).
- Validate filename ends in .csv (extension check happens here now,
  before any bytes move, since we can't inspect content yet).
- Generate the object key using the existing format:
  {endpoint_name}/{crypto.randomUUID()}/{original_filename}
- Use @aws-sdk/s3-presigned-post's createPresignedPost to generate a
  presigned POST with:
  - Conditions enforcing content-length-range: [1, MAX_UPLOAD_BYTES]
    (the 1-byte minimum replaces the old explicit zero-byte-file check
    at the policy level — but ALSO keep an explicit zero-byte check in
    finalizeUpload as defense in depth, since policy enforcement and
    application logic can drift)
  - A short expiry (e.g. 5 minutes — define as a named constant)
  - Scoped to exactly the generated key (no wildcard/prefix matching)
- Return the presigned POST fields/URL and the generated key to the
  client.

SERVER ACTION 2 — finalizeUpload(endpointName, key)
- Re-verify the endpoint still exists.
- Stream the object from SeaweedFS via GetObjectCommand (do not buffer
  the full object into memory — pipe the S3 stream into the streaming
  CSV parser).
- Run all Step 0/0.1 validation rules against the streamed content:
  zero-byte check, parse errors, empty/whitespace/duplicate headers,
  id_field-in-header check, encoding check. Short-circuit and stop
  reading as soon as a rule fails (e.g. header-only checks don't need
  to read the whole file).
- On ANY validation failure: issue a DeleteObjectCommand to remove the
  now-invalid object from the bucket, then return the specific
  validation error to the client (same error messages/classes as
  Step 0.1 — validation error vs infra error distinction still applies:
  a failed DeleteObjectCommand itself is an infra error, log it, but
  still return the original validation error to the user since that's
  the actionable one).
- On success: return a success result. This is what triggers the
  existing success banner UX — still no separate confirmation page,
  still no job ID.
- Infra error handling: if the GetObjectCommand itself fails (object
  not found — e.g. upload never actually completed, or SeaweedFS
  error), surface the infra-error banner, not a validation error.

REMOVED FROM THIS SLICE
- The old uploadVersion Server Action that received multipart FormData
  directly is replaced by the two actions above. Remove it entirely
  rather than leaving dead code.
- The <form action={uploadVersion}> pattern is replaced by the client
  script calling the two Server Actions in sequence.

NON-GOALS (still out of scope)
- No resumable/chunked upload (if a large upload fails partway, the
  user re-selects the file and starts over — no resume-from-byte-N).
- No upload progress reporting beyond the browser's native upload
  progress event (no percentage-accurate custom progress bar beyond
  what <progress> + XHR's onprogress gives for free).
- No client-side pre-validation of CSV content (extension check only,
  client-side, purely for UX — server remains the source of truth).
- Still no version history/listing, no endpoint edit/delete.

CONFIG — new env vars / constants
- MAX_UPLOAD_BYTES: unchanged value, now used in the presigned POST
  policy instead of an in-code size check.
- PRESIGNED_URL_EXPIRY_SECONDS: new named constant (e.g. 300).

TESTS
Extend the existing suite with:
- successful direct upload + finalize of a valid CSV, confirming the
  object exists in SeaweedFS at the expected key after success
- oversized file rejected by the presigned POST policy itself (assert
  the browser-side POST fails before finalize is ever called)
- zero-byte file: confirm rejected in finalizeUpload even if it somehow
  passed the policy's 1-byte minimum (defense-in-depth check)
- invalid CSV (bad header) uploaded successfully to S3, then confirm
  finalizeUpload deletes the object and returns the validation error
  (i.e. explicitly assert the object is GONE from the bucket after a
  validation failure — this is the most important new test, since it's
  verifying the compensating-action cleanup actually happens)
- finalizeUpload called with a key that was never actually uploaded
  (simulates a browser-side POST failure that the client didn't
  properly surface) — confirm infra-error path, not a crash
- endpoint deleted between getUploadUrl and finalizeUpload (simulate,
  even though delete doesn't exist yet as a feature) — confirm clear
  error rather than a crash

DELIVER
- Update the README: describe the new two-step upload flow and why
  validation now happens post-storage with deletion-on-failure, so a
  reviewer understands the architecture shift from Step 0 without
  reading the diff first.