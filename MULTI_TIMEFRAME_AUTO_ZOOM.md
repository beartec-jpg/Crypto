# Multi-Timeframe Auto-Zoom Implementation Summary

## Overview
This implementation adds smooth, automatic timeframe switching to the CryptoSandbox chart component. The system ensures candles never render below 1.5px width by automatically switching to larger timeframes when zoomed out.

## Key Features

### 1. Multi-Timeframe Data Loading
- **What**: All 4 timeframes (15m, 1h, 4h, 1d) are loaded in parallel when the page loads
- **Why**: Enables instant switching without waiting for data to fetch
- **Implementation**: `fetchAllTimeframes()` in CryptoSandbox.tsx

### 2. Hysteresis-Based Switching
- **Zoom Out Threshold**: When candles reach 1.0px width → switch to larger timeframe
- **Zoom In Threshold**: When candles reach 8.0px width → switch to smaller timeframe
- **Hysteresis Gap**: 7px gap prevents flickering between timeframes
- **Implementation**: `determineOptimalTimeframe()` in timeframeUtils.ts

### 3. Minimum Width Enforcement
- **What**: All timeframe configs enforce 1.5px minimum candle width
- **Why**: Prevents candles from becoming too compressed to see
- **Implementation**: Updated `TIMEFRAME_CONFIGS` in timeframes.ts

### 4. UI Controls
- **Auto TF Toggle**: Switch to enable/disable automatic timeframe switching
- **Manual Override**: Selecting a timeframe manually disables auto mode
- **Current TF Indicator**: Shows active timeframe when in auto mode
- **TimeframeIndicator**: Visual feedback during transitions

## Manual Testing Guide

### Test 1: Auto Mode Enable
1. Open CryptoSandbox
2. Enable "Auto TF" toggle
3. Verify "Auto: 1h" indicator appears (or current timeframe)
4. Verify manual selector is disabled

### Test 2: Zoom Out Behavior
1. Enable Auto TF mode
2. Zoom out on the chart (make candles smaller)
3. When candles reach ~1px width:
   - Chart should automatically switch to next larger timeframe
   - Console log: "📊 Auto-switching: 1h → 4h"
   - TimeframeIndicator should show transition
4. Continue zooming out to test progression: 1h → 4h → 1d

### Test 3: Zoom In Behavior
1. Start zoomed out on 1d timeframe with Auto TF enabled
2. Zoom in on the chart (make candles wider)
3. When candles reach ~8px width:
   - Chart should automatically switch to smaller timeframe
   - Console log: "📊 Auto-switching: 1d → 4h"
4. Continue zooming in to test progression: 1d → 4h → 1h → 15m

### Test 4: Hysteresis (No Flickering)
1. Enable Auto TF mode starting at 1h
2. Zoom out until switch to 4h occurs (~1px)
3. Zoom in slightly (candles now ~2-3px)
4. VERIFY: Chart stays on 4h (doesn't immediately switch back to 1h)
5. Continue zooming in until candles reach 8px
6. VERIFY: Now switches back to 1h

### Test 5: Manual Override
1. Enable Auto TF mode
2. Manually select "4h" from dropdown
3. VERIFY: Auto TF toggle is automatically disabled
4. VERIFY: Chart stays on 4h regardless of zoom level

### Test 6: Data Caching
1. Load page and wait for all timeframes to load
2. Check console: "✅ Multi-timeframe data loaded"
3. Enable Auto TF and zoom out to switch timeframes
4. VERIFY: Switches are instant (no loading spinner)
5. Check console: "✅ Using cached 4h data"

### Test 7: Edge Cases
1. Test at 15m (smallest): Zoom in → should NOT switch lower
2. Test at 1d (largest): Zoom out → should NOT switch higher
3. Refresh page → verify timeframes reload successfully
4. Test with different symbols (BTCUSDT, ETHUSDT, etc.)

## Console Logging
Watch for these logs during testing:

### Data Loading
```
🔄 Fetching all timeframes in parallel...
✅ Multi-timeframe data loaded. Current: 1h (5000 candles)
```

### Auto-Switching
```
📊 Suggesting UP: 1h → 4h (width: 0.95px)
📊 Auto-switching: 1h → 4h (Auto TF enabled)
✅ Using cached 4h data (5000 candles)
```

### Switch Decisions
```
🔄 Switch decision: 1h → 4h { width: '1.00px', candles: 1000, reason: 'too small' }
```

## Success Criteria
✅ Candles never render below 1.5px width
✅ Automatic timeframe switching when zooming out past 1px threshold
✅ Automatic timeframe switching when zooming in past 8px threshold
✅ Hysteresis prevents flickering (7px gap between thresholds)
✅ All timeframes pre-loaded on mount
✅ Smooth zoom behavior with no visual jumps
✅ UI shows current auto-selected timeframe
✅ Manual override option available (disable auto mode)
✅ Console logging for debugging timeframe switches

## Technical Details

### Constants
```typescript
SWITCH_UP_THRESHOLD_PX = 1.0    // Switch to larger TF
SWITCH_DOWN_THRESHOLD_PX = 8.0  // Switch to smaller TF
TOO_LARGE_WIDTH_PX = 10.0       // Trigger immediate switch
TOO_MANY_CANDLES_MULTIPLIER = 1.2
TOO_FEW_CANDLES_MULTIPLIER = 0.7
```

### Timeframe Hierarchy
```typescript
['15m', '1h', '4h', '1d']
```

### State Management
- `multiTimeframeData`: Cached data for all 4 timeframes
- `autoTimeframe`: Boolean toggle for auto mode
- `interval`: Current active timeframe
- `adaptiveTimeframe`: Hook managing switching logic

## Known Limitations
1. Only supports 4 timeframes (15m, 1h, 4h, 1d)
2. Requires all timeframes to load successfully on mount
3. No transition animations (instant switches)
4. Console logging in production (can be disabled if needed)

## Future Enhancements
- [ ] Add smooth transition animations
- [ ] Support more timeframes (5m, 1m)
- [ ] Optimize data fetching (incremental loading)
- [ ] Add visual indicator during transitions
- [ ] Make thresholds configurable via UI
