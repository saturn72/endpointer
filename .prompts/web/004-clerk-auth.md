# 004 — Web: Clerk Auth + Onboarding

## Context
Implements full Clerk authentication flow in `apps/web` — sign in, sign up, role selection onboarding, and middleware-based route protection. This prompt establishes the identity foundation for all subsequent dashboard prompts.

## Depends on
- `.prompts/web/003-project-scaffold.md`

## Goal
Complete auth flow: sign in/up via Clerk, role selection on first login (publisher / subscriber / both), role persisted to PostgreSQL and Clerk user metadata, all dashboard routes protected.

## Tasks
1. Implement Next.js middleware for route protection
2. Implement sign-in page (Clerk `<SignIn>` component)
3. Implement sign-up page (Clerk `<SignUp>` component)
4. Implement onboarding page — role selection after first sign-up
5. Create `onboardingAction` server action — saves role to DB + Clerk metadata
6. Create `getCurrentUser()` server utility — returns hydrated user with role from DB
7. Create `requirePublisher()` / `requireSubscriber()` — throw redirect if role missing

## Role model
A user can be publisher, subscriber, or both. Role stored in two places:
- PostgreSQL: `publishers` or `subscribers` table record (presence = has role)
- Clerk public metadata: `{ roles: ['publisher', 'subscriber'] }` — used for fast client-side nav

## Onboarding flow
```
User signs up → Clerk redirects to /onboarding
/onboarding:
  - Check if user already has roles (returning user) → redirect to /dashboard/home
  - Show role selection: "I want to publish datafeeds" / "I want to subscribe" / both
  - On submit → onboardingAction:
      1. Validate selection (at least one role required)
      2. If publisher: INSERT into publishers (clerk_user_id, name=null, display_name=null)
         name is set later in publisher profile setup
      3. If subscriber: INSERT into subscribers (clerk_user_id, email)
      4. Update Clerk public metadata: { roles: [...], onboardingComplete: true }
      5. Redirect to /dashboard/home
```

## Middleware config
```typescript
// Protect all routes under /dashboard and /onboarding
// Public: /, /sign-in, /sign-up, /api/health
// Also public: /{publisher_name}/{endpoint_name} — handled by apps/api, not apps/web
matcher: ['/((?!_next|api/health|sign-in|sign-up|$).*)']
```

## getCurrentUser() utility
```typescript
// src/lib/auth.ts
getCurrentUser(): Promise<{
  clerkUserId: string
  email: string
  isPublisher: boolean
  isSubscriber: boolean
  publisherId?: string   // DB id if publisher
  subscriberId?: string  // DB id if subscriber
  publisherName?: string // slug if set
}>
```

## Acceptance criteria
- [ ] Unauthenticated request to `/dashboard/home` redirects to `/sign-in`
- [ ] After sign-up → redirected to `/onboarding`
- [ ] Onboarding with publisher role → `publishers` record created in DB
- [ ] Onboarding with subscriber role → `subscribers` record created in DB
- [ ] Onboarding with both → both records created
- [ ] After onboarding → redirected to `/dashboard/home`
- [ ] Returning user skips onboarding
- [ ] Clerk public metadata updated with roles after onboarding
- [ ] `getCurrentUser()` returns correct `isPublisher` / `isSubscriber` flags
- [ ] `requirePublisher()` redirects non-publishers to `/dashboard/home`
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/middleware.ts`
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `apps/web/src/app/(auth)/onboarding/page.tsx`
- `apps/web/src/app/(auth)/onboarding/actions.ts`
- `apps/web/src/lib/auth.ts`

## Notes
- Clerk `publicMetadata` is set server-side via `clerkClient().users.updateUser()`
- Never store sensitive data in Clerk metadata — roles only
- `publisher.name` (URL slug) is null until publisher completes profile setup (next prompt)
- Use `redirect()` from `next/navigation` for server-side redirects in server actions
- Onboarding page must be server component — reads Clerk session server-side
