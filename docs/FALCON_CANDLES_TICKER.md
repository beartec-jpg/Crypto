# Falcon candles + ticker (follow-up to #617)

## What this adds
- Ticker selector: `USDC-FPL` (default Falcon) and `BTC4-FPL` with **Falcon testnet 2300** labels
- `GET /api/crypto/falcon/markets`, `GET /api/crypto/falcon/candles`, `POST /api/crypto/falcon/ingest`
- Chart hooks branch to Falcon candles for those symbols; **Binance paths unchanged** for USDT pairs
- Brain `sync_candles.py`: explorer tip window → (optional) sealed times → OHLCV → push ingest

## Time source (honest — corrected)

Public explorer `GET /api/v1/explorer/blocks` (`Falcon-faucet-wallet` explorer-api):

| Field | Provenance | Use for OHLCV? |
| --- | --- | --- |
| `observed_at` | `Date.now()` when the explorer API instance first remembered the tip (`node.ts` → `tipBlockFromStatus(body, at)`). Required. Retention string: **"recent tips observed by this API instance"**. | **No** — indexer observation / arrival, not a chain header timestamp |
| `sealed_at` | Node status `tip_sealed_at_ms`, else `last_pack_at_ms`, when > 0 (`mappers.ts`). Nullable. | **Yes** — only accepted OHLCV time (`timeSource=explorer.sealed_at`, `timeQuality=canonical_sealed`) |

Live evidence (2026-11-06): all tip blocks return `sealed_at: null`. Falcon Cloud `fpl_status` currently exposes neither `tip_sealed_at_ms` nor `last_pack_at_ms`. Therefore **candles stay unavailable** (`emptyReason` / `emptyReasonHint=no_canonical_block_time`) until a legitimate seal/pack wall time appears. We do **not** emit observation-estimated candles disguised as verified timestamps, and we do **not** invent times from ingestion or Binance.

There is no public block-by-height historical timestamp API (`handlers.ts` 404: *"the node has no public block-by-height query"*). Stored fill heights outside the explorer tip ring cannot be backfilled from a canonical read source today.

## Limits
- Live RPC ring ≤200 fills — not full history
- Explorer tip ring is in-process / instance-local (cold start resets)
- Observation tips may be stored for diagnostics; they do not time fills for OHLCV

## Delivery path
Brain → HTTPS POST `/api/crypto/falcon/ingest` with `FALCON_BRAIN_INGEST_TOKEN` (server-only).  
No public brain port, no Funnel/Tailscale changes, no new paid DB product (uses existing Neon).
