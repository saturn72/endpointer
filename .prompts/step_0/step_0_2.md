# Step 0 — Sub-step 2: UI Extension & Pico → shadcn/ui Migration

## Why this changes an earlier decision

`step_0_1` locked in Pico.css (classless, CDN-only) for a good reason at the
time: the UI was two plain forms. Now we want a persistent nav shell, icons,
and hover/transition effects, plus tighter control over type scale — Pico has
no icon system and no utility classes to reach for, so it can't do this
without turning into hand-rolled custom CSS anyway. shadcn/ui + Tailwind is
the right tool for that job, and it's worth paying that setup cost now, before
more pages exist on top of Pico.

## Decisions for this slice

- Replace Pico.css with **Tailwind CSS + shadcn/ui** (components installed
  into the repo via the shadcn CLI, not a CDN link — this is normal for
  Tailwind/shadcn and fine since Next.js already has its own build step).
- Icons: **lucide-react** (the standard companion library for shadcn/ui).
- Keep pages as Server Components wherever possible (data fetching, forms via
  Server Actions — unchanged from `step_0_1`). The **only** exception allowed
  is the nav shell itself (sidebar/topbar), which may be a small Client
  Component if needed for active-route highlighting or a mobile nav toggle —
  scope this exception narrowly, don't let it spread to the page content.
- Typography: reduce base font size and heading scale from Pico's defaults —
  target a dense, dashboard-appropriate scale (e.g. base `text-sm`, headings
  no larger than `text-xl`/`text-2xl`), not marketing-page-sized type.
- Restructure navigation: split the current single `/` page into a proper
  **Dashboard** landing page and a separate **Endpoints** management page, so
  there are two real nav destinations (matching "admin dashboard alike").

## The Prompt

```
Migrate this Next.js app's styling from Pico.css to Tailwind CSS + shadcn/ui,
add lucide-react icons, and restructure the UI into a small admin-dashboard
shell with persistent navigation. Do not change any Server Action logic,
validation rules, MongoDB schema, or S3 upload behavior from step_0_1 — this
is a UI/styling/navigation change only.

1. TOOLING MIGRATION
   - Remove the Pico.css `<link>` from the root layout.
   - Set up Tailwind CSS for this Next.js project (App Router-compatible
     config).
   - Run the shadcn/ui init flow to scaffold `components.json`, the Tailwind
     theme tokens, and `src/dashboard`'s shadcn component directory
     (typically `components/ui/`).
   - Install `lucide-react`.
   - Install and configure whichever shadcn components are needed for this
     UI: Button, Card, Input, Label, Alert (replaces Pico's `<mark>`/`<ins>`
     success/error banners), Badge (for showing whether an endpoint has an
     id_field configured), and a Sidebar (or NavigationMenu, whichever the
     current shadcn registry offers as the standard nav primitive) for the
     persistent shell.

2. NAVIGATION SHELL
   - Add a persistent left sidebar (or top nav bar if sidebar isn't a clean
     fit — use your judgment on whichever shadcn primitive gives a cleaner
     result) present on every page, with exactly two links for now:
       - "Dashboard" -> `/`  (icon: e.g. `LayoutDashboard` from lucide-react)
       - "Endpoints"  -> `/endpoints` (icon: e.g. `ListTree` or `Database`)
   - Highlight the active link based on the current route.
   - Add hover/transition effects on nav items and buttons (e.g. background
     color transition on hover, subtle scale or shadow on interactive cards)
     using Tailwind's transition utilities — keep these subtle, this is an
     internal admin tool, not a marketing site.
   - If any part of the nav shell needs interactivity (active-link
     highlighting via a hook, mobile toggle, etc.), isolate that in its own
     small Client Component; everything else stays a Server Component.

3. PAGE RESTRUCTURE
   - `/` — Dashboard (new)
     - Server Component. Simple overview: a welcome heading, and a summary
       card showing the total count of endpoints (query MongoDB for a
       count), with a button/link into `/endpoints`.
   - `/endpoints` — Endpoint management (was the old `/` content)
     - Server Component. Same data and Server Action (`createEndpoint`) as
       before, just moved here and re-skinned with shadcn Card/Button/Input
       components instead of plain Pico form elements. List endpoints as
       Cards (name, id_field badge or "none configured", created_at), each
       linking to `/endpoints/{name}`, with an icon per card (e.g.
       `Database` or `FileSpreadsheet`).
   - `/endpoints/[name]` — Endpoint detail + upload (unchanged logic)
     - Re-skin with shadcn components: Card for endpoint info, Button with an
       upload icon (e.g. `Upload` from lucide-react) for the submit action,
       Alert component for the success/error states instead of Pico's
       `<mark>`/`<ins>`.

4. TYPOGRAPHY
   - Set a base font size appropriate to a dense dashboard UI (not Pico's
     larger classless defaults). Establish a small, consistent type scale via
     Tailwind classes (e.g. body text `text-sm`, section headings `text-lg`
     or `text-xl` font-semibold, page titles `text-2xl` font-bold at most) and
     apply it consistently across all three pages — don't leave any
     default-browser-sized headings behind from the Pico migration.

5. UPDATE COPILOT INSTRUCTIONS (IMPORTANT — do not skip)
   - Edit `.github/instructions/nextjs.instructions.md`:
     - Remove the Pico.css mandate and the "no Tailwind/Bootstrap/other CSS
       framework" restriction.
     - Replace with: this project uses Tailwind CSS + shadcn/ui; new UI work
       should use existing shadcn components from `components/ui/` where one
       fits, add new ones via the shadcn CLI rather than hand-rolling
       equivalents, and use lucide-react for icons (don't mix in another icon
       library).
     - Keep the existing rules that still apply: Server Components + Server
       Actions as the default, native `mongodb` driver (no ORM), no
       abstraction layer over `@aws-sdk/client-s3`, and the note that Client
       Components are an intentional narrow exception for nav-shell
       interactivity only, not a general green light for client-side state.
   - Add a short note to `.github/copilot-instructions.md`'s history/decisions
     pointer (or `.docs/decisions/`, whichever exists per step_0_0) recording
     that styling moved from Pico to Tailwind/shadcn and why, so a future
     agent doesn't get confused seeing both mentioned across older prompt
     files.

NON-GOALS
- No dark mode / theme toggle yet.
- No new pages beyond the three above.
- No changes to validation rules, the Mongo schema, or the S3 upload
  mechanism — if you find yourself touching `uploadVersion` or
  `createEndpoint`'s logic (not their markup), stop, that's out of scope here.
- No component library other than shadcn/ui, no icon library other than
  lucide-react.

VALIDATION
- All three pages render with the new shell, correct active-nav highlighting,
  and consistent type scale.
- Re-run the integration tests from step_0_1 unchanged — they test behavior,
  not markup, and should still pass without modification.
```

## Open note for next discussion

Once this is reviewed/merged, we're back to **Capability 2: Conversion
service** (`step_0_3` in the new numbering) — Go, subscribes to `raw-uploads`
via SeaweedFS's `SubscribeMetadata` gRPC stream, converts CSV → JSON, writes to
`converted-feeds`. That's also when `.github/instructions/golang.instructions.md`
gets created. Let me know if you want to discuss that now or review this UI
prompt first.
