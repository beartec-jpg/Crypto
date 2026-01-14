# Quick Start: Testing Elliott Wave Candle Alignment

## 🚀 How to Test the Fix

### Step 1: Access CryptoSandbox
1. Start the development server: `npm run dev`
2. Navigate to: `http://localhost:5173/crypto/sandbox`
3. Login with admin credentials

### Step 2: Activate Elliott Wave
1. Look for the Elliott Wave icon in the left toolbar (📈 TrendingUp icon)
2. Click to activate Elliott Wave mode
3. Status should show "Click to place W0"

### Step 3: Place Wave Points
1. **W0**: Click on a candle high or low (marks start of wave 1)
2. **W1**: Click on another high/low (marks end of wave 1)
3. **W2**: Click on a third point (marks end of wave 2 correction)

### Step 4: Observe Simulated Candles
After placing W2, cyan (light blue) simulated ABC candles should appear showing the W2 correction pattern.

### ✅ What to Check

**Perfect Alignment** (FIXED):
- Cyan simulated candles should have the **same width** as green/red real candles
- Candle centers should line up perfectly
- No overlapping or gaps

**Labels**:
- Look for labels above cyan candles:
  - `W2.A-start` - Start of wave A
  - `W2.A` - End of wave A
  - `W2.B` - End of wave B  
  - `W2.C` - End of wave C (same as W2 point)

**Zoom Test**:
- Use mouse wheel to zoom in/out
- Both real and simulated candles should change width **together**
- Alignment should be maintained

**Pan Test**:
- Click and drag to pan left/right
- Alignment should remain perfect throughout

**Timeframe Test**:
- Change interval dropdown (1m, 5m, 15m, 1h, 4h, 1d)
- Generate new simulated candles for each
- Verify alignment works for all timeframes

## 🎨 Visual Indicators

### Real Candles
- **Green** = Bullish (close > open)
- **Red** = Bearish (close < open)
- Solid, opaque

### Simulated Candles (ABC Wave)
- **Cyan** (#00ffff)
- 70% opacity
- Same width and positioning as real candles

## 🐛 What NOT to See (Old Bugs - Fixed)

- ❌ Different widths between real and simulated candles
- ❌ Simulated candles overlapping real candles
- ❌ "Blocky" or "noisy" appearance
- ❌ Candles getting out of sync when zooming
- ❌ Gaps or spacing inconsistencies

## 📸 Screenshot Checklist

Take screenshots showing:
1. ✅ Default view with aligned candles
2. ✅ Zoomed in view (fewer candles, wider)
3. ✅ Zoomed out view (many candles, narrower)
4. ✅ Different timeframe (e.g., 1h vs 4h)
5. ✅ Labels clearly visible above candles

## 🔧 Troubleshooting

**Simulated candles not appearing?**
- Make sure you placed all 3 points (W0, W1, W2)
- Check that Elliott Wave mode is active (icon highlighted)
- Try refreshing the page

**Candles look misaligned?**
- This should NOT happen with the fix
- If you see misalignment, please report with:
  - Screenshot
  - Browser and version
  - Timeframe used
  - Zoom level

**Can't access sandbox?**
- Admin access required
- Check authentication status
- Verify you're on `/crypto/sandbox` route

## 📊 Expected Performance

- **Render time**: < 100ms for typical viewport
- **Smooth zoom**: No lag or stuttering
- **Smooth pan**: Fluid dragging
- **No console errors**: Check browser console (F12)

## ✅ Sign-Off Criteria

After testing, confirm:
- [ ] Simulated candles align perfectly with real candles
- [ ] Works across multiple timeframes (tested at least 3)
- [ ] Zoom in/out maintains alignment
- [ ] Pan left/right maintains alignment
- [ ] Labels render correctly
- [ ] No visual artifacts or overlapping
- [ ] Performance is acceptable (< 100ms renders)
- [ ] No console errors

## 📞 Need Help?

- Check `docs/CANDLE_ALIGNMENT_FIX.md` for technical details
- Review `docs/TEST_VALIDATION_PLAN.md` for comprehensive tests
- See `FINAL_IMPLEMENTATION_SUMMARY.md` for complete overview

---

**Quick Reference**:
- File changed: `client/src/pages/CryptoSandbox.tsx`
- Lines modified: 2356-2401 (simulated candle rendering)
- Key fix: Use same `dynamicCandleWidth` for both candle types
