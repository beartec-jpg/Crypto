# Adaptive Timeframe System

A dynamic timeframe management system that automatically adjusts chart timeframes based on zoom level and candle width for optimal readability.

## Overview

The adaptive timeframe system intelligently switches between different timeframes (1m, 5m, 15m, 1h, 4h, 1d) as users zoom in or out of the chart. When candles become too small to read clearly, the system automatically transitions to a larger timeframe. Conversely, when candles are too large, it switches to a more granular timeframe.

## Features

- ✅ **Automatic Timeframe Detection** - Analyzes visible candle count and width
- ✅ **Smart Switching Logic** - Only switches when necessary based on thresholds
- ✅ **Data Caching** - Caches fetched data to avoid redundant API calls
- ✅ **Smooth Transitions** - Optional fade animations between timeframes
- ✅ **Manual Override** - Users can manually select timeframes
- ✅ **Visual Feedback** - Clear indicator showing current timeframe and mode
- ✅ **Debounced Detection** - Prevents rapid switching during zoom operations
- ✅ **Pre-fetching** - Can pre-load adjacent timeframes for instant switching

## Architecture

### Core Components

1. **Types** (`client/src/types/timeframes.ts`)
   - `TimeframeInterval` - Supported intervals
   - `TimeframeConfig` - Configuration for each timeframe
   - `AdaptiveTimeframeState` - Current state
   - `TimeframeCache` - Cached data structure

2. **Constants** (`client/src/constants/timeframes.ts`)
   - `TIMEFRAME_CONFIGS` - Min/max candles and width per timeframe
   - `TIMEFRAME_HIERARCHY` - Ordered list from smallest to largest
   - `DEFAULT_ADAPTIVE_OPTIONS` - Default configuration
   - Helper functions for navigation

3. **Utilities** (`client/src/lib/timeframeUtils.ts`)
   - `calculateTimeframeMetrics()` - Calculate current chart metrics
   - `determineOptimalTimeframe()` - Find best timeframe for metrics
   - `shouldSwitchTimeframe()` - Determine if switch is needed
   - `getTimeframeRatio()` - Calculate conversion ratios

4. **Hook** (`client/src/hooks/useAdaptiveTimeframe.ts`)
   - Main state management
   - Automatic detection and switching
   - Cache management
   - Manual override support

5. **Component** (`client/src/components/TimeframeIndicator.tsx`)
   - Visual indicator in chart header
   - Shows current timeframe
   - Displays adaptive mode status
   - Toggle button for enabling/disabling

## Usage

### Basic Integration

```tsx
import { useAdaptiveTimeframe } from '@/hooks/useAdaptiveTimeframe';
import { TimeframeIndicator } from '@/components/TimeframeIndicator';

function MyChart() {
  const [interval, setInterval] = useState<TimeframeInterval>('1h');
  
  const adaptiveTimeframe = useAdaptiveTimeframe({
    symbol: 'BTCUSDT',
    baseTimeframe: interval,
    visibleCandleCount: 100,
    chartWidth: 1000,
    zoomScale: 1,
    onTimeframeChange: (newTf, oldTf) => {
      console.log(`Switched: ${oldTf} → ${newTf}`);
      setInterval(newTf);
    }
  });
  
  return (
    <div>
      <TimeframeIndicator
        currentTimeframe={adaptiveTimeframe.currentTimeframe}
        isAdaptiveMode={adaptiveTimeframe.isAdaptiveMode}
        isTransitioning={adaptiveTimeframe.isTransitioning}
        onToggleAdaptive={() => 
          adaptiveTimeframe.setAdaptiveMode(!adaptiveTimeframe.isAdaptiveMode)
        }
      />
      {/* Your chart */}
    </div>
  );
}
```

### Configuration Options

```tsx
const adaptiveTimeframe = useAdaptiveTimeframe({
  // ... required props
  options: {
    enabled: true,              // Enable adaptive mode
    debounceDelay: 500,         // Wait 500ms before switching
    enableTransitions: true,    // Animate transitions
    transitionDuration: 300,    // 300ms animation
    enablePrefetch: true,       // Pre-load adjacent timeframes
    cacheMaxAge: 5 * 60 * 1000  // Cache for 5 minutes
  }
});
```

### Cache Management

```tsx
// Get cached data
const cached = adaptiveTimeframe.getCachedData('1h');

// Set cached data
adaptiveTimeframe.setCachedData('1h', candleData);

// Clear cache
adaptiveTimeframe.clearCache('1h');  // Specific timeframe
adaptiveTimeframe.clearCache();       // All timeframes
```

## Switching Logic

### Timeframe Thresholds

Each timeframe has optimal ranges:

| Timeframe | Min Candles | Max Candles | Min Width (px) |
|-----------|-------------|-------------|----------------|
| 1m        | 100         | 300         | 3              |
| 5m        | 80          | 250         | 4              |
| 15m       | 60          | 200         | 5              |
| 1h        | 40          | 150         | 6              |
| 4h        | 30          | 100         | 8              |
| 1d        | 20          | 80          | 10             |

### Decision Algorithm

1. Calculate current metrics (visible candles, candle width)
2. Check if current timeframe is still optimal
3. If candle width < min threshold → suggest larger timeframe
4. If candle width > max threshold → suggest smaller timeframe
5. Only switch if conditions are significantly outside optimal range (20% buffer)
6. Debounce to prevent rapid switching

### Example Scenarios

**Zoom Out (Too Many Candles)**
- Start: 1h timeframe, 200 visible candles (5px each)
- Detection: Width below 1h minimum (6px)
- Action: Switch to 4h (reduces candles by 4x)
- Result: ~50 candles at 20px each

**Zoom In (Too Few Candles)**
- Start: 1h timeframe, 20 visible candles (50px each)
- Detection: Width above maximum (20px)
- Action: Switch to 15m (increases candles by 4x)
- Result: ~80 candles at 12.5px each

## Performance Optimizations

### 1. Debouncing
- 500ms delay before evaluating timeframe changes
- Prevents rapid switches during continuous zoom
- Reduces CPU usage and API calls

### 2. Caching
- Stores fetched data for each timeframe
- 5-minute expiration by default
- Instant switching to cached timeframes
- Reduces network traffic

### 3. Pre-fetching
- Optionally pre-loads adjacent timeframes
- Happens during idle time
- Enables instant switching

### 4. Lazy Evaluation
- Only calculates metrics when needed
- Uses useMemo for expensive calculations
- Minimal re-renders

## Testing

### Unit Tests

Run tests for utilities:
```bash
npm test -- client/src/__tests__/lib/timeframeUtils.test.ts
```

Run tests for hook:
```bash
npm test -- client/src/__tests__/hooks/useAdaptiveTimeframe.test.ts
```

### Test Coverage

- ✅ Metric calculations
- ✅ Optimal timeframe determination
- ✅ Switch threshold logic
- ✅ Cache management
- ✅ Manual overrides
- ✅ Debouncing behavior
- ✅ Callback invocations

## Future Enhancements

### Planned Features

1. **Settings UI** - User-configurable thresholds
2. **Toast Notifications** - Alert users when auto-switching
3. **Advanced Animations** - Morphing transitions between timeframes
4. **Smart Pre-loading** - ML-based prediction of next timeframe
5. **User Preferences** - Remember per-user adaptive mode state
6. **Historical Switching Data** - Track switching patterns for optimization

### Potential Improvements

- [ ] Add support for custom timeframes (30m, 2h, etc.)
- [ ] Implement timeframe "hints" in UI before switching
- [ ] Add keyboard shortcuts for manual timeframe control
- [ ] Support for multiple simultaneous charts with independent adaptive modes
- [ ] Integration with drawing tools to maintain scale

## Troubleshooting

### Common Issues

**Timeframe Not Switching**
- Check if adaptive mode is enabled
- Verify `visibleCandleCount` is being calculated correctly
- Ensure chart width is > 0
- Check browser console for error messages

**Too Frequent Switching**
- Increase `debounceDelay` in options
- Adjust threshold buffers in switching logic
- Verify zoom scale is being passed correctly

**Cache Not Working**
- Check cache age settings
- Verify data is being set after fetch
- Clear cache and retry

**Performance Issues**
- Disable pre-fetching if not needed
- Increase debounce delay
- Reduce cache max age

## API Reference

See inline documentation in:
- `client/src/types/timeframes.ts` - All type definitions
- `client/src/hooks/useAdaptiveTimeframe.ts` - Hook interface
- `client/src/lib/timeframeUtils.ts` - Utility functions

## Contributing

When modifying the adaptive timeframe system:

1. Update tests to cover new scenarios
2. Document any new configuration options
3. Maintain backward compatibility
4. Update this README with new features
5. Test with different zoom levels and devices

## License

Part of the Bear-Tec Crypto Platform
