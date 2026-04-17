-- Migration 002: Add public_id UUID columns to atomic_swaps and swap_offers.
-- public_id is used as the external-facing identifier instead of the sequential integer id,
-- preventing enumeration of swap records.
ALTER TABLE atomic_swaps
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS atomic_swaps_public_id_uidx ON atomic_swaps (public_id);

ALTER TABLE swap_offers
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS swap_offers_public_id_uidx ON swap_offers (public_id);
