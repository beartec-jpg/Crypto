# Falcon candles + ticker (follow-up to #617)

## What this adds
- Ticker selector: `USDC-FPL` (default Falcon) and `BTC4-FPL` with **Falcon testnet 2300** labels
- `GET /api/crypto/falcon/markets`, `GET /api/crypto/falcon/candles`, `POST /api/crypto/falcon/ingest`
- Chart hooks (`useCandleData`, `useChartData`, Elliott extended-history) branch to Falcon candles for those symbols; **Binance paths unchanged** for USDT pairs
- Brain `sync_candles.py`: explorer block times → timed fills → OHLCV → push ingest

## Time source (honest)
Explorer `Block.sealed_at` (preferred) else `Block.observed_at` from  
`https://falcon-fpl.com/api/v1/explorer/blocks`.  
Fills whose height has not been observed remain `untimed` and are **excluded** from candles. No ingestion-time substitute.

## Limits
- Live RPC ring ≤200 fills — candles cannot claim full history
- Explorer height lookup is a recent tip window; old fill heights may stay untimed until re-observed (unlikely) — coverage meta reports this

## Delivery path
Brain → HTTPS POST `/api/crypto/falcon/ingest` with `FALCON_BRAIN_INGEST_TOKEN` (server-only).  
No public brain port, no Funnel/Tailscale changes, no new paid DB product (uses existing Neon).
