# Testing Guide for Pixel-Width Based Timeframe Switching

## Overview
This guide describes how to test the new pixel-width based timeframe switching implementation.

## What Was Changed
- Timeframe switching now based on candle pixel width (3-15px range) instead of visible time
- Intro animation simplified to 8-second smooth reveal without timeframe cycling
- Added 500ms hysteresis to prevent flickering

## Testing Checklist

### 1. Intro Animation Testing
**Goal**: Verify the intro animation is smooth and doesn't cycle through timeframes

**Steps:**
1. Open the application fresh (clear cache if needed)
2. Navigate to the CryptoSandbox page
3. Observe the intro animation

**Expected Behavior:**
- ✅ Animation should take approximately 8 seconds
- ✅ Candles should smoothly appear from left to right
- ✅ Should display 1 week of data
- ✅ Should NOT cycle through multiple timeframes (5m → 15m → 30m, etc.)
- ✅ Should stay on a single appropriate timeframe throughout
- ✅ Animation should use cubic easing (slow start, fast middle, slow end)

**Console Logs to Watch For:**
```
🎬 Starting build animation...
🎬 Animation complete!
```

### 2. Zoom Out Testing (Candles Getting Smaller)
**Goal**: Verify candles can get as small as 3px before switching to higher timeframe

**Steps:**
1. Wait for intro animation to complete
2. Note the current timeframe (shown in UI indicator)
3. Slowly zoom out by scrolling or pinching
4. Watch the candles get progressively smaller
5. Continue zooming out

**Expected Behavior:**
- ✅ Candles should shrink smoothly
- ✅ Timeframe should stay the same while candles are between 3px and 15px
- ✅ When candles reach ~3px width, timeframe should switch up (e.g., 1h → 2h)
- ✅ After switching, candles should be wider again (closer to 15px)
- ✅ Should NOT switch rapidly back and forth

**Console Logs to Watch For:**
```
📊 Candles too small (2.8px) → switching to 2h
```

### 3. Zoom In Testing (Candles Getting Bigger)
**Goal**: Verify candles can get as large as 15px before switching to lower timeframe

**Steps:**
1. From a higher timeframe (e.g., 4h or 1D)
2. Note the current timeframe
3. Slowly zoom in by scrolling or pinching
4. Watch the candles get progressively larger
5. Continue zooming in

**Expected Behavior:**
- ✅ Candles should grow smoothly
- ✅ Timeframe should stay the same while candles are between 3px and 15px
- ✅ When candles reach ~15px width, timeframe should switch down (e.g., 4h → 2h)
- ✅ After switching, candles should be smaller again (closer to 3px)
- ✅ Should NOT switch rapidly back and forth

**Console Logs to Watch For:**
```
📊 Candles too fat (16.2px) → switching to 2h
```

### 4. Hysteresis Testing (Preventing Flickering)
**Goal**: Verify the 500ms cooldown prevents rapid switching

**Steps:**
1. Zoom to a point just before a timeframe switch (candles ~3px or ~15px)
2. Rapidly zoom in and out repeatedly around the threshold
3. Watch for rapid timeframe changes

**Expected Behavior:**
- ✅ Should NOT rapidly switch back and forth between timeframes
- ✅ After a timeframe switch, should wait at least 500ms before allowing another switch
- ✅ Console should NOT show rapid successive switch messages
- ✅ UI should feel stable and not "jumpy"

### 5. 5x Zoom Range Testing
**Goal**: Verify users can zoom 5x within a single timeframe

**Steps:**
1. Start at a timeframe with candles at ~3px
2. Zoom in gradually
3. Watch the candles grow
4. Continue until they reach ~15px

**Expected Behavior:**
- ✅ Candles should grow from 3px to 15px = 5x size increase
- ✅ Should stay on the same timeframe throughout
- ✅ Should provide much more zoom flexibility than before

**Calculation:**
```
15px / 3px = 5x zoom range per timeframe
```

### 6. Edge Case Testing

#### Test A: Very Wide Screen
**Steps:**
1. Maximize browser to full screen (or use ultrawide monitor)
2. Test zoom in/out behavior

**Expected:**
- ✅ Should still respect 3-15px range
- ✅ More candles should be visible before switching

#### Test B: Very Narrow Screen
**Steps:**
1. Resize browser to very narrow width (e.g., 400px)
2. Test zoom in/out behavior

**Expected:**
- ✅ Should still respect 3-15px range
- ✅ Fewer candles visible before switching
- ✅ Should not crash or have division by zero errors

#### Test C: Manual Timeframe Selection
**Steps:**
1. Use the timeframe selector dropdown to manually change timeframe
2. Then try zooming

**Expected:**
- ✅ Manual selection should work
- ✅ Auto-switching should continue to work after manual selection

### 7. Console Log Inspection
**Goal**: Verify debug logging is working correctly

**Open Browser DevTools Console and Look For:**

```javascript
// Successful intro
🎬 Starting build animation...
🎬 Animation complete!

// Timeframe switches with pixel measurements
📊 Candles too small (2.8px) → switching to 2h
📊 Candles too fat (16.2px) → switching to 15m

// Bin changes
📊 Bin change: 60m → 120m
⚡ Using cached 120m aggregation (168 candles)
```

### 8. Performance Testing
**Goal**: Ensure no performance degradation

**Steps:**
1. Open browser performance profiler
2. Record while zooming in and out multiple times
3. Check for any performance issues

**Expected:**
- ✅ Zoom should feel smooth (60fps)
- ✅ No excessive function calls or calculations
- ✅ Timeframe switches should be nearly instantaneous (using cached aggregations)

## Known Behaviors (Not Bugs)

1. **Debounced Switching**: Timeframe switches are debounced by 300ms during zoom, so they don't happen instantly - this is intentional
2. **Hysteresis Delay**: After a timeframe switch, there's a 500ms cooldown before allowing another switch
3. **Cached Aggregations**: First switch to a timeframe may compute data, subsequent switches use cache (you'll see "Using cached" messages)

## Regression Testing

Ensure these existing features still work:

- ✅ Drawing tools (trendlines, horizontals, channels, etc.)
- ✅ Manual timeframe selection via dropdown
- ✅ Pan/zoom with mouse and touch
- ✅ Symbol selection (BTCUSDT, ETHUSDT, etc.)
- ✅ Crosshair mode
- ✅ Elliott Wave analysis

## Bug Reporting Template

If you find an issue, please report with:

```
**Issue**: Brief description
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected**: What should happen
**Actual**: What actually happened
**Console Logs**: Any relevant console messages
**Screenshots**: If applicable
**Browser**: Chrome/Firefox/Safari version
**Screen Size**: e.g., 1920x1080
```

## Success Criteria

The implementation is successful if:

1. ✅ Candles stay between 3-15px before switching timeframes
2. ✅ Users can zoom out significantly more before timeframe switches (5x range)
3. ✅ No rapid flickering between timeframes
4. ✅ Intro animation is smooth and doesn't cycle through timeframes
5. ✅ Performance is smooth (60fps zooming)
6. ✅ All existing functionality still works

## Files Modified

- `client/src/pages/CryptoSandbox.tsx`

## Documentation

See `PIXEL_WIDTH_TIMEFRAME_CHANGES.md` for detailed implementation documentation.
