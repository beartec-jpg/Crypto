# Swoop tool

Predictive accumulation envelope on the fullscreen chart.

## Where it lives

Tools wrench → **Swoop** (toggle + settings).

See source under `client/src/types/swoop.ts` and `client/src/lib/indicators/swoop.ts`.

## Why it idled on large moves

The first cut used a 5-bar fractal and **trailing** lower highs only. On XRPUSDT 1h
the 22 Aug ~1.70 spike is the real top, but a later 1.433 bounce vs 1.403 prints a
higher high, so the trailing run resets and the HUD stays `Idle · need 2 lower highs`.

## Current behaviour

- Default **pivot length is 12 bars** (settings go 5–48). Larger length = only
  more significant swings. Use 16–24 on 1h charts with violent spikes.
- **Min pivot size** (default 1%) drops tiny reversals so chop does not count as structure.
- Envelope is built **from the major swing top** in the lookback, skipping later
  higher-high noise instead of disarming.
- HUD now says `last high not lower (1.433 ≥ 1.403)` when trailing would have failed.

If an old session still has 5-bar settings stored, open Swoop settings and hit
**Reset defaults**, or pick 12/16/20 from Pivot length.
