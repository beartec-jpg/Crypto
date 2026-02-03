# Phase 6 Priority 3: Oscillator Panel Architecture

## Component Hierarchy

```
CryptoIndicators.tsx (6,692 lines)
│
├─→ Main Chart
│   └─→ Candlestick + Overlays
│
└─→ OscillatorContainer.tsx (363 lines)
    ├─→ Responsive Grid Layout (1-4 columns)
    │
    ├─→ RSIPanel.tsx (76 lines)
    │   ├─ Chart: RSI line
    │   ├─ Reference Lines: 30, 50, 70
    │   ├─ Zones: Overbought (red), Oversold (green)
    │   └─ Divergence Meter
    │
    ├─→ MACDPanel.tsx (77 lines)
    │   ├─ Chart: MACD line, Signal line, Histogram
    │   ├─ Colors: Green (positive), Red (negative)
    │   ├─ Reference Line: Zero
    │   └─ Divergence Meter
    │
    ├─→ OBVPanel.tsx (65 lines)
    │   ├─ Chart: OBV line
    │   ├─ Trend Direction: Rising/Falling
    │   └─ Divergence Meter
    │
    ├─→ MFIPanel.tsx (76 lines)
    │   ├─ Chart: MFI line
    │   ├─ Reference Lines: 20, 50, 80
    │   ├─ Zones: Overbought (red), Oversold (green)
    │   └─ Divergence Meter
    │
    ├─→ StochasticPanel.tsx (79 lines)
    │   ├─ Chart: %K line, %D line
    │   ├─ Reference Lines: 20, 80
    │   ├─ Zones: Overbought (80-100), Oversold (0-20)
    │   └─ Divergence Meter
    │
    ├─→ WilliamsRPanel.tsx (76 lines)
    │   ├─ Chart: Williams %R line
    │   ├─ Scale: Inverted (0 to -100)
    │   ├─ Reference Lines: -20, -50, -80
    │   ├─ Zones: Overbought (-20 to 0), Oversold (-100 to -80)
    │   └─ Divergence Meter
    │
    ├─→ CCIPanel.tsx (77 lines)
    │   ├─ Chart: CCI line
    │   ├─ Reference Lines: -100, 0, +100
    │   ├─ Zones: Overbought (+100), Oversold (-100)
    │   └─ Divergence Meter
    │
    └─→ ADXPanel.tsx (80 lines)
        ├─ Chart: ADX line, +DI line, -DI line
        ├─ Reference Lines: 20, 40
        ├─ Zones: Weak (<20), Moderate (20-40), Strong (>40)
        └─ Trend Strength Meter
```

## Data Flow

```
User Interaction
      ↓
CryptoIndicators.tsx
      ↓
  indicators state
  - rsi: { show, period }
  - macd: { show, fast, slow, signal }
  - obv: { show }
  - mfi: { show, period }
  - stochRSI: { show, period }
  - williamsR: { show, period }
  - cci: { show, period }
  - adx: { show, period }
      ↓
OscillatorContainer.tsx
      ↓
  Calculate Indicator Data
  - calculateRSI(candles, period)
  - calculateMACD(candles, fast, slow, signal)
  - calculateOBV(candles)
  - calculateMFI(candles, period)
  - calculateStochasticRSI(candles, period)
  - calculateWilliamsR(candles, period)
  - calculateCCI(candles, period)
  - calculateADX(candles, period)
      ↓
  Pass to Individual Panels
      ↓
  Individual Oscillator Panels
      ↓
  Create Chart with lightweight-charts
      ↓
  Display Interactive Chart
      ↓
  User Interaction (zoom, pan, hover)
      ↓
  Sync with Main Chart Timeframe
```

## Props Interface Pattern

### Common Props (All Panels)
```typescript
interface OscillatorPanelProps {
  data: { time: number; value: number }[];
  period?: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}
```

### MACD-Specific Props
```typescript
interface MACDPanelProps {
  macdData: { time: number; value: number }[];
  signalData: { time: number; value: number }[];
  histogramData: { time: number; value: number; color: string }[];
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}
```

### ADX-Specific Props
```typescript
interface ADXPanelProps {
  data: { time: number; adx: number; plusDI: number; minusDI: number }[];
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}
```

### Stochastic-Specific Props
```typescript
interface StochasticPanelProps {
  data: { time: number; k: number; d: number }[];
  period: number;
  candles: { time: number }[];
  onChartCreated?: (chart: IChartApi) => void;
  syncWithMainChart?: boolean;
  mainChartVisibleRange?: any;
}
```

## Chart Lifecycle

```
Component Mount
      ↓
useEffect Triggered
      ↓
Check Container Ref & Data
      ↓
Create Chart Instance
  - width: container.clientWidth
  - height: 200px
  - theme: dark (#1e293b background)
  - grid: #334155
      ↓
Add Series
  - Line Series (main indicator)
  - Reference Lines (optional)
  - Zone Shading (optional)
      ↓
Set Data
  - Map data to Time format
  - Apply to series
      ↓
Configure Scale
  - scaleMargins: { top: 0.1, bottom: 0.1 }
      ↓
Notify Parent
  - onChartCreated(chart)
      ↓
Sync with Main Chart
  - if syncWithMainChart enabled
  - setVisibleRange(mainChartVisibleRange)
      ↓
Render Complete
      ↓
User Interacts
  - Zoom
  - Pan
  - Hover (crosshair)
      ↓
Component Unmount
      ↓
Cleanup
  - chart.remove()
```

## Indicator Calculations

### Momentum Indicators
- **RSI**: Relative Strength Index (14 period)
- **Stochastic RSI**: %K and %D lines (14 period)

### Trend Indicators
- **MACD**: Moving Average Convergence Divergence (12, 26, 9)
- **ADX**: Average Directional Index with +DI/-DI (14 period)

### Volume Indicators
- **OBV**: On-Balance Volume (cumulative)
- **MFI**: Money Flow Index (14 period, volume-weighted)

### Other Indicators
- **Williams %R**: Williams Percent Range (14 period)
- **CCI**: Commodity Channel Index (20 period)

## Reference Lines & Zones

### RSI
- **Overbought**: 70 (red zone)
- **Neutral**: 50 (reference line)
- **Oversold**: 30 (green zone)

### MFI
- **Overbought**: 80 (red zone)
- **Neutral**: 50 (reference line)
- **Oversold**: 20 (green zone)

### Stochastic RSI
- **Overbought**: 80-100 (red zone)
- **Oversold**: 0-20 (green zone)

### Williams %R
- **Overbought**: -20 to 0 (red zone)
- **Neutral**: -50 (reference line)
- **Oversold**: -100 to -80 (green zone)

### CCI
- **Overbought**: +100 (red zone)
- **Neutral**: 0 (reference line)
- **Oversold**: -100 (green zone)

### ADX
- **Weak Trend**: 0-20
- **Moderate Trend**: 20-40
- **Strong Trend**: 40+

### MACD
- **Zero Line**: Crossover point
- **Histogram**: Green (positive), Red (negative)

### OBV
- **No fixed zones**: Trend-based interpretation

## State Management

```
CryptoIndicators.tsx
      ↓
useIndicatorState() hook
      ↓
  indicators = {
    rsi: {
      show: boolean,
      period: number,
      setShow: (v: boolean) => void,
      setPeriod: (v: number) => void
    },
    macd: {
      show: boolean,
      fast: number,
      slow: number,
      signal: number,
      setShow: (v: boolean) => void,
      setFast: (v: number) => void,
      setSlow: (v: number) => void,
      setSignal: (v: number) => void
    },
    // ... similar for all 8 oscillators
  }
      ↓
Pass to OscillatorContainer
      ↓
Filter & Render Active Oscillators
```

## Responsive Layout

```
Mobile (< 1024px)
┌──────────────────┐
│   RSI Panel      │
├──────────────────┤
│   MACD Panel     │
├──────────────────┤
│   OBV Panel      │
├──────────────────┤
│   MFI Panel      │
├──────────────────┤
│   StochRSI Panel │
├──────────────────┤
│   Williams R     │
├──────────────────┤
│   CCI Panel      │
├──────────────────┤
│   ADX Panel      │
└──────────────────┘

Desktop (≥ 1024px)
┌─────────┬─────────┬─────────┬─────────┐
│   RSI   │  MACD   │   OBV   │   MFI   │
├─────────┼─────────┼─────────┼─────────┤
│StochRSI │Williams │   CCI   │   ADX   │
└─────────┴─────────┴─────────┴─────────┘
```

## Features

### Time Synchronization
- All oscillator charts sync with main chart zoom/pan
- Controlled by `syncOscillatorScale` setting
- Uses `mainChartVisibleRange` prop

### Divergence Detection
- Each oscillator has divergence meter
- Shows bullish/bearish divergence strength
- Visual indicator (bear/bull emoji + strength level)

### Trend Strength (ADX only)
- Separate trend strength meter
- Shows weak/moderate/strong trend zones
- Based on ADX value thresholds

### Chart Callbacks
- `onChartCreated` callback for parent
- Enables external chart manipulation
- Used for synchronized scrolling

### Tier Restrictions
- Free tier: RSI + MACD only
- Paid tier: All 8 oscillators
- Controlled by `isPaidTier` prop

## File Structure

```
/client/src/
├── pages/
│   └── CryptoIndicators.tsx (6,692 lines)
│       └── Uses OscillatorContainer
│
├── components/
│   └── indicators/
│       ├── OscillatorContainer.tsx (363 lines)
│       │   └── Uses all 8 oscillator panels
│       │
│       └── oscillators/
│           ├── index.ts (8 exports)
│           ├── RSIPanel.tsx (76 lines)
│           ├── MACDPanel.tsx (77 lines)
│           ├── OBVPanel.tsx (65 lines)
│           ├── MFIPanel.tsx (76 lines)
│           ├── StochasticPanel.tsx (79 lines)
│           ├── WilliamsRPanel.tsx (76 lines)
│           ├── CCIPanel.tsx (77 lines)
│           └── ADXPanel.tsx (80 lines)
│
└── lib/
    └── indicators/
        ├── momentum.ts (calculateRSI, calculateMACD)
        ├── volume.ts (calculateOBV, calculateMFI)
        └── index.ts (calculateStochasticRSI, etc.)
```

## Dependencies

### npm packages
- `lightweight-charts`: Chart rendering
- `react`: Component framework
- `@/components/ui/card`: UI components

### Internal dependencies
- `@/lib/indicators/*`: Calculation functions
- `@/hooks/useIndicatorState`: State management

## Testing

### Test IDs
All panels have `data-testid` attributes:
- `chart-rsi`
- `chart-macd`
- `chart-obv`
- `chart-mfi`
- `chart-stoch-rsi`
- `chart-williams-r`
- `chart-cci`
- `chart-adx`

### Manual Testing Checklist
- [ ] RSI displays with 30/70 zones
- [ ] MACD histogram colors work
- [ ] OBV shows volume trend
- [ ] MFI displays with 20/80 lines
- [ ] StochRSI shows %K/%D crossovers
- [ ] Williams %R inverted scale
- [ ] CCI displays ±100 zones
- [ ] ADX shows 3 lines correctly
- [ ] Period changes update charts
- [ ] Charts sync with main chart
- [ ] Divergence meters work
- [ ] Responsive layout works

## Performance Considerations

### Chart Lifecycle
- Charts created/destroyed on mount/unmount
- Proper cleanup prevents memory leaks
- React useEffect manages lifecycle

### Data Processing
- Calculations done in OscillatorContainer
- Memoization opportunities available
- Could optimize with useMemo/useCallback

### Rendering
- Conditional rendering based on `show` state
- Only active oscillators are rendered
- Lazy loading potential for future

## Future Enhancements

### Potential Improvements
1. **Shared OscillatorChart Utility**
   - Reduce ~280 lines of duplicated code
   - Centralize chart configuration
   - Easier consistent styling updates

2. **Unit Tests**
   - Test individual panel rendering
   - Test prop handling
   - Test chart creation/cleanup

3. **Customization**
   - User-configurable colors
   - Adjustable chart heights
   - Custom reference line values

4. **Performance**
   - Memoize calculation results
   - Debounce period changes
   - Virtual scrolling for many indicators

5. **Accessibility**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

## Conclusion

The oscillator panel architecture successfully:
- ✅ Separates concerns (calculation, rendering, display)
- ✅ Provides reusable components
- ✅ Maintains type safety
- ✅ Enables easy testing
- ✅ Scales well (8 oscillators, room for more)
- ✅ Performs efficiently
- ✅ Follows React best practices
