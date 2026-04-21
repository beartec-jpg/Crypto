# QBTC Mining Implementation Report
**Repository:** `beartec-jpg/Crypto`  
**Scope:** Infrastructure implemented in this repository as of 2026-04-21

## 1) Mining Surfaces Implemented

### A. Mining UI (Frontend)
- **Page:** `client/src/pages/QBTCMining.tsx`
- Implemented mining experience includes:
  - Gateway + lane tabs: `Gateway`, `Home CPU`, `Open GPU`, `Pro / ASIC`
  - Pool setup instructions (`stratum+tcp://89.167.109.241:3333`)
  - Password lanes (`x`, `home`, `gpu`, `pro`)
  - Lane-specific worker and round metrics
  - Round fairness table with weighted shares and reward estimate
  - One-click **browser CPU miner** controls:
    - payout address input
    - worker alias input
    - thread count selector
    - throttle slider
    - start/stop mining
    - local hashrate + accepted/weighted/rejected share counters

### B. Browser Miner Worker Runtime
- **Worker asset:** `client/public/qbtc-browser-miner-worker.js`
- Implemented behavior:
  - SHA-256d loop in Web Worker
  - Extranonce handling + merkle root assembly from job template
  - Share target calculation from `share_difficulty`
  - Share candidate submission events back to UI thread
  - Per-second hashrate reporting
  - Runtime controls: `start`, `job` (job refresh), `stop`

### C. Pool Stats Proxy API
- **Endpoint:** `api/qbtc/pool-stats.ts`
- Implemented behavior:
  - Proxies pool stats from `QBTC_POOL_STATS_URL`
  - Enforces HTTPS upstream (HTTP allowed for localhost only)
  - Origin allowlist CORS (`QBTC_MINING_CORS_ORIGINS`)
  - Optional originless request support (`QBTC_MINING_ALLOW_ORIGINLESS`)
  - 8-second upstream timeout handling

### D. Browser Miner Proxy API
- **Endpoint:** `api/qbtc/browser-miner.ts`
- Implemented actions:
  - `GET ?action=job` → fetches mining job from upstream pool
  - `POST ?action=submit` → submits mined share payload upstream
- Implemented controls:
  - QBTC address validation
  - Worker alias sanitization
  - Share payload validation (`job_id`, `extranonce2`, `ntime`, `nonce`)
  - Per-IP submit rate limiting (`QBTC_BROWSER_MINER_SUBMIT_RATE_LIMIT_PER_MINUTE`)
  - Origin allowlist CORS + 8-second timeout + HTTPS upstream enforcement

### E. Miner Binding API (User ↔ payout/worker mapping)
- **Endpoint:** `api/qbtc/miner/binding.ts`
- Implemented behavior:
  - Authenticated by Clerk bearer token
  - Stores per-user binding in Postgres table `qbtc_pool_bindings`
  - `GET` returns current binding
  - `POST` upserts payout address + worker alias
  - Address and alias validation/sanitization

### F. Mining Metrics Utilities + Tests
- **Utility:** `client/src/lib/qbtcMiningMetrics.ts`
- **Tests:** `client/src/__tests__/lib/qbtcMiningMetrics.test.ts`
- Implemented:
  - Safe aggregation for lane round metrics
  - Worker-count fallback resolution logic
  - Unit tests for aggregation and fallback behavior

## 2) Infrastructure Wiring Implemented

### Vercel Routing / Hosting
- `vercel.json` excludes `qbtc-browser-miner-worker.js` from SPA fallback rewrite, preserving direct worker asset loading.
- API functions are deployed under `api/**/*.ts`.

### Environment Configuration
- `.env.example` already includes mining configuration:
  - `QBTC_POOL_STATS_URL`
  - `QBTC_POOL_HTTP_BASE_URL`
  - `QBTC_MINING_CORS_ORIGINS`
  - `QBTC_MINING_ALLOW_ORIGINLESS`
  - `QBTC_BROWSER_MINER_SUBMIT_RATE_LIMIT_PER_MINUTE`

## 3) Security / Control Measures Implemented

- Upstream pool URLs are required to use HTTPS (localhost exception only).
- Browser miner submit calls are rate-limited per client IP.
- CORS origin allowlisting is implemented for mining endpoints.
- Worker aliases are sanitized and capped in length.
- QBTC payout address format validation is enforced at API boundaries.

## 4) Current Implementation Boundary (What is NOT in this repo)

- Mining pool core server/stratum backend implementation is external to this repository.
- Consensus/node mining internals live in the separate `beartec-jpg/QuantBTC` repository.
- This repository provides the mining **UI, browser worker client, and secure proxy/API integration layer**.

## 5) Operational Status References

- Existing testnet status document: `QBTC_TESTNET_STATUS_REPORT.md`
- Existing architecture context: `ARCHITECTURE.md`
