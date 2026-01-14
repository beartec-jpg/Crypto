# Test Validation Plan for Elliott Wave Candle Alignment Fix

## Overview

This document outlines the testing strategy to validate that simulated Elliott ABC candles now perfectly align with real candles across all timeframes after fixing the width calculation issue.

## Pre-requisites

- CryptoSandbox page must be accessible
- Elliott Wave feature must be functional
- Real market data must load successfully
- User must have admin access to access sandbox

## Test Cases

### 1. Basic Alignment Test

**Objective**: Verify simulated candles align with real candles at default zoom level

**Steps**:
1. Navigate to CryptoSandbox page
2. Load default symbol (BTCUSDT) with 1h interval
3. Activate Elliott Wave mode (click wave icon)
4. Place W0 point (click on a candle high/low)
5. Place W1 point (click on another candle high/low)
6. Place W2 point (click on a third candle high/low)
7. Observe simulated cyan ABC candles appear

**Expected Results**:
- [ ] Simulated candles (cyan) have same width as real candles (green/red)
- [ ] Simulated candle centers align with real candle centers
- [ ] No overlapping between simulated and real candles
- [ ] No gaps or spacing issues

### 2. Timeframe Consistency Test

**Objective**: Verify alignment works across different timeframes

**Steps**:
For each timeframe (1m, 5m, 15m, 1h, 4h, 1d):
1. Load candles for the timeframe
2. Activate Elliott Wave and place 3 points
3. Observe simulated candles
4. Verify alignment

**Expected Results**:
- [ ] 1m timeframe: Perfect alignment
- [ ] 5m timeframe: Perfect alignment
- [ ] 15m timeframe: Perfect alignment
- [ ] 1h timeframe: Perfect alignment
- [ ] 4h timeframe: Perfect alignment
- [ ] 1d timeframe: Perfect alignment

### 3. Zoom Operations Test

**Objective**: Verify alignment maintains during zoom operations

**Steps**:
1. Load default candles with Elliott Wave active
2. Place 3 points to generate simulated candles
3. Zoom in using mouse wheel or pinch gesture
4. Observe candle widths and alignment
5. Zoom out to default level
6. Zoom out further
7. Observe alignment at each zoom level

**Expected Results**:
- [ ] At default zoom: Perfect alignment
- [ ] When zoomed in (fewer visible candles): Candles get wider proportionally
- [ ] When zoomed out (more visible candles): Candles get narrower proportionally
- [ ] Both real and simulated candles change width together
- [ ] Alignment maintained at all zoom levels

### 4. Pan Operations Test

**Objective**: Verify alignment maintains during pan operations

**Steps**:
1. Load candles with Elliott Wave active
2. Place 3 points to generate simulated candles
3. Pan left (drag chart to the left)
4. Observe candles as new ones come into view
5. Pan right (drag chart to the right)
6. Observe candles throughout

**Expected Results**:
- [ ] Alignment maintained when panning left
- [ ] Alignment maintained when panning right
- [ ] No flickering or width jumps during pan
- [ ] Candles at all positions maintain consistent width

### 5. Label Rendering Test

**Objective**: Verify ABC wave labels render correctly above simulated candles

**Steps**:
1. Generate simulated ABC candles
2. Locate the labeled candles:
   - W2.A-start
   - W2.A
   - W2.B-start (same as W2.A)
   - W2.B
   - W2.C-start (same as W2.B)
   - W2.C (same as W2)

**Expected Results**:
- [ ] All labels are visible and readable
- [ ] Labels appear above their respective candles
- [ ] Labels use cyan color matching simulated candles
- [ ] Labels don't overlap with candles or each other
- [ ] Only labeled candles show labels (internal candles are unlabeled)

### 6. Multi-Symbol Test

**Objective**: Verify alignment works with different price ranges and symbols

**Steps**:
For each symbol:
1. Load symbol (BTCUSDT, ETHUSDT, BNBUSDT)
2. Generate simulated candles
3. Verify alignment

**Expected Results**:
- [ ] BTCUSDT (high price ~$40k+): Perfect alignment
- [ ] ETHUSDT (medium price ~$2k+): Perfect alignment  
- [ ] BNBUSDT (lower price ~$300+): Perfect alignment

### 7. Window Resize Test

**Objective**: Verify alignment adjusts correctly when window size changes

**Steps**:
1. Generate simulated candles at default window size
2. Resize browser window smaller
3. Observe candle rendering
4. Resize browser window larger
5. Observe candle rendering

**Expected Results**:
- [ ] Candles re-render with appropriate width for new window size
- [ ] Alignment maintained after resize
- [ ] Both real and simulated candles adjust together

### 8. Edge Cases Test

**Objective**: Test boundary conditions and edge cases

**Steps**:
Test scenarios:
1. Very few visible candles (< 10)
2. Many visible candles (> 500)
3. Single simulated candle
4. Long ABC sequence (100+ candles)

**Expected Results**:
- [ ] Minimum width (1px) respected when many candles visible
- [ ] Maximum width (20px) respected when few candles visible
- [ ] Alignment works with minimal simulated candles
- [ ] Alignment works with extensive simulated sequences

## Visual Regression Checklist

**Before Fix Issues (Should NOT appear)**:
- [ ] No overlapping candles
- [ ] No misaligned candle centers
- [ ] No different widths between real and simulated candles
- [ ] No "blocky noisy overlay" appearance
- [ ] No gaps or uneven spacing

**After Fix Expected**:
- [ ] Clean, professional appearance
- [ ] Consistent geometry between real and simulated candles
- [ ] Smooth transitions during zoom/pan
- [ ] Clear visual distinction (color) between real and simulated

## Performance Checklist

- [ ] No noticeable lag when rendering simulated candles
- [ ] Smooth zoom operations
- [ ] Smooth pan operations
- [ ] No memory leaks after multiple wave generations
- [ ] Acceptable render time (< 100ms for typical viewport)

## Browser Compatibility

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium-based)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Code Quality Validation

- [x] TypeScript syntax correct
- [x] No new console errors
- [x] Clean git diff (minimal changes)
- [x] Comments explain the approach
- [ ] No regressions in existing functionality
- [ ] Security: No new vulnerabilities introduced

## Documentation Validation

- [x] Code comments are clear and accurate
- [x] CANDLE_ALIGNMENT_FIX.md document created
- [x] Implementation details documented
- [ ] Screenshots showing before/after (pending manual test)

## Sign-Off

Once all test cases pass:
- [ ] Developer verification complete
- [ ] Code review approved
- [ ] QA testing complete
- [ ] Ready for merge

## Notes

- This is a **rendering-only fix** - no changes to business logic
- The simulator (`simulate_abc_elliott.py`) is unchanged
- The Elliott Wave hook (`useElliottWave.ts`) is unchanged
- Only the rendering width calculation was modified

## Automated Testing Considerations

For future CI/CD:
- Visual regression tests comparing rendered SVG
- Unit tests for width calculation logic
- Integration tests for Elliott Wave feature end-to-end
- Performance benchmarks for rendering speed
