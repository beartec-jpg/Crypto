# Admin analytics (`/admin/analytics`)

Admin-only business dashboard: MRR/ARR, active paid, trial → paid, churn, DAU/WAU/MAU,
MRR movement, sign-up → trial → paid funnel, tier mix, AI cost per user with margin, CSV export.
All money is GBP, stored in pence.

## Pieces
| Piece | File |
| --- | --- |
| Migration (additive only) | `migrations/016_admin_analytics.sql` (`billing_events`, `subscription_snapshots_daily`, `auth_events`, indexes) |
| API (Vercel) | `api/admin/analytics.ts`, routed from `/api/admin/analytics/{summary,timeseries,tiers,ai-cost}` in `vercel.json` |
| API (local Express) | `server/routes.ts` `/api/admin/analytics/:view` (same query code) |
| Queries | `api/_lib/adminAnalytics.ts`; maths in `api/_lib/analyticsMetrics.ts` |
| Stripe → `billing_events` | `api/stripe/webhook.ts` calls `recordStripeEvent` (deduped on event id, never blocks billing) |
| Clerk → `auth_events` | `api/clerk/webhook.ts` (Svix signature check, deduped on `svix-id`) |
| Daily rollup | `api/cron/rollup-analytics-daily.ts`, 00:15 UTC |
| Backfill | `npx tsx scripts/backfill-billing-events.ts [--days 90] [--dry-run]` |
| Page | `client/src/pages/AdminAnalytics.tsx` |

## Auth
Same rule as `api/crypto/admin-ai-usage.ts` and server `requireAdminAuth`: Clerk session whose email is
`beartec@beartec.uk` or ends in `@beartec.uk` (`api/_lib/adminAuth.ts`). Everyone else gets 403.
Like `/admin` and `/admin/users`, the page route is `InternalOnlyRoute` (not served on the public host).

## Setup
1. Run `migrations/016_admin_analytics.sql` on Neon.
2. Stripe webhook endpoint: also enable `customer.subscription.created`, `customer.subscription.trial_will_end`, `invoice.paid`.
3. Clerk: add a webhook to `/api/clerk/webhook` for `user.created`, `session.created`, `user.deleted`; set `CLERK_WEBHOOK_SECRET`.
4. Optional `USD_GBP_RATE` (default 0.79): `api_usage_log.estimated_cost` is USD.
5. Run the backfill once.

## Definitions
- Active user: at least one `analytics_events` row in the window (DAU 1 day, WAU 7, MAU 30, ending at `to`).
- MRR: sum of latest known state per subscription, Stripe price amounts normalised to monthly; `trialing` counts 0.
- Churn: subscriptions moving to canceled (from MRR > 0) in the period ÷ active paid at period start.
- Trial → paid: `trial_converted` ÷ `trial_started` events in the period.
- AI cost flag: AI cost over 50% of the user's monthly revenue.
