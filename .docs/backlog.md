# Backlog

Status: `[ ]` todo, `[~]` in progress, `[x]` done.

> **Archived snapshot (2026-10-11):** GitHub Issues are now the source of truth
> for implementation tracking. The unchecked entries below preserve the
> historical backlog but must not be started directly. Open a new prioritized
> GitHub issue before implementing any item.

## Identity (Casdoor)

### Setup and sign-in
- [x] Run Casdoor locally via docker-compose (OIDC, port 8000)
- [x] Dashboard sign-in via Auth.js
- [x] Sign-up form: username, email, password and confirm; unique username and email (dedicated `endpointer` organization)
- [ ] Verify the login round trip in a browser (`session.user.id`, username) and review the other uncommitted Casdoor changes in the working tree
- [ ] Replace the Casdoor logo and branding on the auth screen with FeedHub Admin

### Verification and MFA
- [ ] Verify email address: configure an email provider in Casdoor, set the Email sign-up rule back to verified (currently `No verification`), and show the verified state on the profile
- [ ] Add a phone number to the user profile; once set it must be verified with a code received by SMS (needs an SMS provider)
- [ ] Phone OTP login: pick an SMS provider, add it in Casdoor, enable "Verification code" and a required "Phone" sign-up item on the application (use a Custom HTTP stub for local testing)
- [ ] MFA: enable TOTP and SMS as a second factor in Casdoor and decide whether it is optional or enforced per user/organization

### Profile
- [x] Profile page, header avatar and sign-out (password, phone and MFA are managed on Casdoor's account page)
- [ ] Edit the user's identity profile from the dashboard, limited by the identity-management rules (e.g. changing email or phone requires re-verification, password changes need the current password, username and user ID are immutable, organization is not editable); decide whether this goes through the Casdoor API or stays on Casdoor's account page

## Datafeeds (see ADR 002, `.prompts/step_2/datafeeds-menu.md`)

### Phase 1 (current)
- [x] Resolve ADR 002 open questions (service name, upload ownership, read-path resolution)
- [ ] Generate Stitch screens for Datafeeds (list, create, detail); current UI is implemented by convention
- [x] Create endpoint from the datafeed creation screen: "Create endpoint" option in the form (default on, endpoint name defaults to datafeed name); on successful datafeed creation the endpoint is created automatically; if the endpoint step fails the datafeed is kept and the user can retry
- [x] Schema, indexes and idempotent migration: existing endpoints -> auto-created `static-file` datafeeds
- [ ] `src/datafeed-manager-service` (definitions + adapter execution) — dashboard currently owns definitions/actions; create service before production
- [x] Re-key `versions` and the backend services from `endpoint_name` to `datafeed_id`
- [x] Public URLs `<domain>/<user_name>/<endpoint_name>` and `<domain>/<user_name>/<endpoint_name>/version/<major>.<minor>` in `datafeed-service` (user -> endpoint -> datafeed -> version); strict version regex, 404 otherwise
- [x] Retire the legacy `/{endpoint_name}` route in `datafeed-service` (no alias) and update docs/tests/README
- [x] Presigned upload URL generation in the dashboard server action: ownership check, server-chosen key `<datafeed_id>/<uuid>/<filename>`, POST policy, 5 min expiry, size/type limits
- [ ] Move presigned upload URL issuance from the dashboard action to `datafeed-manager-service` before production
- [ ] Verify SeaweedFS presigned POST policy support (content-length-range); fall back to signed headers + pipeline size check
- [ ] Dedicated write-only S3 identity for upload signing, scoped to `raw-uploads`
- [ ] `uploads` collection (pending/processed/rejected/expired) written when a presigned URL is issued; updated by the pipeline when a version is created or rejected
- [ ] Orphan sweeper in `datafeed-manager-service`: daily, delete `pending` uploads older than 24h and unrecorded objects older than 24h; idempotent, logs counts
- [ ] Deleting a datafeed removes its versions and raw objects
- [ ] `raw-uploads` bucket: private, CORS limited to dashboard origin
- [ ] conversion-service re-validates format/size of browser-uploaded objects and deletes rejected ones
- [x] Dashboard: browser uploads to the presigned URL (replace server-side upload action)
- [ ] Update Next.js and Go instructions and `.github/copilot-instructions.md` (build/run) when the new service and flow land
- [x] Dashboard: Datafeeds menu, create/list/detail, upload to datafeed, inline help text
- [ ] Datafeed edit and delete, including version and raw-object cleanup
- [x] Endpoint form: choose one datafeed (latest policy); pinned-version read support exists
- [ ] Endpoint form: allow selecting latest or a pinned datafeed version

### Next phases
- [ ] Cron-download adapter (fetch URL on a schedule, convert CSV/JSON/XML)
- [ ] Database adapter (SQL/NoSQL table or collection)
- [ ] Source credentials/secrets storage (DB strings, auth headers); depends on Secret Manager item
- [ ] Multiple datafeeds per endpoint
- [ ] Endpoint transformations: field subset, rename, join across datafeeds
- [ ] Dedicated Help/Guide page (if inline help proves insufficient)

## Multi-tenancy and data scoping

- [x] Per-user endpoint names in the dashboard (`owner_id`, unique on `(owner_id, name)`)
- [ ] Migrate pre-auth endpoints (no `owner_id`) to a user
- [ ] Per-user scoping in backend services (S3 keys, `versions`, datafeed `/{endpoint_name}`)
- [ ] Per-customer Casdoor organizations (multi-tenant), if needed

## Infrastructure and ops

- [ ] Monitor SeaweedFS storage capacity (live volume is 20 GiB on one host)
- [ ] Firebase/GCS backup job and restore test (deferred until things stabilize)
- [ ] Switch the Nginx admin upstream to service DNS (currently ClusterIP `10.43.126.158`)
- [ ] Commit the k8s manifests (on `feature/k8s-seaweedfs-manifests`, uncommitted) and define the release flow: release a version, then clone it to `~/opt/k8s/endpointer`
- [ ] Decide the fate of the stopped Docker apps (Dify, Evolution API, n8n, RabbitMQ); their Nginx sites return 502 until restarted or removed
- [ ] Point the `saturn72.com` apex away from Odoo (Odoo may be deleted)
- [ ] Document the dev-to-release workflow in the shared `~/opt/k8s/instructions.md` once settled

## Secrets and security

- [ ] Integrate GCP Secret Manager
- [ ] Issue per-app S3 credentials (only the admin identity exists; save its key in a password manager)
- [ ] Review the tracked `.deploy/.env` (committed in this repo, may contain secrets)
- [ ] Change the default Casdoor admin password (`built-in/admin` / `123`) before any non-local use

## Dashboard (UI gaps vs design)

- [ ] ID field warning as a blocking `AlertDialog` (Discard / Continue Upload)
- [ ] Public visibility column (`public_status` in `versions`)
- [ ] Upload detail: Download Source, Revert, Operator field
- [ ] Endpoint edit and delete
- [ ] Dashboard home: charts and recent activity
- [ ] Search/filter on endpoints and versions
- [ ] "View Data" link per version, not per endpoint

## Tech debt

- [x] Endpoint detail pagination buttons use `asChild`, which the Button type rejects
- [ ] Endpoint detail page has no try/catch around Mongo queries
- [ ] Format `$project` block in the version detail page
- [x] `stream-json/streamers/stream-array` type error in `formats/json.ts`
- [ ] Update Next.js instructions to allow client state in `NewEndpointSheet` and the Auth.js API route
