-- Migration 003: Multi-chain pair support
--
-- Adds base_chain / quote_chain dimensions plus generic side_a / side_b lock
-- columns to swap_offers and atomic_swaps.
--
-- Design goals:
--   1. Fully additive — existing QBTC↔USDC rows continue to work unchanged.
--   2. Old QBTC-specific columns (qbtc_htlc_txid, evm_contract_id, etc.) are
--      kept; monitors read both old and new columns via COALESCE.
--   3. New swaps for non-QBTC/USDC pairs write into the new columns only.
--   4. Existing rows are backfilled so monitors can use the new columns
--      exclusively going forward.
--
-- Run with:
--   psql $DATABASE_URL -f swap-server/migrations/003_multi_chain_pairs.sql

BEGIN;

-- ── swap_offers ───────────────────────────────────────────────────────────────

ALTER TABLE swap_offers
  -- Pair dimension
  ADD COLUMN IF NOT EXISTS base_chain  VARCHAR(16) NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain VARCHAR(16) NOT NULL DEFAULT 'USDC',

  -- Generic amount columns (populated alongside legacy columns for new pairs)
  ADD COLUMN IF NOT EXISTS base_amount  TEXT,
  ADD COLUMN IF NOT EXISTS quote_amount TEXT,

  -- Chain-specific addresses for non-QBTC/USDC pairs
  --   maker_chain_address:  the maker's address on the base chain (e.g. BTC P2WPKH address)
  --   taker_chain_address:  where the maker wants to RECEIVE the quote asset
  ADD COLUMN IF NOT EXISTS maker_chain_address TEXT,
  ADD COLUMN IF NOT EXISTS taker_chain_address TEXT;

-- Backfill existing QBTC/USDC rows
UPDATE swap_offers
SET
  base_amount  = COALESCE(base_amount,  qbtc_amount),
  quote_amount = COALESCE(quote_amount, usdc_amount_requested)
WHERE base_amount IS NULL;

-- Pair-filtered listing index
CREATE INDEX IF NOT EXISTS swap_offers_pair_idx
  ON swap_offers (base_chain, quote_chain, status);

-- ── atomic_swaps ──────────────────────────────────────────────────────────────

ALTER TABLE atomic_swaps
  -- Pair dimension
  ADD COLUMN IF NOT EXISTS base_chain  VARCHAR(16) NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain VARCHAR(16) NOT NULL DEFAULT 'USDC',

  -- Generic amount columns
  ADD COLUMN IF NOT EXISTS side_a_amount TEXT,   -- base chain amount (maker's locked funds)
  ADD COLUMN IF NOT EXISTS side_b_amount TEXT,   -- quote chain amount (taker's locked funds)

  -- Generic lock identifiers — chain-agnostic:
  --   Bitcoin-family:  "<txid>:<vout>"
  --   EVM:             "0x<contractId>"  (bytes32 hex)
  --   XRPL:            "<account>:<offerSequence>"
  ADD COLUMN IF NOT EXISTS side_a_lock_id      TEXT,
  ADD COLUMN IF NOT EXISTS side_a_lock_address TEXT,   -- HTLC address / escrow account
  ADD COLUMN IF NOT EXISTS side_a_locktime     INTEGER, -- Unix timestamp maker can refund after

  ADD COLUMN IF NOT EXISTS side_b_lock_id      TEXT,
  ADD COLUMN IF NOT EXISTS side_b_locktime     INTEGER; -- Unix timestamp taker can refund after

-- Backfill existing QBTC/USDC swaps so monitors can use new columns uniformly
UPDATE atomic_swaps
SET
  side_a_amount       = COALESCE(side_a_amount,       qbtc_amount),
  side_b_amount       = COALESCE(side_b_amount,       usdc_amount),
  side_a_lock_id      = COALESCE(side_a_lock_id,      qbtc_htlc_txid),
  side_a_lock_address = COALESCE(side_a_lock_address, qbtc_htlc_address),
  side_a_locktime     = COALESCE(side_a_locktime,     qbtc_locktime),
  side_b_lock_id      = COALESCE(side_b_lock_id,      evm_contract_id),
  side_b_locktime     = COALESCE(side_b_locktime,     evm_locktime)
WHERE side_a_amount IS NULL;

-- Monitor / query indexes
CREATE INDEX IF NOT EXISTS atomic_swaps_pair_status_idx
  ON atomic_swaps (base_chain, quote_chain, status);

CREATE INDEX IF NOT EXISTS atomic_swaps_side_a_lock_idx
  ON atomic_swaps (side_a_lock_id)
  WHERE side_a_lock_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atomic_swaps_side_b_lock_idx
  ON atomic_swaps (side_b_lock_id)
  WHERE side_b_lock_id IS NOT NULL;

COMMIT;
