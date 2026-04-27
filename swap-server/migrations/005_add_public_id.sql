-- Migration 005: Add public_id UUID columns for external swap references
--
-- The code references atomic_swaps.public_id for all external-facing swap IDs.
-- The existing `id` column is used for internal FK references only.
-- Both swap_offers and atomic_swaps get public_id for consistency, though
-- currently only atomic_swaps.public_id is actively used in the API.

BEGIN;

-- atomic_swaps: primary use of public_id (all v2 + legacy swap lookups)
ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS atomic_swaps_public_id_idx
  ON atomic_swaps (public_id);

-- swap_offers: added for completeness / future use
ALTER TABLE swap_offers
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS swap_offers_public_id_idx
  ON swap_offers (public_id);

COMMIT;
