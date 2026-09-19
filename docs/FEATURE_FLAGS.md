# Feature flags / env-gated APIs

Optional integrations are **keyed off environment secrets**. Routes exist in-repo; without the matching env var they return an error / empty / skip the provider call. Charting and public market data (e.g. Binance) do not require these keys.

This replaces the old root `DISABLED_FEATURES.txt` (archived at [`docs/archive/phase-notes/DISABLED_FEATURES.txt`](./archive/phase-notes/DISABLED_FEATURES.txt)). That file’s “Stripe/auth removed” section is **obsolete** — see [`AUTH_AND_BILLING.md`](./AUTH_AND_BILLING.md).

## Provider API keys

| Env var | Gates (representative routes) | Notes |
|---------|-------------------------------|-------|
| `COINALYZE_API_KEY` | `GET /api/crypto/liquidations/coinalyze`, `.../liquidations/grid`, `.../liquidations/predicted`, `.../liquidations/predictive-profile`, `.../orderflow/open-interest`, `.../orderflow/funding-rate`, `.../orderflow/long-short-ratio`, `.../orderflow/cvd` | Express handlers in `server/routes.ts`; Vercel mirrors under `api/crypto/`. |
| `COINGLASS_API_KEY` (alias `CG_API_KEY` on open-interest) | `GET /api/crypto/liquidations/coinglass-history`, `.../liquidations/grid`, `.../liquidation-heatmap`, `.../liquidation-map`, `.../orderbook/coinglass`, `.../orderflow/open-interest`, `.../orderflow/funding-rate`, `.../orderflow/long-short-ratio`, `.../orderflow/professional`, `.../orderflow/professional/:symbol/:interval` | Same pattern: server + `api/crypto/`. |
| `XAI_API_KEY` | `POST /api/crypto/market-analysis`, `POST /api/crypto/order-flow-alerts`, `POST /api/crypto/order-flow-alerts-multi-tf`, `POST /api/crypto/elliott-wave/analyze` (plus related elliott-wave label/debug routes that call the AI service), cron `api/cron/refresh-crypto-ai-general.ts`, `api/cron/discord-btc-pre-london.ts` | Missing key → 500 / skip on those handlers. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (also read as `PUBLIC_VAPID_KEY` / `PRIVATE_VAPID_KEY` in some paths) | `GET /api/crypto/vapid-key`, `POST /api/crypto/test-push`, push send paths in `server/routes.ts` / `api/cron/check-alerts.ts`, `server/services/priceMonitorService.ts` | Push delivery no-ops or 500 if unset. |
| `STRIPE_SECRET_KEY` | `api/crypto/checkout.ts`, `api/crypto/my-subscription.ts`, `api/stripe/webhook.ts`, `server/stripeClient.ts` | Billing; see auth/billing doc. |
| `STRIPE_WEBHOOK_SECRET` | `api/stripe/webhook.ts` | Webhook signature verification. |
| `CLERK_SECRET_KEY` | Protected `/api/crypto/*` and `/api/users/*` handlers that call `verifyToken` / `requireCryptoAuth` | Auth; see auth/billing doc. |
| `CRON_SECRET` | `api/cron/*` jobs | Cron auth header / secret check where implemented. |
| `TRACKER_API_KEY` | `api/crypto/trade-performance.ts`, `api/cron/discord-btc-pre-london.ts` | External tracker integration. |

## Always-on (no provider key in code path)

Examples that do not gate on the keys above (public exchange APIs / local calc):

- Binance (and related) candle / price / live liquidation streams used by chart routes
- Local indicator math and manual Elliott labeling UI
- Many chart preference endpoints still require **Clerk auth** in production even when no third-party key is needed

## Source of truth

Prefer the handlers themselves:

- Express: `server/routes.ts`, `server/services/*`
- Serverless: `api/crypto/**`, `api/cron/**`, `api/stripe/**`

Do not treat archived phase notes as current feature status.
