# ChartFullscreenPage Refactoring - New Files Created

This document describes the 8 new hooks and components created to enable refactoring of `ChartFullscreenPage.tsx` from 1192 lines down to ~200-250 lines.

**Status:** ✅ Files created and verified. Ready for integration.

---

## Created Files

### Hooks (5 files)

#### 1. `client/src/hooks/useChartInstance.ts` (165 lines)
**Purpose:** Consolidate ALL chart creation, resize handling, and cleanup logic

**Key Features:**
- Creates and initializes lightweight-charts instance
- Handles chart resize with debouncing (100ms)
- Validates dimensions before initialization
- Automatic retry on invalid dimensions using ResizeObserver
- Cleanup on unmount
- Returns: `chartRef`, `candleSeriesRef`, `isReady`, `fitContent()`

**Usage:**
```typescript
const { chartRef, candleSeriesRef, isReady, fitContent } = useChartInstance({
  containerRef,
  totalOscillatorHeight,
  topToolbarHeight: TOP_TOOLBAR_HEIGHT,
  mobileNavHeight: MOBILE_NAV_HEIGHT,
});
```

---

#### 2. `client/src/hooks/useDrawingInteraction.ts` (163 lines)
**Purpose:** Handle all drawing selection via click/touch events

**Key Features:**
- Mouse click handling for drawing selection
- Touch gesture detection (tap vs pan/scroll)
- Multiple drawing hit detection with modal selection
- Quick menu positioning for selected drawings
- Touch thresholds: 150ms tap duration, 10px movement threshold

**Returns:**
- `selectedDrawingId`
- `setSelectedDrawingId`
- `quickMenuPosition`
- `closeQuickMenu`
- `showSelectionModal`
- `nearbyDrawings`
- `closeSelectionModal`
- `selectFromModal`
- `handleChartClick`
- `handleTouchEnd`

---

#### 3. `client/src/hooks/useOscillatorPanel.ts` (79 lines)
**Purpose:** Manage oscillator selection, popped out state, and mode handling

**Key Features:**
- Tracks selected oscillators (Set<string>)
- Tracks popped out oscillators (Set<string>)
- Calculates docked oscillator count and total height
- Supports oscillator display modes: 'bottom', 'mini', 'popout', 'off'

**Returns:**
- `selectedOscillators`
- `poppedOutOscillators`
- `dockedCount`
- `totalHeight`
- `toggleOscillator(id, mode?)`
- `popoutOscillator(id)`
- `showSelector`
- `setShowSelector`

---

#### 4. `client/src/hooks/useDrawingPrimitives.ts` (103 lines)
**Purpose:** Manage attaching/detaching chart primitives for drawings

**Key Features:**
- Attaches/detaches primitives based on drawing array
- Updates existing primitives instead of recreating
- Handles selected drawing highlighting
- Removes primitives for deleted or actively edited drawings
- Hides all primitives when `visible` is false

**Usage:**
```typescript
useDrawingPrimitives({
  chartRef,
  candleSeriesRef,
  drawings,
  selectedDrawingId,
  activeEdit,
  visible,
});
```

---

#### 5. `client/src/hooks/useHTFDataCache.ts` (99 lines)
**Purpose:** Fetch and cache higher-timeframe data for EMA overlays

**Key Features:**
- Fetches data from Binance API for HTF timeframes
- Caches data by symbol and timeframe (ref-based, persistent)
- Clears cache on symbol change
- Only fetches unique timeframes not already cached
- Returns loading state

**Returns:**
- `htfDataCache` (ref to Record<string, CandleData[]>)
- `isLoading`

---

### Components (3 files)

#### 6. `client/src/components/chart/FullscreenChartToolbar.tsx` (63 lines)
**Purpose:** Top toolbar with symbol/timeframe selectors and close button

**Props:**
- `symbol: string`
- `onSymbolChange: (symbol: string) => void`
- `timeframe: string`
- `onTimeframeChange: (tf: string) => void`
- `watchlistTickers: string[]`
- `onClose: () => void`

**Features:**
- Close button with X icon
- Symbol display in center (formatted)
- Symbol selector dropdown (from watchlist)
- Timeframe selector (1m, 5m, 15m, 1h, 4h, 1d)

---

#### 7. `client/src/components/oscillators/PoppedOutOscillators.tsx` (81 lines)
**Purpose:** Render all popped out oscillator windows

**Props:**
- `selectedOscillators: Set<string>`
- `poppedOutOscillators: Set<string>`
- `oscillatorData: OscillatorData`
- `candles: CandleData[]`
- `onPopout: (id: string) => void`

**Features:**
- Renders RSIPanel, MACDPanel, VolumePanel in draggable windows
- Uses DraggableOscillatorWindow component
- Position persistence via localStorage (storageKey)
- Default positions: RSI (100,100), MACD (150,150), Volume (200,200)

**Oscillator Config:**
```typescript
{ id: 'rsi', title: 'RSI (14)', storageKey: 'oscillator-rsi-position', defaultPos: { x: 100, y: 100 } }
{ id: 'macd', title: 'MACD (12, 26, 9)', storageKey: 'oscillator-macd-position', defaultPos: { x: 150, y: 150 } }
{ id: 'volume', title: 'Volume', storageKey: 'oscillator-volume-position', defaultPos: { x: 200, y: 200 } }
```

---

#### 8. `client/src/components/chart/ChartLoadingOverlay.tsx` (30 lines)
**Purpose:** Loading and error state overlays for chart

**Props:**
- `isLoading: boolean`
- `error: string | null`

**Features:**
- Displays spinner with "Loading chart..." when loading
- Displays error message when error is present
- Returns null when neither loading nor error
- Positioned absolutely with z-index 10

---

## Dependencies

All files use existing imports from the codebase:

### From `@/lib/constants/layout`:
- `RESIZE_DEBOUNCE_MS` (100ms)
- `MOBILE_NAV_HEIGHT` (65px)
- `TOP_TOOLBAR_HEIGHT` (80px)
- `TOUCH_TAP_THRESHOLD` (150ms)
- `TOUCH_MOVE_THRESHOLD` (10px)
- `OSCILLATOR_PANEL_HEIGHT_PER` (120px)

### From `@/lib`:
- `drawingHitDetection` - `findDrawingsNearClick()`
- `chartPrimitives` - `createDrawingPrimitive()`, primitive classes
- `chart/priceUtils` - `formatTickerDisplay()`
- `utils/binance` - `convertTimeframe()`

### From `@/types`:
- `drawing` - `Drawing`, `ChartDrawingTool`

### From `@/hooks`:
- `useOscillatorData` - `OscillatorData` type

### From `@/components`:
- `ui/button`, `ui/select` - Shadcn UI components
- `indicators/oscillators/*Panel` - RSIPanel, MACDPanel, VolumePanel
- `draggable/DraggableOscillatorWindow`

### From external packages:
- `react` - useState, useEffect, useRef, useCallback, useMemo
- `lightweight-charts` - createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries
- `lucide-react` - X icon

---

## Code Quality

✅ **Code Review:** Completed with no critical issues  
✅ **Security Scan:** 0 alerts (CodeQL JavaScript analysis)  
✅ **TypeScript:** All files properly typed with interfaces  
✅ **Imports:** All imports verified to exist in codebase  
✅ **Exports:** All files export expected functions/components  
✅ **Line Counts:** Match expected ranges from specification  

---

## Next Steps

A follow-up PR will:
1. Refactor `ChartFullscreenPage.tsx` to use these new modules
2. Replace inline logic with hook calls
3. Reduce file size from 1192 lines to ~200-250 lines
4. Improve testability and maintainability

---

## Notes

- **IMPORTANT:** This PR only CREATES the new files. ChartFullscreenPage.tsx was NOT modified.
- All files follow existing codebase patterns and conventions
- Code is ready for immediate integration
- No breaking changes to existing functionality
