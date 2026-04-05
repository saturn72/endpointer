# 009 — Web: Subscriber — Discover + Subscribe

## Context
Implements the subscriber-facing flows: discovering public endpoints, requesting subscriptions, and viewing subscription status.

## Depends on
- `.prompts/web/008-publisher-approvals.md`

## Goal
Subscriber can browse all published endpoints, request access to any endpoint, and track the status of their requests (pending / approved / rejected).

## Tasks
1. Discovery page — browse all publishers and their endpoints
2. `requestSubscriptionAction` server action
3. My subscriptions page — list all subscriptions with status
4. Subscription detail page — shows endpoint info + status

## Pages + routes
```
/dashboard/subscriptions/discover       — browse all public endpoints
/dashboard/subscriptions                — my subscriptions list
/dashboard/subscriptions/[subId]        — subscription detail
```

## Discovery page content
```
[Search publishers or endpoints...]  (client-side filter, no API call)

Publisher: Acme Widgets  (acme-widgets)
  ├── prices        endpointer.io/acme-widgets/prices        [Request Access]
  └── inventory     endpointer.io/acme-widgets/inventory     [Request Access]

Publisher: Beta Corp  (beta-corp)
  └── catalog       endpointer.io/beta-corp/catalog          [Request Access]

States per endpoint button:
  [Request Access]    — not yet subscribed
  [Pending...]        — request submitted, awaiting approval (disabled)
  [Subscribed ✓]      — approved (disabled, link to /subscriptions/{subId})
  [Rejected]          — rejected (show again as requestable after 7 days — post-MVP)
```

## requestSubscriptionAction
```typescript
requestSubscriptionAction(endpointId: string):
  1. Verify current user has subscriber role
  2. Check for existing subscription (any status) — return error if exists
  3. INSERT into subscriptions (subscriber_id, endpoint_id, status='pending')
  4. revalidatePath('/dashboard/subscriptions/discover')
  5. revalidatePath('/dashboard/subscriptions')
```

## My subscriptions page content
```
My Subscriptions

Status filter: [All] [Pending] [Approved] [Rejected]

Endpoint                              Publisher        Status    Since
endpointer.io/acme-widgets/prices     Acme Widgets     Approved  3 days ago
endpointer.io/beta-corp/catalog       Beta Corp        Pending   1 hour ago
endpointer.io/old-co/inventory        Old Co           Rejected  1 week ago

Empty state: "No subscriptions yet. Discover endpoints to get started."
```

## Subscription detail page content
```
Subscription: acme-widgets / prices
Status: Approved
Requested: 3 days ago
Approved: 2 days ago

Endpoint URL: endpointer.io/acme-widgets/prices
Current version: 1.0.22

[Manage Credentials →]   (links to credentials page — next prompt)
```

## Data queries
```typescript
// Discovery: all endpoints with subscription status for current subscriber
SELECT
  p.name AS publisher_name, p.display_name,
  e.id, e.name AS endpoint_name,
  s.status AS my_status, s.id AS subscription_id
FROM endpoints e
JOIN publishers p ON e.publisher_id = p.id
LEFT JOIN subscriptions s ON s.endpoint_id = e.id AND s.subscriber_id = currentSubscriberId
ORDER BY p.name, e.name
```

## Acceptance criteria
- [ ] Discovery page lists all publishers and their endpoints
- [ ] Endpoint already subscribed shows correct status button state
- [ ] Request access → subscription record created with status='pending'
- [ ] Cannot request access to same endpoint twice
- [ ] My subscriptions list shows all subscriptions with correct status
- [ ] Status filter works client-side
- [ ] Subscription detail shows correct endpoint info
- [ ] Non-subscriber redirected away from all subscription routes
- [ ] Zero TypeScript errors

## Output files
- `apps/web/src/app/(dashboard)/subscriptions/discover/page.tsx`
- `apps/web/src/app/(dashboard)/subscriptions/discover/actions.ts`
- `apps/web/src/app/(dashboard)/subscriptions/page.tsx`
- `apps/web/src/app/(dashboard)/subscriptions/[subId]/page.tsx`
- `apps/web/src/components/subscriptions/endpoint-card.tsx`
- `apps/web/src/components/subscriptions/subscription-status-badge.tsx`

## Notes
- Guard all subscription routes with `requireSubscriber()` from `src/lib/auth.ts`
- Discovery page: fetch all data server-side, pass to client component for filter toggle only
- Client-side search/filter: simple `useState` + `.filter()` — no API call needed at MVP scale
- Publisher can see their own endpoints in discovery (they may also be a subscriber)
- Post-MVP: pagination, search API, rejected subscription re-request after cooldown
