# Auth and billing

Short story from **current in-repo code** (Clerk + Stripe + Postgres). Do not invent products beyond what the handlers and services implement.

## Authentication (Clerk)

**Client**

- `@clerk/clerk-react` in `client/src/main.tsx` — requires `VITE_CLERK_PUBLISHABLE_KEY`.
- Crypto app shell: `CryptoAuthGate` / `ProductionAuthGate`, hooks `useCryptoAuth`, `useAuth`, `useRequireAuth`.
- Login UI: `client/src/pages/CryptoLogin.tsx`.
- API helper: `client/src/lib/apiAuth.ts` attaches the Clerk session Bearer token to API calls.

**Server / API**

- Production Express middleware `requireCryptoAuth` in `server/routes.ts`: expects `Authorization: Bearer <Clerk session JWT>`, verifies with `@clerk/backend` `verifyToken` using `CLERK_SECRET_KEY`, loads user via `clerk.users.getUser`.
- Non-production: open/dev user (optional `x-dev-admin-mode: true` → configured admin Clerk user id).
- Vercel-style handlers under `api/crypto/**` and `api/users/**` duplicate the same Bearer + `CLERK_SECRET_KEY` pattern (local `verifyAuth` helpers).

**Roles / admin**

- Tier capabilities live on the subscription record (see below), not a separate RBAC module.
- Admin-ish paths exist (e.g. `api/crypto/admin-ai-usage.ts`, `DEV_ADMIN_CLERK_USER_ID` / admin email checks in client hooks). There is no separate Google/Replit OAuth path in current code — older notes claiming OAuth-only auth are obsolete.

**Sessions / cookies**

- Auth is Clerk JWT Bearer on API requests, not an Express `express-session` cookie store for crypto APIs.
- Chart “session” helpers under `client/src/lib/sessions/` are **trading-session labels**, not login sessions.

## Billing (Stripe)

**Present in-repo**

| Piece | Path | Role |
|-------|------|------|
| Checkout (serverless) | `api/crypto/checkout.ts` | Authenticated `POST`; needs `STRIPE_SECRET_KEY` + `DATABASE_URL` + Clerk |
| Subscription read/sync | `api/crypto/my-subscription.ts` | Authenticated; syncs Stripe customer subscriptions into DB |
| Webhook | `api/stripe/webhook.ts` | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| Express Stripe helpers | `server/stripeCheckout.ts`, `server/stripeClient.ts` | Checkout sessions, customer create, Elliott add-on item |
| Subscription service | `server/cryptoSubscriptionService.ts` | Tiers, credits, capabilities; auto-creates free tier |
| Seed script | `scripts/seed-stripe-products.ts` | Product seeding (ops) |

**Tiers** (from `server/cryptoSubscriptionService.ts` / `api/crypto/my-subscription.ts` / `shared/aiUsageTiers.ts`):

- Base: `free` \| `beginner` \| `intermediate` \| `pro` \| `elite`
- Separate add-on: Elliott Wave (`elliott_addon` / `hasElliottAddon`) — Elite includes Elliott AI credits; other paid tiers need the add-on for Elliott AI use
- Capabilities examples: `canUseAI` from intermediate+, `canUsePushNotifications` from pro+, `canUseElliott` from add-on or elite
- AI usage priced as monthly tokens/credits (`shared/aiUsageTiers.ts`); charts/indicators are usable with signup per that file’s comments

**Express subscription routes** (authenticated): e.g. `GET /api/crypto/subscription`, `GET /api/crypto/my-subscription`, checkout helpers wired through Stripe services.

## What is absent / not claimed here

- No in-repo documentation of live Stripe **price IDs** (resolved at runtime by product name in `stripeCheckout.ts`).
- No separate “billing portal” UI module documented beyond checkout + subscription API + Clerk-gated client.
- Twilio SMS appears as optional alert delivery in routes/settings — configure via env where those handlers read it; not expanded here.

## Related docs

- [`FEATURE_FLAGS.md`](./FEATURE_FLAGS.md) — env vars for market-data / AI / push providers
- Root [`DEPLOYMENT.md`](../DEPLOYMENT.md) — deploy/config
