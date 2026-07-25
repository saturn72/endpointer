# Step 0 — Sub-step 0: Project Structure & GitHub Copilot Setup

This prompt runs **before** any feature prompt. It establishes the repo skeleton
that every later capability (UI, conversion-service, versioning-service,
datafeed-service...) plugs into, and configures GitHub Copilot's official
customization mechanisms so it follows our conventions automatically from here
on. No feature code is written in this step — only structure, docs scaffolding,
and Copilot configuration.

## Naming/organization rules this prompt must enforce

1. All agent prompt specs live in `.prompts/`, named `step_<step_index>_<internal_index>.md`
   (e.g. `step_0_0.md`, `step_0_1.md`, `step_0_2.md`...). Existing prompt files
   must be renamed into this scheme, not left where they are.
2. Repo root contains only top-level *aspect* directories: `.prompts/`,
   `.docs/`, `.deploy/`, `src/`, `.github/` — no loose source files at root.
3. `src/` contains one subdirectory per service/component. Any subdirectory
   that is an API or background service **must** have a name ending in
   `-service` (e.g. `src/conversion-service`, `src/versioning-service`,
   `src/datafeed-service`). The UI is not a background service, so it does not
   get the suffix — it's `src/dashboard`.
4. Inside each `src/<component>` directory, the internal file/folder layout
   must follow the idiomatic convention of that component's own tech stack —
   not a house style imposed across all of them. Concretely for what exists or
   is imminent:
   - `src/dashboard` (Next.js/TypeScript): standard Next.js App Router layout
     (`app/`, `public/`, `next.config.ts`, etc.)
   - Any future Go service (`src/*-service`): idiomatic Go project layout
     (`cmd/`, `internal/`, `go.mod`, etc.)
   Do not invent a cross-language folder convention — defer to each
   ecosystem's own norm.
5. Only scaffold what is needed for capabilities that already exist or are the
   immediate next step. Do not pre-create empty directories for
   conversion-service/versioning-service/datafeed-service yet — they get
   created by their own prompts when those capabilities are actually built.

## The Prompt

```
Reorganize this repository's structure and set up GitHub Copilot custom
instructions. Do not add or change any feature/business logic — this is a
structure-and-tooling-only change.

1. RENAME AND RELOCATE EXISTING PROMPT FILES
   - Create a `.prompts/` directory at repo root if it doesn't exist.
   - Move any existing agent-prompt markdown files into `.prompts/`, renaming
     each to the pattern `step_<step_index>_<internal_index>.md` in the order
     they were authored (the project-structure prompt you are reading right
     now is step_0_0; the prior Next.js ingest UI prompt becomes step_0_1).
     Preserve file content exactly — this is a rename/move, not a rewrite.

2. ROOT DIRECTORY LAYOUT
   Create (if missing) these top-level directories, each with a short
   README.md stub explaining its purpose:
   - `.prompts/`   — agent prompt specs (see above)
   - `.docs/`      — architecture notes, decisions, and the capability
                     roadmap; for now just add a `.docs/README.md` stating
                     its purpose and a `.docs/decisions/` subfolder for future
                     ADR-style notes (leave empty apart from a `.gitkeep`)
   - `.deploy/`    — local/dev infrastructure wiring only what currently
                     exists: a `docker-compose.yml` defining the MongoDB and
                     SeaweedFS (S3 gateway mode) containers this repo's
                     current capability (the ingest UI) needs, plus an
                     `.env.example` listing the env vars the dashboard reads
                     (MONGODB_URI, MONGODB_DB, S3_ENDPOINT, S3_REGION,
                     S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_RAW_BUCKET).
                     Do not add services/containers for capabilities that
                     don't exist yet.
   - `src/`        — one subdirectory per component (see rule 3/4 above).
                     Move the existing Next.js ingest UI code into
                     `src/dashboard` if it isn't already there, preserving its
                     own idiomatic Next.js layout untouched.

3. GITHUB COPILOT CUSTOM INSTRUCTIONS
   Set these up per GitHub's supported mechanisms (repository-wide file +
   path-specific files with `applyTo` frontmatter — do not invent a different
   format):

   a. Create `.github/copilot-instructions.md` (repository-wide instructions,
      read for every request in this repo). Include, concisely:
      - One paragraph describing what this repo is: a SaaS that ingests
        datafeed files and converts them into versioned JSON served over
        HTTP, built one capability at a time.
      - The root layout rules from this prompt (`.prompts`, `.docs`,
        `.deploy`, `src`, and the `-service` suffix rule for backend
        components).
      - The cross-cutting project philosophy: infra/tooling is only added
        when a concrete requirement calls for it — do not add
        authentication, caching, queues, or other infrastructure
        speculatively; do not build ahead of the current capability's
        stated scope.
      - How to build/run/test whatever currently exists in `src/` (fill in
        real, verified commands — e.g. for `src/dashboard`: `npm install`,
        `npm run dev`, and how `.deploy/docker-compose.yml` provides its
        dependencies — actually run these commands as part of this task and
        correct the instructions if anything doesn't work as documented).
      - A pointer: "See `.github/instructions/` for stack-specific
        conventions that apply to individual components."

   b. Create `.github/instructions/nextjs.instructions.md` with frontmatter
      `applyTo: "src/dashboard/**"` covering: App Router + Server Components/
      Server Actions only (no client-side state library unless a future
      prompt introduces one), Pico.css via CDN only (no Tailwind/Bootstrap/
      other CSS framework), no ORM for MongoDB (native `mongodb` driver), no
      abstraction layer over `@aws-sdk/client-s3`.

   c. Do NOT create Go-specific or other stack-specific instruction files yet
      — there is no Go service in the repo. Note in
      `.github/copilot-instructions.md` that a matching
      `.github/instructions/golang.instructions.md` (applyTo:
      `src/*-service/**`) will be added when the first background service is
      created, so future agents know to expect one and don't skip adding it.

4. VALIDATION
   - After reorganizing, confirm `src/dashboard` still builds and runs
     against `.deploy/docker-compose.yml`'s services exactly as it did before
     this restructuring (this is a pure reorganization; nothing about the
     running application should change).
   - Update any relative import paths, Dockerfile paths, or scripts that
     referenced the old file locations.

NON-GOALS
- No new feature code, no new services, no new env vars beyond what the
  existing ingest UI already required.
- No Kubernetes manifests yet (that's a future `.deploy` addition once we're
  actually deploying to GKE, not before).
- No CI workflow files yet unless one already exists and needs path updates
  to match the new structure.
```

## Open note for next discussion

With structure and Copilot instructions in place, the next content prompt
(`step_0_2`) is **Capability 2: Conversion service** — a Go service under
`src/conversion-service` that subscribes to the `raw-uploads` bucket via
SeaweedFS's `SubscribeMetadata` gRPC stream and writes converted JSON to a
second bucket. That's also the point where `.github/instructions/golang.instructions.md`
gets created for real. Let me know if you want to discuss that implementation
now or review this structural prompt first.
