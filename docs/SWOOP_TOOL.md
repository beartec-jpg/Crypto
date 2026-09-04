# Swoop tool

Predictive accumulation from successive lower-high / lower-low pivot legs
on the fullscreen chart.

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

A **separate line** is drawn between each consecutive lower high and each
consecutive lower low:

- H1 → H2, H2 → H3, H3 → H4, …
- L1 → L2, L2 → L3, L3 → L4, …

That is the whole lower-high structure, not a single envelope from H1 and not
only the last two pivots.

Later higher-high or higher-low noise is skipped so a 1.433 bounce after a 1.70
spike does not reset the run.

## Extension (the prediction)

The next leg is projected from the **last two completed legs**:

- **Angle:** compare P1→P2 slope with P2→P3 slope.
  - Equal angle: continue the last slope as a straight line.
  - Steepening (last steeper than prev): fan equal angle **and** an estimated
    increase of descent (`last + (last − prev)`).
  - Shallowing (last flatter than prev): fan equal angle **and** a decreasing
    angle (`last + (last − prev)`).
- **Length:** `lastBars × (lastBars / prevBars)` — if P2→P3 was shorter than
  P1→P2, the projection is shorter; if it stretched, the projection is longer.

The fan (when enabled) starts at the last confirmed pivot. HUD **Top** is the
last (or still-forming) H-to-H slope; **Expect** is that fan band.

## Defaults

- Pivot length **12 bars** (settings 3–48). Use 16–24 on 1h charts with spikes.
- Min pivot size **1%**.
- Arm after **2** lower highs.

If an old session still has 3- or 5-bar settings stored, open Swoop settings and
hit **Reset defaults**, or pick 12/16/20 from Pivot length.
