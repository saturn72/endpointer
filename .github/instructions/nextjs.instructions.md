---
applyTo: "src/dashboard/**"
---

# Next.js conventions — `src/dashboard`

## Routing & rendering

- **App Router only.** Every page is a Server Component by default.
- Use **Server Actions** (`'use server'`) for all mutations — no API routes
  unless a future prompt explicitly introduces one.
- Client Components (`'use client'`) are a narrow exception only when browser
  APIs or hooks are genuinely required. Currently permitted:
  - **`AppSidebar`** — active-route highlighting via `usePathname`
  - **`AutoUploadForm`** — auto-submit on file select + id-field warning
    `AlertDialog` (`useState`, `useTransition`, `useRef`)
  This is not a general allowance; do not add client-side state to page
  content beyond these two scopes.

## Styling

- **Tailwind CSS + shadcn/ui.** Use existing components from `src/components/ui/`
  where one fits; add new ones via `npx shadcn@latest add <component>` rather
  than hand-rolling equivalents.
- **lucide-react** for icons — do not mix in another icon library.
- No other CSS frameworks (no Bootstrap, no plain CSS files per component).

## Data access

- **Native `mongodb` driver** — no Mongoose, no ORM.
- **`@aws-sdk/client-s3` directly** — no abstraction class or wrapper around it;
  call `S3Client` / `PutObjectCommand` straight from the server action.

## Environment

- All config via `process.env` — Next.js loads `.env.local` natively; no
  custom config module needed.

## Design reference

- The UI is designed in **Stitch project `14388681312300072135`** ("FeedHub Admin Interface").
- Use the `mcp_stitch-proxy_*` tools with `projectId: "14388681312300072135"` to inspect
  screens, export HTML, and compare implementation against the reference design.
- Brand name: **FeedHub Admin**. Color system: primary teal `#005c55` / `#0f766e`,
  background `#f7faf8` (sage-tinted white), sidebar dark teal with white text.
