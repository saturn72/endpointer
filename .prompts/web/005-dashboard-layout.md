# 005 — Web: Dashboard Layout + Role-Aware Navigation

## Context
Implements the unified dashboard shell — sidebar navigation that adapts based on the user's roles (publisher / subscriber / both). This layout wraps all dashboard pages.

## Depends on
- `.prompts/web/004-clerk-auth.md`

## Goal
A responsive dashboard layout with a role-aware sidebar, home overview page with activity summary, and consistent page shell used by all subsequent dashboard prompts.

## Tasks
1. Implement `(dashboard)/layout.tsx` — sidebar + main content area
2. Implement `Sidebar` component — role-aware nav links
3. Implement `(dashboard)/home/page.tsx` — activity overview
4. Implement `UserRoleBadge` component — shows active roles in sidebar header
5. Implement `DashboardHeader` component — page title + user menu (Clerk `<UserButton>`)

## Sidebar navigation structure
```
[Logo + "Endpointer"]
[UserRoleBadge — Publisher · Subscriber]

Home                          (always visible)

── My Feeds ──                (publisher only)
  Datafeeds
  Approvals
  Usage

── My Subscriptions ──        (subscriber only)
  Discover
  My Subscriptions
  Credentials
  Usage

──────────────────
Account Settings
[Clerk UserButton]
```

## Home page content
```
Publisher summary card (if publisher):
  - Active datafeeds: N
  - Active endpoints: N
  - Pending approvals: N
  - Last ingestion: {relative time}

Subscriber summary card (if subscriber):
  - Active subscriptions: N
  - Pending requests: N
  - Last pull: {relative time}

Recent activity list (last 10 events, both roles combined):
  - "Version 1.0.22 published to Prices endpoint" (publisher)
  - "Subscription approved for Acme Widgets / Prices" (subscriber)
  - "New subscription request from subscriber@email.com" (publisher)
```

## Component design rules
- Tailwind CSS only — no component library in MVP
- Sidebar: fixed width 240px on desktop, collapsible on mobile
- Active nav link: subtle left border accent, slightly darker background
- Section headers (My Feeds, My Subscriptions): uppercase 11px muted text
- Role badge: small pill per role (e.g. grey "Publisher", grey "Subscriber")
- Empty states: centered icon + message + CTA button

## Server data fetching for home page
```typescript
// Parallel fetch — all server-side
const [publisherStats, subscriberStats, recentActivity] = await Promise.all([
  isPublisher ? getPublisherStats(publisherId) : null,
  isSubscriber ? getSubscriberStats(subscriberId) : null,
  getRecentActivity(userId)
])
```

## Acceptance criteria
- [ ] Dashboard layout renders with sidebar for publisher-only user (My Feeds visible, My Subscriptions hidden)
- [ ] Dashboard layout renders with sidebar for subscriber-only user (My Subscriptions visible, My Feeds hidden)
- [ ] Dashboard layout renders both sections for publisher+subscriber user
- [ ] Home page shows correct stats per role
- [ ] Active nav link is visually distinct
- [ ] `<UserButton>` renders in sidebar footer
- [ ] Layout is responsive — sidebar collapses on mobile
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/home/page.tsx`
- `apps/web/src/app/(dashboard)/home/actions.ts`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/dashboard-header.tsx`
- `apps/web/src/components/layout/user-role-badge.tsx`
- `apps/web/src/components/ui/empty-state.tsx`
- `apps/web/src/components/ui/stat-card.tsx`

## Notes
- All data fetching in server components — no `useEffect` or client-side fetching for stats
- Activity feed is a simple DB query — no event sourcing in MVP
- Mobile sidebar: use CSS `translate-x` toggle, not a portal or dialog
- Do not use `next/dynamic` — keep the layout fully server-rendered
- Sidebar active state: use `usePathname()` in a client component wrapper around nav links only
