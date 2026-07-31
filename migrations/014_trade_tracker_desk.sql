-- Optional: apply on Neon if you want desk tables co-located.
-- Primary production path uses dedicated Postgres on the spare tracker host.
-- See trade-tracker/src/schema.sql for the full source of truth.

-- (No-op marker migration for repo history when using remote tracker DB.)
SELECT 1;
