-- Migration 004: Clean multi-chain schema
--
-- User confirmed: no live swap data to preserve.
-- This migration:
--   1. Wipes all swap / offer / price data
--   2. Drops NOT NULL constraints on legacy QBTC/EVM-specific columns so that
--      v2 swaps (any chain pair) can be inserted without them
--   3. Adds v2-specific columns for auth and generic addressing
--
-- Run with:
--   psql $DATABASE_URL -f swap-server/migrations/004_clean_multi_chain.sql

BEGIN;

-- ── Wipe existing data ────────────────────────────────────────────────────────
-- ORDER matters: atomic_swaps FK → swap_offers, price_ticks FK → both
TRUNCATE atomic_swaps    RESTART IDENTITY CASCADE;
TRUNCATE swap_offers     RESTART IDENTITY CASCADE;
TRUNCATE price_ticks                            CASCADE;

-- ── atomic_swaps: drop NOT NULL on legacy columns ────────────────────────────
-- These columns are QBTC/USDC-specific and not filled by multi-chain v2 swaps.
ALTER TABLE atomic_swaps
  ALTER COLUMN seller_qbtc_address DROP NOT NULL,
  ALTER COLUMN seller_evm_address  DROP NOT NULL,
  ALTER COLUMN seller_pub_key_hex  DROP NOT NULL,
  ALTER COLUMN buyer_qbtc_address  DROP NOT NULL,
  ALTER COLUMN buyer_evm_address   DROP NOT NULL,
  ALTER COLUMN buyer_pub_key_hex   DROP NOT NULL,
  ALTER COLUMN qbtc_amount         DROP NOT NULL,
  ALTER COLUMN usdc_amount         DROP NOT NULL;

-- ── atomic_swaps: add v2 addressing columns ───────────────────────────────────
-- side_a / side_b chain addresses (separate from lock ids)
ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS side_a_chain_address TEXT,  -- maker's address on base chain
  ADD COLUMN IF NOT EXISTS side_b_chain_address TEXT,  -- taker's address on quote chain
  ADD COLUMN IF NOT EXISTS auth_evm_address_a   TEXT,  -- EVM address used by maker for signing
  ADD COLUMN IF NOT EXISTS auth_evm_address_b   TEXT;  -- EVM address used by taker for signing

-- ── swap_offers: drop NOT NULL on legacy columns ─────────────────────────────
ALTER TABLE swap_offers
  ALTER COLUMN seller_qbtc_address DROP NOT NULL,
  ALTER COLUMN seller_evm_address  DROP NOT NULL,
  ALTER COLUMN seller_pub_key_hex  DROP NOT NULL;

-- ── swap_offers: add v2 auth + addressing columns ────────────────────────────
ALTER TABLE swap_offers
  -- EVM address used for signing the offer (may differ from chain address)
  ADD COLUMN IF NOT EXISTS auth_evm_address TEXT,
  -- Maker's compressed ECDSA pubkey for HTLC building (any chain)
  ADD COLUMN IF NOT EXISTS maker_pub_key_hex TEXT,
  -- Taker's address on the base chain (where they receive the base asset after claim)
  ADD COLUMN IF NOT EXISTS taker_base_address TEXT;

-- ── Ensure migration 003 columns exist (idempotent) ──────────────────────────
ALTER TABLE swap_offers
  ADD COLUMN IF NOT EXISTS base_chain         VARCHAR(16) NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain        VARCHAR(16) NOT NULL DEFAULT 'USDC',
  ADD COLUMN IF NOT EXISTS base_amount        TEXT,
  ADD COLUMN IF NOT EXISTS quote_amount       TEXT,
  ADD COLUMN IF NOT EXISTS maker_chain_address TEXT,
  ADD COLUMN IF NOT EXISTS taker_chain_address TEXT;

ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS base_chain         VARCHAR(16) NOT NULL DEFAULT 'QBTC',
  ADD COLUMN IF NOT EXISTS quote_chain        VARCHAR(16) NOT NULL DEFAULT 'USDC',
  ADD COLUMN IF NOT EXISTS side_a_amount      TEXT,
  ADD COLUMN IF NOT EXISTS side_b_amount      TEXT,
  ADD COLUMN IF NOT EXISTS side_a_lock_id     TEXT,
  ADD COLUMN IF NOT EXISTS side_a_lock_address TEXT,
  ADD COLUMN IF NOT EXISTS side_a_locktime    INTEGER,
  ADD COLUMN IF NOT EXISTS side_b_lock_id     TEXT,
  ADD COLUMN IF NOT EXISTS side_b_locktime    INTEGER;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS swap_offers_pair_status_idx
  ON swap_offers (base_chain, quote_chain, status, offer_type);

CREATE INDEX IF NOT EXISTS atomic_swaps_pair_status_idx
  ON atomic_swaps (base_chain, quote_chain, status);

CREATE INDEX IF NOT EXISTS atomic_swaps_side_a_lock_idx
  ON atomic_swaps (side_a_lock_id)
  WHERE side_a_lock_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atomic_swaps_side_b_lock_idx
  ON atomic_swaps (side_b_lock_id)
  WHERE side_b_lock_id IS NOT NULL;

COMMIT;
