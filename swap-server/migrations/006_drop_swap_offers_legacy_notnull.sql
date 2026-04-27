-- Migration 006: Drop NOT NULL on legacy QBTC/USDC columns in swap_offers
--
-- Migration 004 dropped the NOT NULL constraints on legacy columns in atomic_swaps
-- but omitted the same fix for swap_offers.  As a result, inserting a v2 offer
-- for any non-QBTC pair (e.g. XRP→ETH, BTC→ETH) fails with:
--
--   null value in column "qbtc_amount" of relation "swap_offers"
--   violates not-null constraint
--
-- This migration makes the legacy columns nullable in swap_offers so that the
-- v2 offer endpoint can insert rows that only populate the generic base_amount /
-- quote_amount columns.
--
-- Run with:
--   psql $DATABASE_URL -f swap-server/migrations/006_drop_swap_offers_legacy_notnull.sql

BEGIN;

ALTER TABLE swap_offers
  ALTER COLUMN qbtc_amount          DROP NOT NULL,
  ALTER COLUMN usdc_amount_requested DROP NOT NULL;

COMMIT;
