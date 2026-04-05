# 010 — Web: Subscriber — Credentials + Usage

## Context
Final subscriber flow: generating and managing OAuth2 client credentials used to authenticate feed pull requests, and viewing their own usage counts per endpoint.

## Depends on
- `.prompts/web/009-subscriber-discover.md`

## Goal
Approved subscriber can generate client credentials (client ID + secret), view a ready-to-use curl snippet, rotate credentials, and see their pull counts per endpoint.

## Tasks
1. Credentials page — generate, view, rotate client credentials per subscription
2. `generateCredentialsAction` server action — create Clerk OAuth2 client via Clerk API
3. `rotateCredentialsAction` server action — revoke old, create new
4. Subscriber usage page — my pull counts per endpoint

## Pages + routes
```
/dashboard/subscriptions/[subId]/credentials    — credential management
/dashboard/subscriptions/usage                  — my usage across all endpoints
```

## Credentials page content
```
Credentials: acme-widgets / prices
Status: Approved ✓

─── Client Credentials ───────────────────────

Client ID:      ep_live_abc123...          [Copy]
Client Secret:  ep_secret_xyz789...        [Copy]  ← shown ONCE on generation, then masked

[Regenerate credentials]  ← rotates credentials (confirm dialog)

─── How to use ───────────────────────────────

1. Get access token:
curl -X POST https://clerk.endpointer.io/oauth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=ep_live_abc123" \
  -d "client_secret=ep_secret_xyz789"

2. Pull the feed:
curl -H "Authorization: Bearer {access_token}" \
  "https://api.endpointer.io/acme-widgets/prices?format=csv"

──────────────────────────────────────────────

[No credentials generated yet]
[Generate Credentials]  ← first time only
```

## generateCredentialsAction
```typescript
generateCredentialsAction(subscriptionId: string):
  1. Verify subscription belongs to current subscriber
  2. Verify subscription status === 'approved'
  3. Check no existing credentials — one set per subscription in MVP
  4. Create Clerk OAuth2 application via Clerk API:
     clerkClient().oauthApplications.createOauthApplication({
       name: `endpointer-{subscriptionId}`,
       callbackUrl: 'https://endpointer.io/oauth/callback'
     })
  5. Store { subscriptionId, clerkOauthAppId, clientId } in DB (not the secret — shown once)
  6. Return { clientId, clientSecret } — secret shown ONCE, never stored
```

## rotateCredentialsAction
```typescript
rotateCredentialsAction(subscriptionId: string):
  1. Verify ownership
  2. Delete existing Clerk OAuth app
  3. Create new Clerk OAuth app
  4. Update DB record with new clerkOauthAppId and clientId
  5. Return new { clientId, clientSecret }
```

## Credentials DB table (add to packages/db schema)
```
subscription_credentials
  id                uuid PK default gen_random_uuid()
  subscription_id   uuid FK → subscriptions.id UNIQUE
  clerk_oauth_app_id text NOT NULL
  client_id         text NOT NULL
  created_at        timestamp default now()
  updated_at        timestamp default now()
```

## Subscriber usage page content
```
My Usage

Endpoint                              Total Pulls   Last Pull
acme-widgets / prices                 892           2 hours ago
beta-corp / catalog                   45            3 days ago

[Data from /internal/usage/endpoint/{endpointId} filtered to current subscriberId]
```

## Acceptance criteria
- [ ] Unapproved subscriber cannot generate credentials (returns error)
- [ ] Generate credentials → clientId + clientSecret displayed once
- [ ] After page refresh → secret is masked (••••••••), clientId visible
- [ ] Rotate credentials → old credentials invalidated, new ones shown
- [ ] curl snippets render correctly with actual clientId and endpoint URL
- [ ] Usage page shows correct pull counts for current subscriber only
- [ ] Subscriber cannot see other subscribers' credentials or usage
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/subscriptions/[subId]/credentials/page.tsx`
- `apps/web/src/app/(dashboard)/subscriptions/[subId]/credentials/actions.ts`
- `apps/web/src/app/(dashboard)/subscriptions/usage/page.tsx`
- `apps/web/src/components/subscriptions/credential-display.tsx`
- `apps/web/src/components/subscriptions/curl-snippet.tsx`
- `packages/db/src/schema/subscription-credentials.ts` (new table — run migration)
- `packages/db/migrations/0002_subscription_credentials.sql`

## Notes
- Client secret shown exactly once — use React state, clear on page navigation, never persist to DB
- `credential-display.tsx`: client component — manages copy-to-clipboard and secret reveal state
- `curl-snippet.tsx`: syntax-highlighted code block — use `<pre>` + Tailwind, no library needed
- Clerk OAuth app creation may differ per Clerk version — check Clerk docs for current API
- Post-MVP: multiple credential sets per subscription (team access), credential expiry, audit log
- Post-MVP: subscriber usage notifications ("you have used 80% of your monthly quota")

## This is the final MVP prompt
After this prompt, the full MVP is complete:
- ✓ Infrastructure (Docker Compose)
- ✓ Shared packages (types, DB schema)
- ✓ API app (NestJS feed delivery)
- ✓ Web app (Next.js unified dashboard)
  - ✓ Auth + onboarding
  - ✓ Dashboard layout
  - ✓ Publisher: profile, datafeeds, endpoints, upload, approvals, usage
  - ✓ Subscriber: discover, subscribe, credentials, usage
