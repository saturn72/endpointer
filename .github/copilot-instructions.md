# Endpointer Platform

This is a SaaS platform that ingests datafeed files and converts them into
versioned JSON served over HTTP. It is built one capability at a time —
each capability lives in its own service under `src/`.

## Repository layout

| Directory | Purpose |
|---|---|
| `.prompts/` | Agent prompt specs driving each build step |
| `.docs/` | Architecture notes, decisions (ADRs), capability roadmap |
| `.deploy/` | Local/dev infrastructure (`docker-compose.yml`, `.env.example`) |
| `src/` | One subdirectory per component/service |
| `.github/` | Copilot custom instructions and CI (when added) |

**Naming rule:** any subdirectory of `src/` that is an API or background
service **must** end in `-service` (e.g. `src/conversion-service`). The UI
is not a background service — it lives at `src/dashboard`.

## Build & run

### `src/dashboard` (Next.js ingest UI)

```bash
# 1. Start infrastructure
docker compose -f .deploy/docker-compose.yml up -d

# 2. Install dependencies
cd src/dashboard && npm install

# 3. Existing data only: migrate endpoints to datafeeds (idempotent), then create indexes
npm run db:migrate
npm run db:init

# 4. Copy and fill in env vars
cp ../.deploy/.env.example .env.local  # then edit .env.local

# 5. Run dev server
npm run dev   # → http://localhost:3000
```

### `src/conversion-service` (Go CSV→JSON converter)

```bash
# Build binary
cd src/conversion-service
go build -o conversion-service ./cmd/conversion-service

# Run against the local docker-compose infrastructure
# (copy .deploy/.env.example to .env and fill in credentials first)
export S3_ENDPOINT=http://localhost:8333
export S3_ACCESS_KEY_ID=your-key
export S3_SECRET_ACCESS_KEY=your-secret
export WEBHOOK_ADDR=:8080
# Optional: forward converted-feeds events to a local versioning-service
export VERSIONING_WEBHOOK_URL=http://localhost:8081/webhook
go run ./cmd/conversion-service

# Or run the full stack via docker-compose:
docker compose -f .deploy/docker-compose.yml up --build
```

Unit tests:

```bash
cd src/conversion-service
go test ./...
go vet ./...
```

### `src/versioning-service` (Go JSON→version storer)

```bash
# Build binary
cd src/versioning-service
go build -o versioning-service ./cmd/versioning-service

# Run against the local docker-compose infrastructure
# (copy .deploy/.env.example to .env and fill in credentials first)
export S3_ENDPOINT=http://localhost:8333
export S3_ACCESS_KEY_ID=your-key
export S3_SECRET_ACCESS_KEY=your-secret
export MONGODB_URI=mongodb://localhost:27017
export MONGODB_DB=endpointer
export WEBHOOK_ADDR=:8081
go run ./cmd/versioning-service

# Or run the full stack via docker-compose:
docker compose -f .deploy/docker-compose.yml up --build
```

Unit tests:

```bash
cd src/versioning-service
go test ./...
go vet ./...
```

### `src/datafeed-service` (Go HTTP read API)

```bash
# Build binary
cd src/datafeed-service
go build -o datafeed-service ./cmd/datafeed-service

# Run against the local docker-compose infrastructure
# (copy .deploy/.env.example to .env and fill in credentials first)
export MONGODB_URI=mongodb://localhost:27017
export MONGODB_DB=endpointer
export PORT=8080
go run ./cmd/datafeed-service

# Or run the full stack via docker-compose:
docker compose -f .deploy/docker-compose.yml up --build
# datafeed-service is available at http://localhost:8082/{user_name}/{endpoint_name}
```

Unit tests:

```bash
cd src/datafeed-service
go test ./...
go vet ./...
```

Integration tests (requires a running MongoDB on MONGODB_URI):

```bash
cd src/datafeed-service
MONGODB_URI=mongodb://localhost:27017 go test -tags=integration ./internal/httpapi/ -v
```

Dashboard unit tests (need MongoDB): `MONGODB_URI=mongodb://localhost:27017 npm run test:unit`.
Playwright e2e (`npm test`) predates sign-in and cannot log in yet (see backlog).

## Domain model (in progress, step 2)

Datafeed (source, one adapter, versioned) and endpoint (public URL, one
datafeed in phase 1) are separate objects. Authoritative details are in
`.docs/decisions/002-datafeed-endpoint-domain-model.md` and the spec in
`.prompts/step_2/datafeeds-menu.md`; open work is in `.docs/backlog.md`.
Key rules:

- Public URLs: `<domain>/<user_name>/<endpoint_name>` and
  `.../version/<major>.<minor>`. The legacy `/{endpoint_name}` route is retired.
- New service `src/datafeed-manager-service` owns datafeed/endpoint definitions.
- Browsers upload directly to S3 with short-lived presigned URLs issued by the
  manager service; follow the "Upload security" rules in ADR 002.
- Only the `static-file` adapter exists in phase 1.

## Project philosophy

- Add infrastructure **only** when a concrete requirement calls for it.
- Do **not** add authentication, caching, queues, or other infrastructure
  speculatively — wait until a capability's stated scope requires it.
- Do **not** build ahead of the current capability's scope.

## GitHub issue workflow

- At the start of every implementation session, inspect the open GitHub issues
  and select work in this order: the current active issue, then the lowest
  open priority (`P0` before `P1` before `P2`). Priority is recorded in the
  issue title and must not be inferred from file order or personal preference.
- Do not start a lower-priority issue while a higher-priority issue is open,
  unless the higher-priority issue is explicitly blocked. Record the blocker
  and the chosen issue in the session update.
- Treat one issue as the active issue for the session. Continue its checklist
  from the last recorded state before selecting new work. A prompt file for a
  step is guidance, not permission to skip a higher-priority issue.
- Every implementation task must start from an open GitHub issue in
  `saturn72/endpointer`; use the issue number in the branch name and commit
  message when practical.
- Before editing, read the issue, its linked ADR/spec and the nearby code. State
  the issue's acceptance criteria and the smallest implementation slice.
- Keep one issue as the active implementation scope. Do not silently expand
  into other backlog items; create or reference a follow-up issue instead.
- After each meaningful slice, run the narrowest relevant tests, then the
  broader checks required by the affected service.
- Before finishing, update the issue checklist with completed work, test
  results and any remaining risk. Close the issue only when its acceptance
  criteria are met; otherwise leave it open with a concrete next step.
- When work changes the priority or scope, update both the GitHub issue and
  `.docs/backlog.md` in the same implementation slice. Do not leave a second,
  conflicting priority list in a prompt or local note.
- Branches should use `feature/issue-<number>-<short-name>` for features,
  `fix/issue-<number>-<short-name>` for fixes, and
  `chore/issue-<number>-<short-name>` for maintenance.

## Design reference

The dashboard UI (`src/dashboard`) is designed in **Stitch project `14388681312300072135`**
("FeedHub Admin Interface"). When working on UI tasks:

- Use the Stitch MCP server (configured in `~/.config/Code/User/mcp.json`) with
  `projectId: "14388681312300072135"` to read screens and export HTML.
- The MCP tools are accessible as `list_screens` / `get_screen` via the `stitch` server
  in VS Code. If those tools are unavailable, use the CLI directly:
  ```bash
  STITCH_API_KEY="<key-from-mcp.json>" npx --yes @_davideast/stitch-mcp tool list_screens \
    -d '{"projectId":"14388681312300072135"}' -o json
  STITCH_API_KEY="<key-from-mcp.json>" npx --yes @_davideast/stitch-mcp tool get_screen \
    -d '{"name":"projects/14388681312300072135/screens/<screenId>","projectId":"14388681312300072135","screenId":"<screenId>"}' -o json
  ```
- Brand name: **FeedHub Admin**. Primary teal `#005c55` / `#0f766e`,
  background `#f7faf8`, sidebar dark teal with white text.

### Screen catalog (project `14388681312300072135`)

| Screen title | Screen ID | Route | Status |
|---|---|---|---|
| Dashboard | `6b22af70a48343e39bf9b31dc40c03fb` | `/` | ✅ Implemented |
| Endpoints Management | `9d7fb97175414da59460ecc36c2f5587` | `/endpoints` | ✅ Implemented |
| Endpoint Detail - History First | `34cb105481b14907af94afbc74bf5926` | `/endpoints/[name]` | ✅ Implemented |
| Endpoint Detail & Upload | `ca3655b018874f4abc0a75b57e762e52` | `/endpoints/[name]` | ✅ Superseded by History First |
| Upload Detail View | `01b31a1ced2b4556a56104a15729bcd3` | `/endpoints/[name]/versions/[v]` | ✅ Implemented |
| ID Field Warning Dialog | `899ab3f66d2c408bacdc2087142daab0` | modal on `/endpoints/[name]` | ⚠️ Inline alert only — AlertDialog not yet implemented |
| Endpoint Detail with Public Status | `ee840292a0c541b085782bf14075e50d` | `/endpoints/[name]` | ⚠️ Public column exists but shows `—` (data model gap) |
| FeedHub Admin Console (mobile) | `663c78122803425d837516f901c3bd1d` | all routes | ✅ Responsive via Tailwind |

### Known gaps vs design
- **ID Field Warning Dialog** (`899ab3f6`): design shows a blocking `AlertDialog` when the
  upload file's headers do not contain the endpoint's declared `id_field`. Currently the form
  shows an inline `Alert` instead. An `AlertDialog` with "Discard" / "Continue Upload" actions
  is the intended UX.
- **Public visibility column** (`ee840292`): design shows per-version public/visibility status
  ("Public to all", "No", "A/B testing"). The `public_status` field does not yet exist in the
  `versions` collection — this is a future data-model capability.
- **Upload Detail page** (`01b31a1c`): design shows "Download Source" and "Revert" buttons plus
  an "Operator" field in Upload Details. These actions are not yet implemented.

## Stack-specific conventions

See `.github/instructions/` for per-component coding conventions that
GitHub Copilot applies automatically.

- `.github/instructions/nextjs.instructions.md` (`applyTo: src/dashboard/**`)
- `.github/instructions/golang.instructions.md` (`applyTo: src/*-service/**`)
