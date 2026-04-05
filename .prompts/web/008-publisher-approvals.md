# 008 — Web: Publisher — Approvals + Usage

## Context
Implements the publisher's governance flows: reviewing and approving/rejecting subscriber requests, and viewing usage counts per endpoint.

## Depends on
- `.prompts/web/007-publisher-upload.md`

## Goal
Publisher can see all pending subscription requests across their endpoints, approve or reject them, and view request counts per subscriber per endpoint.

## Tasks
1. Approvals list page — all pending requests across all publisher endpoints
2. `approveSubscriptionAction` server action
3. `rejectSubscriptionAction` server action
4. Usage page — request counts per endpoint, broken down by subscriber

## Pages + routes
```
/dashboard/feeds/approvals          — all pending requests
/dashboard/feeds/[feedId]/usage     — usage for a specific datafeed's endpoints
```

## Approvals page content
```
Pending Approvals (3)

[Subscriber email]  requested access to  [Endpoint URL]  [2 hours ago]
[Approve]  [Reject]

subscriber@example.com  →  endpointer.io/acme/prices  (3 days ago)
[Approve]  [Reject]

Empty state: "No pending approval requests."
```

## Approve/reject actions
```typescript
approveSubscriptionAction(subscriptionId: string):
  1. Verify subscription belongs to current publisher (security check)
  2. UPDATE subscriptions SET status='approved', updated_at=now() WHERE id=subscriptionId
  3. revalidatePath('/dashboard/feeds/approvals')

rejectSubscriptionAction(subscriptionId: string):
  1. Verify subscription belongs to current publisher (security check)
  2. UPDATE subscriptions SET status='rejected', updated_at=now() WHERE id=subscriptionId
  3. revalidatePath('/dashboard/feeds/approvals')
```

## Usage page content
```
Datafeed: {name}

Endpoint: prices  (endpointer.io/acme/prices)
Total requests: 1,204

Subscriber                  Requests
subscriber1@example.com     892
subscriber2@example.com     312

Endpoint: inventory  (endpointer.io/acme/inventory)
Total requests: 445

Subscriber                  Requests
subscriber1@example.com     445

[Data provided by /internal/usage/endpoint/{endpointId} from apps/api]
```

## Usage data fetch
- Call `apps/api` internal endpoint: `GET /internal/usage/endpoint/{endpointId}`
- Use `fetch()` with `INTERNAL_API_URL` env var
- Map `subscriberId` (Clerk user ID) to email via Clerk `clerkClient().users.getUser()`
- Cache: `next: { revalidate: 60 }` — refresh every 60 seconds

## Security rules
- Publisher can only approve/reject subscriptions for their own endpoints
- Verify `endpoint.publisher_id === currentPublisher.id` before any mutation
- Usage page only shows data for current publisher's endpoints

## Acceptance criteria
- [ ] Approvals page lists all pending requests for current publisher
- [ ] Approve action → subscription status = 'approved', removed from pending list
- [ ] Reject action → subscription status = 'rejected', removed from pending list
- [ ] Publisher cannot approve subscriptions for other publishers' endpoints (returns 403)
- [ ] Usage page shows correct total per endpoint
- [ ] Usage page breaks down by subscriber with email
- [ ] Empty approvals state renders correctly
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/feeds/approvals/page.tsx`
- `apps/web/src/app/(dashboard)/feeds/approvals/actions.ts`
- `apps/web/src/app/(dashboard)/feeds/[feedId]/usage/page.tsx`
- `apps/web/src/env.ts` (updated — add INTERNAL_API_URL)
- `apps/web/.env.example` (updated — add INTERNAL_API_URL=http://localhost:3001)

## Notes
- Home page "Pending approvals: N" badge (from prompt 005) is now powered by real data — update that query
- Sidebar "Approvals" link should show a count badge when pending > 0
- Do not paginate in MVP — show all records
- Post-MVP: real-time approval notifications via push (Ntfy)
