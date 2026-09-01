# Swoop tool

Predictive accumulation envelope on the fullscreen chart.

## Where it lives

Tools wrench → **Swoop** (toggle + settings).

See source under `client/src/types/swoop.ts` and `client/src/lib/indicators/swoop.ts`.

## Pivot detection (zigzag of length N)

Pivots are a **zigzag from wick extremes**, not a chain of same-side fractals.

1. A bar is a pivot high only if its **high wick** is the highest of N bars left
   and N bars right (`calculateSwings`). Same for lows using the low wick.
2. Swings **must alternate** H-L-H-L. Two highs in a row keep the higher wick;
   two lows keep the lower wick. That is why a 1.55 bounce replaces a 1.52 bump
   when no confirmed trough sits between them.
3. **Min pivot size** (default 1%) is the reversal needed to confirm the opposite
   pivot, so 3-bar chop does not become H2, H3, H4…

The HUD badge `P{n}` is that N. Pivot labels (H1, L1, H2, L2…) sit on the zigzag
points actually used.

## Trend lines

One **top** line and one **bottom** line span the whole lower-high structure
(from the major swing top / first lower low through to now, then projected).
A thin zigzag overlay shows the H-L-H-L path of the wick pivots.

Later higher-high or higher-low noise is skipped for the envelope so a 1.433
bounce after a 1.70 spike does not reset or clip the channel.

## Defaults

- Pivot length **12 bars** (settings 3–48). Use 16–24 on 1h charts with spikes.
- Min pivot size **1%**.
- Arm after **2** lower highs.

If an old session still has 3- or 5-bar settings stored, open Swoop settings and
hit **Reset defaults**, or pick 12/16/20 from Pivot length.
