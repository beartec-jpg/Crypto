-- Migration 007: Store BTC/QBTC compressed pubkeys on atomic_swaps
--
-- BTC HTLC scripts are deterministic given (secretHash, claimerPubKey, refunderPubKey, locktime).
-- To allow either party to reconstruct (and claim against) a BTC HTLC they need both pubkeys.
-- These columns carry the maker's and taker's compressed secp256k1 pubkeys (33-byte hex).
--
-- Populated by:
--   side_a_pub_key_hex — from swap_offers.maker_pub_key_hex at accept time
--   side_b_pub_key_hex — from takerPubKeyHex supplied by the taker when calling POST /accept
--
-- Optional: non-BTC swaps leave these NULL.

ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS side_a_pub_key_hex TEXT,   -- maker's compressed pubkey (BTC/QBTC)
  ADD COLUMN IF NOT EXISTS side_b_pub_key_hex TEXT,   -- taker's compressed pubkey (BTC/QBTC)
  ADD COLUMN IF NOT EXISTS side_b_lock_address TEXT;  -- taker's HTLC address (BTC P2WSH / ETH contract)
