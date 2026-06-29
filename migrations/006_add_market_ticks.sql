-- Migration: 006_add_market_ticks
-- Individual trade-tick records (one row per executed trade on any exchange).
-- Previously failed with a syntax error due to a missing comma after
-- event_time; this migration contains the corrected statement.

CREATE TABLE IF NOT EXISTS market_ticks (
  id          BIGSERIAL        PRIMARY KEY,
  symbol      VARCHAR(20)      NOT NULL,
  exchange    VARCHAR(50)      NOT NULL,
  price       DOUBLE PRECISION NOT NULL,
  quantity    DOUBLE PRECISION NOT NULL,
  event_time  TIMESTAMP        NOT NULL,
  value_usd   DOUBLE PRECISION,
  captured_at TIMESTAMP        DEFAULT NOW(),
  UNIQUE (symbol, exchange, price, quantity, event_time)
);
