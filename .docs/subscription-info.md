# Subscription info

Source of truth for plans and limits. Values marked TBD are undecided.
No billing or enforcement is built until a backlog item says so.

## Plans

| Plan | Price | Status |
|---|---|---|
| Free | TBD | TBD |
| Paid tier(s) | TBD | TBD |

## Limits per plan (TBD)

| Limit | Where enforced | Free | Paid |
|---|---|---|---|
| Datafeeds per user | manager service | TBD | TBD |
| Endpoints per user | manager service | TBD | TBD |
| Max upload size | presigned URL (ADR 002) | TBD | TBD |
| Versions retained per datafeed | versioning-service | TBD | TBD |
| Total storage | manager service | TBD | TBD |
| Public requests per month / rate | datafeed-service | TBD | TBD |
| Adapters available | manager service | `static-file` | TBD |

## Open decisions

- Pricing model: per plan, usage-based, or both
- Whether limits apply per user or per organization
- Behavior on exceeding a limit: block, throttle, or warn
- Payment provider and billing flow
- Plan assignment: stored on the user profile vs. Casdoor
- Whether version retention deletes old versions or only hides them

## Constraints from other decisions

- Adapter availability is the natural gate for the cron and database adapters
  (ADR 002, next phases).
- Upload size and format limits are part of "Upload security" in ADR 002; plan
  limits must stay within those hard caps.
