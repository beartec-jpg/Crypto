# Elliott Wave Tool - Manual Testing Guide

## Quick Start

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to Crypto Sandbox page**

3. **Look for the Elliott Wave button** (TrendingUp icon 📈) in the left toolbar

## Test Workflow

### Test 1: Basic W0 → W1 → W2 Flow

1. **Activate Elliott Wave mode:**
   - Click the Elliott Wave button (📈 icon)
   - Button should turn blue
   - Status text should appear: "Ready to place W0 - Click candle high/low"

2. **Place W0 (Start Point):**
   - Click on a candle low
   - Should see:
     - Cyan circle with "W0" label
     - Magnet snap effect (pulse animation)
     - Status: "W0 placed - Click for W1"

3. **Place W1 (Impulse End):**
   - Click on a candle high (above W0)
   - Should see:
     - Cyan circle with "W1" label
     - Yellow dashed Fibonacci lines appear (23.6%, 38.2%, 50%, 61.8%, 78.6%)
     - Percentage labels on right side
     - Cyan trendline connecting W0 → W1
     - Status: "W1 placed - Click for W2 (candle or fib level)"

4. **Place W2 on Fibonacci Level:**
   - Click on the 61.8% Fibonacci line
   - Should see:
     - Cyan circle with "W2" label
     - Fibonacci lines disappear
     - **Simulated cyan candles appear** (W2.A, W2.B, W2.C)
     - Candles are translucent (60% opacity)
     - Labels above endpoint candles
     - Trendline W1 → W2 with retracement percentage
     - Status: "W2 complete - Elliott Wave pattern drawn"

### Test 2: W2 on Real Candle (No Simulated Candles)

1. Follow steps 1-3 from Test 1
2. **Place W2 on a real candle** (not a Fib level):
   - Click on a candle (not on Fib line)
   - Should see:
     - Cyan circle with "W2" label
     - Trendline with retracement percentage
     - **NO simulated candles**
     - Status: "W2 complete"

### Test 3: Undo Functionality

1. Place W0, W1, and W2
2. **Click "Undo Last" button:**
   - W2 should disappear
   - Fibonacci lines should reappear
   - Simulated candles (if any) should disappear
   - Status: "W1 placed - Click for W2"
3. **Click "Undo Last" again:**
   - W1 should disappear
   - Fibonacci lines should disappear
   - Trendline W0→W1 should disappear
   - Status: "Ready to place W0 - Click candle high/low"

### Test 4: Reset Functionality

1. Place W0, W1, W2
2. **Click "Reset" button:**
   - All points should clear
   - All lines and candles should disappear
   - Status: "Ready to place W0 - Click candle high/low"

### Test 5: Rapid Clicking (Bug Fix Verification)

1. Activate Elliott Wave mode
2. **Click three times rapidly** on different candles
3. Should see:
   - All three clicks register correctly
   - W0, W1, W2 all placed
   - No missed clicks or freezing
   - All visual elements render correctly

### Test 6: Touch Gestures (Mobile/Tablet)

1. On touch device, activate Elliott Wave mode
2. **Tap** on candles to place points
3. **Pinch-to-zoom** should work while overlay is active
4. **Pan** should work while overlay is active
5. Rapid taps should register correctly

### Test 7: Deactivation

1. With Elliott Wave active and points placed
2. **Click Elliott Wave button again:**
   - Button should return to gray
   - Overlay should disappear
   - Points and lines should remain visible (for documentation)
   - Or clear based on expected behavior

## Visual Verification Checklist

### Colors & Styling
- [ ] W0, W1, W2 circles are cyan (#00ffff) with white stroke
- [ ] Trendlines are cyan with 80% opacity, 2px width
- [ ] Fibonacci lines are yellow (#facc15), dashed, 50% opacity
- [ ] Simulated candles are cyan, 60% opacity
- [ ] Simulated candles render BELOW real candles (lower z-index)

### Labels
- [ ] W0, W1, W2 labels appear above their respective points
- [ ] Fibonacci percentage labels (23.6%, 38.2%, etc.) on right side
- [ ] W2.A, W2.B, W2.C labels above simulated candles
- [ ] Retracement percentage on W1→W2 trendline

### Interactions
- [ ] Magnet snap pulls clicks to nearest high/low (30px radius)
- [ ] Pulse animation shows on snap
- [ ] Fibonacci snap works (20px threshold)
- [ ] Status text updates correctly
- [ ] Undo button disables when no points
- [ ] Reset button always enabled
- [ ] Buttons have stopPropagation (don't trigger placement)

### Zoom & Pan
- [ ] Elements scale correctly on zoom
- [ ] Elements pan correctly
- [ ] Fibonacci lines extend full width on pan
- [ ] No visual glitches during zoom/pan

## Common Issues & Troubleshooting

### Issue: Clicks don't register
- **Check:** Is the Elliott Wave button blue (active)?
- **Check:** Is the status text showing?
- **Check:** Are you clicking inside the chart area?

### Issue: Magnet snap not working
- **Possible cause:** Clicking too far from candles (>30px)
- **Try:** Click closer to a candle high or low

### Issue: No Fibonacci lines after W1
- **Check:** Did W1 actually get placed? Look for cyan circle
- **Check:** Browser console for errors

### Issue: No simulated candles after W2
- **Expected:** Only shows if W2 placed on Fib level, not real candle
- **Check:** Did you click on a Fib line (yellow dashed) or a candle?

### Issue: Visual artifacts or incorrect rendering
- **Try:** Toggle tool off and on
- **Try:** Zoom/pan to refresh
- **Check:** Browser console for errors

## Expected Console Output

With the fix applied, you should see:
- No errors in browser console
- Smooth state transitions
- No warnings about stale state or closures

## Bug Fix Verification

**Critical:** The stale closure bug has been fixed. Verify:
1. ✅ Rapid clicking works (W0 → W1 → W2 in quick succession)
2. ✅ All three points register
3. ✅ Status text progresses correctly
4. ✅ Visual elements render at each step
5. ✅ No freezing or missed clicks

If any of these fail, the bug is not fully fixed.

## Browser Compatibility

Tested and expected to work on:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Performance Checks

- [ ] No lag when placing points
- [ ] Smooth animations (magnet pulse)
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] Zoom/pan remains smooth with Elliott Wave active

## Final Verification

After completing all tests above:
- [ ] All basic functionality works
- [ ] No console errors
- [ ] Visual appearance matches documentation
- [ ] Rapid clicking works correctly
- [ ] Touch gestures work (if applicable)
- [ ] Zoom/pan work correctly

**If all checks pass: The Elliott Wave tool is fully functional! ✅**

---

## Reporting Issues

If you encounter issues during manual testing:

1. **Check browser console** for errors
2. **Take a screenshot** showing the issue
3. **Note the steps** that led to the issue
4. **Check if it's reproducible**
5. Report with:
   - Browser and version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots/videos
   - Console errors (if any)
