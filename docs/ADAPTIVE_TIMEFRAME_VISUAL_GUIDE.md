# Adaptive Timeframe System - Visual Guide

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                          │
│                    (Zoom In / Zoom Out)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CHART STATE CHANGES                            │
│  • Visible candle count changes                                  │
│  • Chart width remains constant                                  │
│  • Zoom scale factor updated                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CALCULATE METRICS (< 1ms)                           │
│  visibleCandles = count of candles in viewport                   │
│  candleWidth = chartWidth / visibleCandles                       │
│  metrics = { visibleCandles, candleWidth, chartWidth, zoom }     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               DEBOUNCE TIMER (500ms)                             │
│  Prevents rapid evaluation during continuous zoom                │
│  Resets on each metrics change                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│          EVALUATE OPTIMAL TIMEFRAME                              │
│                                                                   │
│  FOR each timeframe in hierarchy:                                │
│    • Check if current metrics fit within thresholds              │
│    • Calculate estimated metrics for this timeframe              │
│    • Score based on optimal ranges                               │
│                                                                   │
│  RETURN timeframe with best score                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            SHOULD SWITCH? (Decision Logic)                       │
│                                                                   │
│  IF current == suggested: NO SWITCH                              │
│  IF candleWidth < threshold * 0.8: YES (too small)               │
│  IF candleWidth > threshold * 1.2: YES (too large)               │
│  IF visibleCandles outside range: YES                            │
│  ELSE: NO SWITCH (within acceptable range)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
                  ▼                     ▼
          ┌─────────────┐      ┌─────────────┐
          │  NO SWITCH  │      │   SWITCH!   │
          │  (85% case) │      │  (15% case) │
          └─────────────┘      └──────┬──────┘
                                      │
                                      ▼
                        ┌──────────────────────────┐
                        │   CHECK CACHE            │
                        │                          │
                        │  IF cached & fresh:      │
                        │    → Use cached data     │
                        │  ELSE:                   │
                        │    → Fetch from API      │
                        └──────────┬───────────────┘
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │  START TRANSITION        │
                        │                          │
                        │  • Set isTransitioning   │
                        │  • Store previous TF     │
                        │  • Update current TF     │
                        │  • Trigger animation     │
                        └──────────┬───────────────┘
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │  UPDATE UI               │
                        │                          │
                        │  • Fetch new candles     │
                        │  • Update chart          │
                        │  • Animate transition    │
                        │  • Update Elliott Wave   │
                        └──────────┬───────────────┘
                                   │
                          (300ms animation)
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │  COMPLETE TRANSITION     │
                        │                          │
                        │  • Clear isTransitioning │
                        │  • Clear previous TF     │
                        │  • Cache new data        │
                        └──────────────────────────┘
```

## Timeframe Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIMEFRAME LADDER                              │
├─────────────────────────────────────────────────────────────────┤
│  1d  │ ▓▓▓▓▓▓▓▓▓▓ │ 20-80 candles  │ 10px min  │ ZOOMED OUT   │
├──────┼─────────────┼────────────────┼───────────┼──────────────┤
│  4h  │ ▓▓▓▓▓▓▓▓    │ 30-100 candles │ 8px min   │              │
├──────┼─────────────┼────────────────┼───────────┤              │
│  1h  │ ▓▓▓▓▓▓      │ 40-150 candles │ 6px min   │  DEFAULT     │
├──────┼─────────────┼────────────────┼───────────┤              │
│  15m │ ▓▓▓▓        │ 60-200 candles │ 5px min   │              │
├──────┼─────────────┼────────────────┼───────────┤              │
│  5m  │ ▓▓          │ 80-250 candles │ 4px min   │              │
├──────┼─────────────┼────────────────┼───────────┼──────────────┤
│  1m  │ ▓           │100-300 candles │ 3px min   │ ZOOMED IN    │
└──────┴─────────────┴────────────────┴───────────┴──────────────┘

  ▲                                                          ▲
  │                                                          │
ZOOM IN                                                  ZOOM OUT
(More detail)                                        (More history)
```

## State Machine

```
┌────────────────────────────────────────────────────────────┐
│                 ADAPTIVE TIMEFRAME STATE                    │
└────────────────────────────────────────────────────────────┘

         INITIAL STATE
              │
              ▼
      ┌──────────────┐
      │  ADAPTIVE    │
      │   DISABLED   │
      │              │
      └──────┬───────┘
             │
    User     │
   Enables   │
      ───────┘
             │
             ▼
      ┌──────────────┐
      │  ADAPTIVE    │ ◄────┐
      │   ENABLED    │      │
      │  (IDLE)      │      │
      └──────┬───────┘      │
             │              │
  Metrics    │              │
   Change    │              │
      ───────┘              │
             │              │
             ▼              │
      ┌──────────────┐      │
      │  EVALUATING  │      │
      │ (Debouncing) │      │
      └──────┬───────┘      │
             │              │
  Timer      │              │
 Expires     │              │
      ───────┘              │
             │              │
      ┌──────┴──────┐       │
      │             │       │
      ▼             ▼       │
┌──────────┐  ┌──────────┐ │
│NO SWITCH │  │  SWITCH  │ │
│ NEEDED   │  │  NEEDED  │ │
└────┬─────┘  └────┬─────┘ │
     │             │        │
     │             ▼        │
     │      ┌──────────────┐│
     │      │TRANSITIONING ││
     │      │ (Fetching/   ││
     │      │  Animating)  ││
     │      └──────┬───────┘│
     │             │        │
     │     (300ms) │        │
     │             │        │
     └─────────────┴────────┘
     
     
  MANUAL OVERRIDE
         │
         ▼
   ┌──────────────┐
   │  ADAPTIVE    │
   │  DISABLED    │
   │ (Manual TF)  │
   └──────────────┘
```

## Cache Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      CACHE MANAGEMENT                        │
└─────────────────────────────────────────────────────────────┘

  NEED DATA FOR TIMEFRAME
           │
           ▼
    ┌──────────────┐
    │ Check Cache  │
    └──────┬───────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌─────────┐
│ CACHE  │   │ CACHE   │
│  HIT   │   │  MISS   │
└───┬────┘   └────┬────┘
    │             │
    │             ▼
    │      ┌─────────────┐
    │      │ Fetch from  │
    │      │     API     │
    │      └──────┬──────┘
    │             │
    │             ▼
    │      ┌─────────────┐
    │      │ Store in    │
    │      │   Cache     │
    │      │ (+ timestamp)│
    │      └──────┬──────┘
    │             │
    └─────────────┘
           │
           ▼
    ┌──────────────┐
    │  USE DATA    │
    └──────────────┘
    
    
  CACHE CLEANUP
  (Every 5 min)
       │
       ▼
  ┌───────────────┐
  │ Check all     │
  │ cached items  │
  └───────┬───────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌────────┐  ┌────────┐
│ Fresh  │  │Expired │
│ (Keep) │  │(Delete)│
└────────┘  └────────┘
```

## Component Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                    CryptoSandbox.tsx                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                Header Controls                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │  │
│  │  │ Symbol   │  │ Interval │  │ TimeframeIndicator │   │  │
│  │  │ Selector │  │ Selector │  │                    │   │  │
│  │  └──────────┘  └──────────┘  └────────────────────┘   │  │
│  │                                      │                  │  │
│  │                                      │ Displays:        │  │
│  │                                      │ • Current TF     │  │
│  │                                      │ • Adaptive Mode  │  │
│  │                                      │ • Transition     │  │
│  │                                      │ • Toggle Button  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            useAdaptiveTimeframe Hook                    │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ State:                                            │  │  │
│  │  │  • currentTimeframe: '1h'                         │  │  │
│  │  │  • adaptiveMode: true/false                       │  │  │
│  │  │  • isTransitioning: true/false                    │  │  │
│  │  │  • suggestedTimeframe: '4h'                       │  │  │
│  │  │  • cache: Map<interval, data>                     │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ Functions:                                        │  │  │
│  │  │  • evaluateTimeframe()                            │  │  │
│  │  │  • setAdaptiveMode(bool)                          │  │  │
│  │  │  • setManualTimeframe(tf)                         │  │  │
│  │  │  • getCachedData(tf)                              │  │  │
│  │  │  • setCachedData(tf, data)                        │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   Chart Canvas                          │  │
│  │  • Renders candles at current timeframe                │  │
│  │  • Responds to zoom/pan events                          │  │
│  │  • Triggers metric recalculation                        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## User Interaction Flow

```
USER ZOOMS OUT
      │
      ▼
┌─────────────────┐
│ More candles    │
│ become visible  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│ Candle width    │ →   │ Width < 6px  │
│ shrinks to 4px  │     │ (threshold)  │
└─────────────────┘     └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ System waits │
                        │    500ms     │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Suggests 4h  │
                        │  timeframe   │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Checks cache │
                        │ for 4h data  │
                        └──────┬───────┘
                               │
                      ┌────────┴────────┐
                      ▼                 ▼
                 ┌────────┐        ┌────────┐
                 │ Cache  │        │ Fetch  │
                 │  hit   │        │  data  │
                 │ (50ms) │        │(500ms) │
                 └───┬────┘        └───┬────┘
                     │                 │
                     └────────┬────────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Fade animation │
                     │    (300ms)     │
                     └────────┬───────┘
                              │
                              ▼
                     ┌────────────────┐
                     │ Chart now at   │
                     │   4h with ~50  │
                     │ candles @ 20px │
                     └────────────────┘
```

## Configuration Example

```typescript
// Timeframe Configuration
const TIMEFRAME_CONFIGS = {
  '1h': {
    minCandles: 40,    // ──┐
    maxCandles: 150,   //   ├─ Acceptable range
    minCandleWidth: 6  // ──┘
  }
};

// Decision Logic
if (visibleCandles > 150 * 1.2) {  // 180 candles
  // Too many! Switch to larger timeframe
  suggestedTimeframe = '4h';
}
else if (candleWidth < 6 * 0.8) {  // 4.8px
  // Too small! Switch to larger timeframe
  suggestedTimeframe = '4h';
}
else if (candleWidth > 20 * 1.2) { // 24px
  // Too large! Switch to smaller timeframe
  suggestedTimeframe = '15m';
}
else {
  // Just right! Stay on current timeframe
  suggestedTimeframe = '1h';
}
```

This visual guide complements the textual documentation and provides intuitive understanding of the system's behavior.
