# Bear Tec Crypto Platform

Cryptocurrency analysis app: real-time charting, technical indicators, Elliott Wave tools, order-flow / liquidation data, and AI-assisted insights. Auth is **Clerk**; paid AI/alert tiers are **Stripe** (see docs below).

## Quick start

**Prerequisites:** Node.js 18+ or 20+ (CI also covers these), npm, PostgreSQL (e.g. Neon).

```bash
npm install
npm run dev          # http://localhost:3000 (or the port Vite prints)
```

### Tests

```bash
npm test             # watch
npm run test:run     # CI / once
npm run test:coverage
npm run test:ui
```

### Build / quality

```bash
npm run build
npm run check        # TypeScript
npm run analyze      # bundle
npm run check:bundle
```

## Configuration (high level)

| Concern | Env (examples) | Doc |
|---------|----------------|-----|
| Clerk (client) | `VITE_CLERK_PUBLISHABLE_KEY` | [docs/AUTH_AND_BILLING.md](docs/AUTH_AND_BILLING.md) |
| Clerk (API) | `CLERK_SECRET_KEY` | same |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | same |
| Market data / AI / push | `COINALYZE_API_KEY`, `COINGLASS_API_KEY`, `XAI_API_KEY`, VAPID keys | [docs/FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) |
| Database | `DATABASE_URL` | [DEPLOYMENT.md](DEPLOYMENT.md) |

Do **not** commit secrets. Feature routes stay in the tree; missing keys degrade those providers only.

## Documentation

### Product / ops (root)

- [ARCHITECTURE.md](ARCHITECTURE.md) — system layout
- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy and env
- [TESTING.md](TESTING.md) — testing guide
- [PERFORMANCE.md](PERFORMANCE.md) — perf notes
- [METRICS.md](METRICS.md) — metrics
- [SECURITY_AUDIT_SUMMARY.md](SECURITY_AUDIT_SUMMARY.md) — security summary
- [CHANGELOG.md](CHANGELOG.md)

### Docs folder

- [docs/AUTH_AND_BILLING.md](docs/AUTH_AND_BILLING.md) — Clerk auth + Stripe tiers/checkout
- [docs/FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) — env-gated `/api/crypto/...` providers
- [docs/REFACTORING_2026.md](docs/REFACTORING_2026.md) — chart refactor overview
- [docs/PHASE_6_ROADMAP.md](docs/PHASE_6_ROADMAP.md) — refactor roadmap

### History (archived)

Phase diaries, old summaries, and the obsolete `DISABLED_FEATURES.txt` live in **[docs/archive/phase-notes/](docs/archive/phase-notes/)** (see that folder’s README). They are not the source of truth for current auth, billing, or feature status.

## Repo layout (sketch)

```
api/          # Vercel-style serverless handlers (crypto, stripe, cron, users)
server/       # Express app, Stripe + subscription services, routes
client/       # Vite React UI (charts, Clerk gates)
shared/       # schema, AI usage tiers, shared config
docs/         # current docs + archive/phase-notes
```

## CI

GitHub Actions runs the test suite on push/PR (see `.github/workflows`). Prefer `npm run test:run` locally before pushing.

## License

MIT
