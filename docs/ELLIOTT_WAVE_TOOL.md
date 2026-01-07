# Elliott Wave Tool Integration - CryptoSandbox

## Overview

The Elliott Wave Impulse tool has been integrated into CryptoSandbox, allowing users to interactively place W0, W1, and W2 points with automatic Fibonacci retracement level generation and simulated W2 ABC correction candles.

## Features

### 1. Toolbar Button
- Located in the left toolbar after the existing Elliott Wave pattern buttons
- Icon: TrendingUp (📈)
- Title: "Elliott Wave Impulse"
- Toggles Elliott Wave mode on/off

### 2. Wave Placement Workflow

#### Step 1: Place W0 (Wave 0 - Start)
- Click anywhere on the chart
- Tool automatically snaps to nearest candle high or low within 30px radius
- Status: "Ready to place W0 - Click candle high/low"

#### Step 2: Place W1 (Wave 1 - Impulse End)
- Click to place the second point
- Tool snaps to candle high/low
- Fibonacci retracement levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) are calculated and displayed
- Status: "W0 placed - Click for W1"

#### Step 3: Place W2 (Wave 2 - Retracement End)
- Click either:
  - A candle high/low (with magnet snap)
  - A Fibonacci retracement level line (snaps to exact level price)
- Simulated W2 ABC correction candles are generated and rendered
- Status: "W1 placed - Click for W2 (candle or fib level)"

#### Step 4: Complete
- Elliott Wave pattern is complete
- Status: "W2 complete - Elliott Wave pattern drawn"

### 3. Visual Elements

#### Simulated W2 Candles
- **Color**: Translucent cyan (#00ffff) with 60% opacity
- **Z-index**: Rendered BEFORE real candles (lower z-index)
- **Labels**: W2.A, W2.B, W2.C displayed above each candle
- **Structure**:
  - W2.A: 61.8% of W1→W2 move
  - W2.B: 50% retracement of W2.A
  - W2.C: Completes to W2 endpoint

#### Trendlines
- **Color**: Cyan (#00ffff) with 80% opacity
- **Width**: 2px
- Connects W0 → W1 → W2
- Retracement percentage label on W1→W2 line

#### Wave Points
- **Color**: Cyan circles with white stroke
- **Radius**: 4px
- **Labels**: W0, W1, W2 displayed above each point

#### Fibonacci Levels (during W2 placement)
- **Color**: Yellow (#facc15) with 50% opacity
- **Style**: Dashed lines (5,5)
- **Labels**: Percentage labels (e.g., "50.0%") on right side

### 4. Controls

#### Reset Button
- Located in top-right corner during Elliott Wave mode
- Red background
- Clears all placed points and returns to W0 placement

#### Undo Button
- Located next to Reset button
- Orange background when enabled, gray when disabled
- Removes the last placed point
- Automatically recalculates Fibonacci levels if undoing from W2→W1

### 5. State Management

The tool uses the custom `useElliottWave` hook which manages:

```typescript
interface UseElliottWaveResult {
  mode: 'idle' | 'placing_w0' | 'placing_w1' | 'placing_w2' | 'complete';
  placedPoints: ElliottWavePoint[];
  simulatedCandles: SimulatedCandle[];
  fibLevels: { ratio: number; price: number; label: string }[];
  
  activateMode: () => void;
  deactivateMode: () => void;
  placePoint: (time: number, price: number, snappedToHigh: boolean) => void;
  reset: () => void;
  undo: () => void;
  getStatusText: () => string;
  isActive: boolean;
}
```

### 6. Integration with Existing Tools

- **Non-interfering**: Elliott Wave mode is mutually exclusive with other drawing tools
- **Magnet Snap**: Uses existing `findMagnetPoint` function for candle snapping
- **Touch Support**: Full touch support with pinch-to-zoom and pan gestures
- **Crosshair Mode**: Automatically disabled when Elliott Wave mode is active

## Technical Implementation

### Files Modified
1. `/client/src/pages/CryptoSandbox.tsx` - Main integration
2. `/client/src/hooks/useElliottWave.ts` - State management hook (new)

### D3 Rendering
- Elliott Wave elements are rendered in a dedicated SVG group (`elliott-wave`)
- Rendered BEFORE candles group to ensure lower z-index
- Redraws on zoom/pan events
- Respects clip path boundaries

### Click Handling
- New `handleElliottWaveClick` function
- 20px threshold for Fibonacci level snapping
- Debounced to prevent double-clicks (100ms)
- Touch-optimized with proper event handling

## Usage Example

1. Click Elliott Wave button in toolbar (TrendingUp icon)
2. Click on a candle low to place W0
3. Click on a candle high to place W1 (Fib levels appear)
4. Click on the 61.8% Fib level to place W2
5. Observe cyan simulated W2.A, W2.B, W2.C candles
6. Use Undo to adjust or Reset to start over
7. Click Elliott Wave button again to exit mode

## Testing Checklist

- [ ] Elliott Wave button appears in toolbar
- [ ] Clicking button activates Elliott Wave mode
- [ ] Status text updates correctly
- [ ] W0 snaps to candle high/low
- [ ] W1 snaps to candle high/low
- [ ] Fibonacci levels generate after W1
- [ ] W2 can snap to candle OR fib level
- [ ] Cyan simulated candles render with correct opacity
- [ ] Wave labels (W0, W1, W2, W2.A, W2.B, W2.C) display
- [ ] Trendlines connect points correctly
- [ ] Retracement % displays on W1→W2 line
- [ ] Reset button clears everything
- [ ] Undo button removes last point
- [ ] No interference with other drawing tools
- [ ] Touch gestures work correctly
- [ ] Zoom/pan updates rendering correctly

## Future Enhancements

1. **Wave 3 Projection**: Add W3 placement with extension levels
2. **Multiple Timeframes**: Allow multiple Elliott Wave structures
3. **Save/Load**: Persist Elliott Wave patterns
4. **Validation**: Real-time Elliott Wave rule validation
5. **Templates**: Pre-defined wave templates (Leading Diagonal, Ending Diagonal)
6. **Custom Fib Levels**: Allow users to add/remove Fibonacci ratios
7. **Color Customization**: User-defined colors for waves and candles
