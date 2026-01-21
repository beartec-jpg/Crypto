# Pixel-Width Based Timeframe Switching Implementation

## Overview
This document describes the changes made to fix the timeframe switching logic to be based on candle pixel width (3-15px range) instead of visible time, and to simplify the intro animation.

## Problem Statement
- Candles were constantly too fat (30-50px wide)
- Timeframe switches too aggressively when zooming out
- User couldn't zoom out to see more candles at current timeframe
- Intro animation unnecessarily cycled through all timeframes

## Solution Summary

### 1. Replaced Time-Based Thresholds with Pixel-Width Based Logic

**Old Approach (DEPRECATED):**
```typescript
const BIN_THRESHOLDS = [
  { visibleMs: 21 * ONE_DAY_MS, binMs: ONE_WEEK_MS, name: '1W' },
  // ... switched based on visible time range
];

function getBinMs(visibleMs: number): number {
  for (const threshold of BIN_THRESHOLDS) {
    if (visibleMs >= threshold.visibleMs) {
      return threshold.binMs;
    }
  }
  return BASE_RESOLUTION_MS;
}
```

**New Approach:**
```typescript
// Constants for candle width thresholds
const MIN_CANDLE_WIDTH_PX = 3;   // Switch UP to higher TF when candles get smaller
const MAX_CANDLE_WIDTH_PX = 15;  // Switch DOWN to lower TF when candles get bigger
const IDEAL_CANDLE_WIDTH_PX = 8; // Target width for initial view

// Ordered list of available timeframes
const TIMEFRAME_BINS = [
  { binMs: 5 * ONE_MINUTE_MS,  name: '5m' },
  { binMs: 15 * ONE_MINUTE_MS, name: '15m' },
  // ... all timeframes in order
  { binMs: ONE_WEEK_MS,        name: '1W' },
];

function calculateCandleWidth(
  visibleMs: number,
  binMs: number,
  chartWidthPx: number
): number {
  const numCandles = visibleMs / binMs;
  if (numCandles <= 0) return IDEAL_CANDLE_WIDTH_PX;
  return (chartWidthPx / numCandles) * 0.7; // 0.7 accounts for gaps
}
```

### 2. Added Pixel-Width Based Timeframe Selection

```typescript
const getBinMsForPixelWidth = useCallback((
  visibleMs: number,
  chartWidthPx: number,
  currentBinMs: number
): number => {
  // Hysteresis: don't switch if we just switched
  const now = Date.now();
  if (now - lastSwitchTimeRef.current < SWITCH_COOLDOWN_MS) {
    return currentBinMs;
  }
  
  const currentIdx = TIMEFRAME_BINS.findIndex(t => t.binMs === currentBinMs);
  const currentWidth = calculateCandleWidth(visibleMs, currentBinMs, chartWidthPx);
  
  // If candles are too small (< 3px), switch to higher timeframe
  if (currentWidth < MIN_CANDLE_WIDTH_PX && currentIdx < TIMEFRAME_BINS.length - 1) {
    // Find first timeframe where candles would be >= 3px
    for (let i = currentIdx + 1; i < TIMEFRAME_BINS.length; i++) {
      const width = calculateCandleWidth(visibleMs, TIMEFRAME_BINS[i].binMs, chartWidthPx);
      if (width >= MIN_CANDLE_WIDTH_PX) {
        console.log(`📊 Candles too small (${currentWidth.toFixed(1)}px) → switching to ${TIMEFRAME_BINS[i].name}`);
        lastSwitchTimeRef.current = now;
        return TIMEFRAME_BINS[i].binMs;
      }
    }
    return TIMEFRAME_BINS[TIMEFRAME_BINS.length - 1].binMs; // Use largest
  }
  
  // If candles are too fat (> 15px), switch to lower timeframe
  if (currentWidth > MAX_CANDLE_WIDTH_PX && currentIdx > 0) {
    // Find lowest timeframe where candles would still be <= 15px
    for (let i = currentIdx - 1; i >= 0; i--) {
      const width = calculateCandleWidth(visibleMs, TIMEFRAME_BINS[i].binMs, chartWidthPx);
      if (width <= MAX_CANDLE_WIDTH_PX) {
        console.log(`📊 Candles too fat (${currentWidth.toFixed(1)}px) → switching to ${TIMEFRAME_BINS[i].name}`);
        lastSwitchTimeRef.current = now;
        return TIMEFRAME_BINS[i].binMs;
      }
    }
    return TIMEFRAME_BINS[0].binMs; // Use smallest
  }
  
  // Candles are in good range (3-15px), stay on current timeframe
  return currentBinMs;
}, []);
```

### 3. Added Hysteresis to Prevent Flickering

```typescript
const lastSwitchTimeRef = useRef<number>(0);
const SWITCH_COOLDOWN_MS = 500; // Don't switch again for 500ms after a switch
```

This prevents rapid switching back and forth when the user is near a threshold.

### 4. Updated Zoom Handler

**Before:**
```typescript
const visibleMs = visibleTimeRange[1].getTime() - visibleTimeRange[0].getTime();
const newBinMs = getBinMs(visibleMs);
```

**After:**
```typescript
const visibleMs = visibleTimeRange[1].getTime() - visibleTimeRange[0].getTime();
const chartWidthPx = innerWidth;
const newBinMs = getBinMsForPixelWidth(visibleMs, chartWidthPx, currentBinMs);
```

### 5. Simplified Intro Animation

**Old Animation (REMOVED):**
- Used complex harmonic timing with dramatic intro phase
- Cycled through different timeframes as candles built up
- Had ~2000+ lines of complex animation logic

**New Animation:**
```typescript
const playBuildAnimation = useCallback(() => {
  // ... setup ...
  
  const startTime = performance.now();
  const TOTAL_DURATION = 8000; // 8 seconds total
  
  // Calculate appropriate timeframe for 1 week of data
  const chartWidth = svgRef.current?.clientWidth || 600;
  const weekMs = ONE_WEEK_MS;
  
  // Find timeframe that gives ~8px candles for 1 week view
  let targetBinMs = ONE_HOUR_MS;
  for (const tf of TIMEFRAME_BINS) {
    const candleWidth = calculateCandleWidth(weekMs, tf.binMs, chartWidth);
    if (candleWidth >= 6 && candleWidth <= 12) {
      targetBinMs = tf.binMs;
      break;
    }
  }
  
  // Pre-aggregate to target timeframe (no switching during animation)
  const finalCandles = aggregateCandles(weekData, targetBinMs);
  
  // Smoothly reveal candles with easing
  const animate = () => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / TOTAL_DURATION);
    
    // Cubic easing: slow start, fast middle, slow end
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    
    const visibleCount = Math.max(1, Math.floor(eased * totalCandles));
    
    // Update display...
  };
  
  animate();
}, []);
```

### 6. Removed Deprecated Code

- Commented out `BIN_THRESHOLDS` array
- Commented out old `getBinMs()` function
- Removed `DRAMATIC_CANDLES`, `DRAMATIC_DELAYS`, `HARMONIC_BASE_MS` constants
- Simplified animation logic by ~150 lines

## Key Benefits

1. **Better Zoom Range**: Users can now zoom 5x within a single timeframe (candles go from 15px → 3px)
2. **Less Aggressive Switching**: Only switches when absolutely necessary (candles < 3px or > 15px)
3. **More Predictable**: Pixel-based logic is more intuitive than time-based
4. **Cleaner Animation**: Smooth 8-second reveal without timeframe cycling
5. **Reduced Flickering**: 500ms hysteresis prevents rapid switching

## Expected Behavior After Fix

- User zooms out → candles get smaller (15px → 3px) → stays on same timeframe
- User zooms out more → candles would be < 3px → switches to higher timeframe
- User zooms in → candles get bigger (3px → 15px) → stays on same timeframe  
- User zooms in more → candles would be > 15px → switches to lower timeframe
- 5x zoom range per timeframe = much more flexibility
- Intro animation smoothly reveals candles without timeframe cycling

## Testing Notes

The changes were implemented in a single file:
- `client/src/pages/CryptoSandbox.tsx`

To test:
1. Load the app and watch the intro animation (should be smooth, single timeframe)
2. Zoom out gradually and observe candle width (should go from ~8px to 3px before switching)
3. Zoom in gradually and observe candle width (should go from ~8px to 15px before switching)
4. Zoom quickly in/out and verify no flickering occurs (hysteresis should prevent rapid switches)
5. Check console logs for "Candles too small" / "Candles too fat" messages with pixel measurements

## Files Modified

- `client/src/pages/CryptoSandbox.tsx` - 178 insertions, 193 deletions

## Commit History

1. `7117215` - Implement pixel-width based timeframe switching and simplify animation
2. `0857596` - Remove unused animation constants
