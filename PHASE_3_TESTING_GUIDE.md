# Phase 3 Testing Guide

## Quick Start

To test the adaptive timeframe zoom scale tracking, follow these steps:

### 1. Start the Development Server

```bash
cd /home/runner/work/Crypto/Crypto
npm run dev
```

### 2. Navigate to CryptoSandbox

Open your browser and navigate to the CryptoSandbox page (usually at `/sandbox` or similar).

### 3. Open Browser Console

Press F12 or right-click → Inspect → Console tab to see the zoom scale logs.

## Test Cases

### Test 1: Mouse Wheel Zoom In

**Steps:**
1. Position mouse over the chart
2. Scroll wheel UP (zoom in) continuously
3. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 1.00 → 1.15
🔍 Zoom scale: 1.15 → 1.32
🔍 Zoom scale: 1.32 → 1.51
🔍 Zoom scale: 1.51 → 1.73
🔍 Zoom scale: 1.73 → 1.98
🔍 Zoom scale: 1.98 → 2.27
```

**Verify:**
- ✅ Console shows zoom scale increasing
- ✅ Scale updates only when change > 1%
- ✅ Chart zooms in smoothly
- ✅ No lag or performance issues

### Test 2: Mouse Wheel Zoom Out

**Steps:**
1. Position mouse over the chart
2. Scroll wheel DOWN (zoom out) continuously
3. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 2.27 → 1.98
🔍 Zoom scale: 1.98 → 1.73
🔍 Zoom scale: 1.73 → 1.51
🔍 Zoom scale: 1.51 → 1.32
🔍 Zoom scale: 1.32 → 1.15
🔍 Zoom scale: 1.15 → 1.00
🔍 Zoom scale: 1.00 → 0.87
```

**Verify:**
- ✅ Console shows zoom scale decreasing
- ✅ Scale can go below 1.0 (zoomed out)
- ✅ Chart zooms out smoothly
- ✅ No console errors

### Test 3: Touch Pinch-to-Zoom In (Mobile/Touchpad)

**Steps:**
1. Use two fingers on touchpad or touch screen
2. Pinch outward (zoom in gesture)
3. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 1.00 → 1.28
🔍 Zoom scale: 1.28 → 1.64
🔍 Zoom scale: 1.64 → 2.10
```

**Verify:**
- ✅ Touch gesture works smoothly
- ✅ Zoom scale updates appear in console
- ✅ No double-firing or duplicate logs
- ✅ Chart responds to gesture immediately

### Test 4: Touch Pinch-to-Zoom Out (Mobile/Touchpad)

**Steps:**
1. Use two fingers on touchpad or touch screen
2. Pinch inward (zoom out gesture)
3. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 2.10 → 1.64
🔍 Zoom scale: 1.64 → 1.28
🔍 Zoom scale: 1.28 → 1.00
```

**Verify:**
- ✅ Touch gesture works smoothly
- ✅ Zoom scale decreases as expected
- ✅ No conflicts with other touch handlers

### Test 5: Adaptive Timeframe Indicator

**Steps:**
1. Look for the TimeframeIndicator component in the header
2. It should appear after the interval selector
3. Click the toggle button to enable adaptive mode

**Expected Appearance:**
- Badge showing current timeframe (e.g., "1h")
- Clock or TrendingUp icon
- Toggle button that enables/disables adaptive mode
- Blue badge when adaptive mode is enabled

**Verify:**
- ✅ Component renders in header
- ✅ Shows current timeframe
- ✅ Toggle button works
- ✅ Visual feedback on enable/disable

### Test 6: Automatic Timeframe Switching

**Prerequisites:** Enable adaptive mode by clicking the TimeframeIndicator toggle

**Steps:**
1. Start with 1h timeframe
2. Zoom IN significantly (scale > 2.0)
3. Wait for debounce (500ms)
4. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 1.00 → 1.35
🔍 Zoom scale: 1.35 → 1.82
🔍 Zoom scale: 1.82 → 2.46
📊 Calculating metrics: 41 candles @ 18px (scale: 2.46)
📊 Timeframe auto-switched: 1h → 15m
💾 Cached 500 candles for 15m
```

**Verify:**
- ✅ Timeframe switches automatically
- ✅ Console shows switch message
- ✅ Chart reloads with new timeframe data
- ✅ TimeframeIndicator updates

### Test 7: Zoom Out Timeframe Switch

**Prerequisites:** Enable adaptive mode, start at 1h

**Steps:**
1. Zoom OUT significantly (scale < 0.5)
2. Wait for debounce
3. Observe console output

**Expected Result:**
```
🔍 Zoom scale: 1.00 → 0.78
🔍 Zoom scale: 0.78 → 0.61
🔍 Zoom scale: 0.61 → 0.48
📊 Calculating metrics: 208 candles @ 3px (scale: 0.48)
📊 Timeframe auto-switched: 1h → 4h
📦 Using cached data for 4h
```

**Verify:**
- ✅ Switches to larger timeframe
- ✅ Chart shows fewer, larger candles
- ✅ Cache works correctly

### Test 8: Debouncing Verification

**Steps:**
1. Zoom rapidly (scroll wheel very fast)
2. Count the console log entries
3. Should be significantly less than scroll events

**Expected Behavior:**
- Only logs when scale changes > 1%
- No log spam during continuous zoom
- Smooth performance throughout

**Verify:**
- ✅ Logs are spaced out (not every frame)
- ✅ No performance degradation
- ✅ UI remains responsive

### Test 9: Drawing Tools During Zoom

**Steps:**
1. Select a drawing tool (e.g., trendline)
2. Draw something on the chart
3. Zoom in and out
4. Observe the drawing

**Verify:**
- ✅ Drawing remains accurate after zoom
- ✅ Scale updates don't affect drawings
- ✅ Touch gestures work in drawing mode
- ✅ No conflicts between zoom and drawing

### Test 10: Edge Case - Zoom Limits

**Steps:**
1. Zoom IN to maximum (scale should cap at 20x)
2. Try to zoom further
3. Check console output

**Expected:**
```
🔍 Zoom scale: 15.23 → 17.45
🔍 Zoom scale: 17.45 → 19.12
🔍 Zoom scale: 19.12 → 20.00
(No further increases beyond 20.00)
```

**Verify:**
- ✅ Scale stops at 20.0
- ✅ No errors in console
- ✅ Chart remains functional

### Test 11: Manual Override

**Steps:**
1. Enable adaptive mode
2. Let it auto-switch to a different timeframe
3. Manually select a timeframe from dropdown
4. Observe behavior

**Expected:**
- Adaptive mode should disable automatically
- Selected timeframe loads
- Console shows no auto-switch messages
- TimeframeIndicator updates to show manual mode

**Verify:**
- ✅ Manual selection works
- ✅ Adaptive mode disables
- ✅ No conflicts

### Test 12: Performance Test

**Steps:**
1. Open browser DevTools → Performance tab
2. Start recording
3. Zoom in and out rapidly for 10 seconds
4. Stop recording
5. Analyze performance

**Verify:**
- ✅ No memory leaks
- ✅ Frame rate stays above 30fps
- ✅ setState calls are throttled
- ✅ No long tasks (>50ms)

## Console Output Reference

### Normal Operation
```
🔍 Zoom scale: 1.00 → 1.15    ← Scale change > 1%
🔍 Zoom scale: 1.15 → 1.32    ← Scale change > 1%
```

### Timeframe Switch
```
📊 Calculating metrics: 52 candles @ 15px (scale: 2.01)
📊 Timeframe auto-switched: 1h → 15m
💾 Cached 500 candles for 15m
```

### Initial Load
```
🔍 Zoom scale initialized: 1.00
```

### No Output When
- Scale change < 1% (debounced)
- Adaptive mode is disabled
- Already at boundary timeframe

## Troubleshooting

### Issue: No zoom scale logs appear

**Possible Causes:**
- Console filter is active
- Browser zoom instead of chart zoom
- Drawing tool is selected (disables D3 zoom)

**Solution:**
- Check console filter is set to "All levels"
- Ensure you're scrolling over the chart SVG
- Deselect any active drawing tools

### Issue: Timeframe doesn't switch

**Possible Causes:**
- Adaptive mode not enabled
- Not enough zoom to trigger threshold
- Debounce delay (wait 500ms)
- Already at boundary timeframe

**Solution:**
- Click TimeframeIndicator toggle
- Zoom more significantly
- Wait for debounce
- Check current timeframe isn't at boundary

### Issue: Performance lag during zoom

**Possible Causes:**
- Too many console logs
- State update threshold too low
- Other browser extensions interfering

**Solution:**
- Clear console
- Check 1% threshold is active
- Disable other extensions temporarily

## Success Criteria Checklist

After completing all tests:

- [ ] All 12 test cases pass
- [ ] No console errors
- [ ] No memory leaks
- [ ] No visual glitches
- [ ] Smooth zoom at all scales
- [ ] Touch gestures work
- [ ] Drawing tools unaffected
- [ ] Adaptive switching works
- [ ] Manual override works
- [ ] Performance is good (>30fps)
- [ ] Debouncing prevents spam
- [ ] Edge cases handled gracefully

## Automated Testing

For automated tests, run:

```bash
npm run test
```

Note: Most tests are manual/visual since this is a UI interaction feature.

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Mobile Chrome
- [ ] Mobile Safari

## Next Steps

After testing is complete:
1. Document any issues found
2. Update PHASE_3_IMPLEMENTATION_SUMMARY.md with results
3. Consider additional enhancements
4. Prepare for Phase 4 if needed

## Support

If issues arise:
- Check browser console for errors
- Review PHASE_3_IMPLEMENTATION_SUMMARY.md
- Check git history for recent changes
- Test with adaptive mode disabled
- Try manual timeframe selection

## Screenshots (To Be Added)

When testing, capture:
1. TimeframeIndicator component in header
2. Console output during zoom
3. Timeframe switching animation
4. Touch gesture working
5. Performance metrics
