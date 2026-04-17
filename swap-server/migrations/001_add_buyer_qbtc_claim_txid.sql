-- Migration 001: Add buyer_qbtc_claim_txid column to atomic_swaps
ALTER TABLE atomic_swaps ADD COLUMN IF NOT EXISTS buyer_qbtc_claim_txid TEXT;
