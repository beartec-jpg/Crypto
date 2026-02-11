-- Add bias settings columns to user_watchlists table
ALTER TABLE user_watchlists 
ADD COLUMN IF NOT EXISTS structure_pivot_length INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS ema_lengths INTEGER[] NOT NULL DEFAULT ARRAY[21, 50, 200];

-- Add comment for documentation
COMMENT ON COLUMN user_watchlists.structure_pivot_length IS 'Pivot length used for structure detection in watchlist';
COMMENT ON COLUMN user_watchlists.ema_lengths IS 'Array of EMA periods used for bias calculation in watchlist';
