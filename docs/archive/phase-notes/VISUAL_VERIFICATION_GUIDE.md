# Visual Verification Guide

## How to Test the Three Critical Fixes

### Issue 1: Draggable Popout Windows ✅

**What was broken:**
- RSI, MACD, Volume popout windows couldn't be dragged
- They would snap to strange positions or not move at all

**How to test the fix:**
1. Navigate to ChartFullscreenPage (`/chart/fullscreen` or similar)
2. Open the oscillators panel
3. Click the "Pop Out" button on RSI, MACD, or Volume oscillator
4. **Expected behavior:** 
   - The popout window appears as a floating panel
   - You can click and drag the title bar (with grip icon)
   - The window moves smoothly across the screen
   - The window stays within the viewport bounds
   - You can drag it to any corner or edge

**What to look for:**
- ✅ Window follows your mouse/touch smoothly
- ✅ Window doesn't jump to unexpected positions
- ✅ Window can be positioned anywhere on screen
- ✅ Drag handle changes cursor to grab/grabbing

---

### Issue 2: Bottom Positioning ✅

**What was broken:**
- Oscillator panels would extend below the mobile navigation bar
- Users had to scroll to see the full oscillator content

**How to test the fix:**
1. Navigate to ChartFullscreenPage
2. Enable oscillators in docked mode (not popped out)
3. Look at the bottom of the screen
4. **Expected behavior:**
   - Oscillator panel appears above the mobile navigation bar
   - There's a visible gap of 65px between panel bottom and screen bottom
   - Navigation bar is always visible
   - Oscillator content scrolls within its container if needed

**What to look for:**
- ✅ Navigation bar is always visible at bottom
- ✅ Oscillator panel doesn't overlap navigation
- ✅ Content scrolls within the panel if needed
- ✅ Panel has proper spacing (65px) from bottom

---

### Issue 3: Half-Width Toggle ✅

**What was missing:**
- No way to resize floating panels
- Panels were always full width, covering the chart

**How to test the fix:**
1. Navigate to ChartFullscreenPage
2. Pop out an oscillator (RSI, MACD, or Volume)
3. Look for the toggle button in the title bar (next to the Dock button)
4. Click the toggle button
5. **Expected behavior:**
   - Initially: Panel is at default width (400px) with Maximize icon (⛶)
   - After click: Panel expands to 90% of screen width with Minimize icon (⊟)
   - After another click: Panel returns to default width
   - Refresh the page: Panel remembers your preference

**What to look for:**
- ✅ Toggle button is visible in title bar
- ✅ Icon changes: Maximize2 (⛶) for half-width, Minimize2 (⊟) for full-width
- ✅ Panel width animates or changes smoothly
- ✅ Full-width mode is centered (5% margins on each side)
- ✅ Preference persists after page refresh
- ✅ Each oscillator type (RSI, MACD, Volume) remembers its own preference

---

## LocalStorage Verification

To verify the half-width preference is saved:

1. Open browser DevTools (F12)
2. Go to Application tab → Storage → Local Storage
3. Find the domain for your app
4. Look for keys like:
   - `oscillator-rsi-width`
   - `oscillator-macd-width`
   - `oscillator-volume-width`
   - `oscillator-rsi-position-width` (for DraggableOscillatorWindow)
   - `oscillator-macd-position-width`
   - `oscillator-volume-position-width`

**Expected values:**
- `false` = half-width mode (default)
- `true` = full-width mode

---

## Test Scenarios

### Scenario 1: Multiple Panels Side by Side
1. Pop out RSI oscillator → Set to half-width → Drag to left side
2. Pop out MACD oscillator → Set to half-width → Drag to right side
3. **Expected:** Both panels visible side by side, chart visible in background

### Scenario 2: Panel Persistence
1. Pop out RSI oscillator
2. Toggle to full-width
3. Drag it to top-right corner
4. Refresh the page
5. Pop out RSI oscillator again
6. **Expected:** Panel opens in full-width mode at the saved position

### Scenario 3: Mobile/Small Screen
1. Resize browser to mobile width (< 768px)
2. Check docked oscillator panel
3. **Expected:** Panel bottom is above navigation bar
4. Scroll within the oscillator content
5. **Expected:** Navigation bar stays fixed at bottom

---

## Regression Testing

Make sure these still work:
- [ ] Drawing tools on the chart
- [ ] Zoom and pan on the chart
- [ ] Other indicators (not oscillators)
- [ ] Menu interactions
- [ ] Switching between different crypto pairs
- [ ] Switching timeframes

---

## Known Limitations

1. **Window Resize:** If the browser window is resized while a panel is in full-width mode, the panel width doesn't update automatically. Users can toggle width off and on to recalculate.
   - This is an acceptable trade-off to avoid adding a window resize listener
   - Could be improved in a future update if users report issues

2. **Multiple Monitors:** If you drag a panel to a second monitor and then disconnect that monitor, the panel position might be off-screen. localStorage will still have the position saved.
   - The `useDraggable` hook has validation to keep positions within reasonable bounds on load
   - If issues occur, users can clear localStorage for that specific position key

---

## Success Criteria

All three issues are considered fixed if:
- ✅ Users can freely drag popout windows anywhere on screen
- ✅ Docked oscillator panel stays above mobile navigation bar
- ✅ Users can toggle between half-width and full-width modes
- ✅ Width preferences persist across page refreshes
- ✅ No JavaScript errors in console
- ✅ No TypeScript compilation errors
- ✅ No security vulnerabilities introduced
