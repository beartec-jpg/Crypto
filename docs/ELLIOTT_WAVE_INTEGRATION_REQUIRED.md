# Elliott Wave Integration - MUST BE ADDED TO CryptoSandbox.tsx

The hook exists but is not connected. Add the following:

## 1. Import (top of file)
```typescript
import { useElliottWave } from '@/hooks/useElliottWave';
```

## 2. Initialize hook (after other hooks ~line 130)
```typescript
const elliottWave = useElliottWave({ timeframe: interval });
```

## 3. Click handler function
```typescript
const handleElliottWaveClick = useCallback((clickX: number, clickY: number) => {
  if (!xScaleRef.current || !yScaleRef.current || !elliottWave.isActive) return;
  
  const now = Date.now();
  if (now - lastClickTimeRef.current < 100) return;
  lastClickTimeRef.current = now;
  
  let snapType: 'candle' | 'fib' = 'candle';
  let time: number, price: number, snappedToHigh = false;
  
  // For W2, check Fibonacci levels first
  if (elliottWave.mode === 'placing_w2' && elliottWave.fibLevels.length > 0) {
    const clickPrice = yScaleRef.current.invert(clickY - MARGIN.top);
    for (const level of elliottWave.fibLevels) {
      const levelY = yScaleRef.current(level.price) + MARGIN.top;
      if (Math.abs(clickY - levelY) < 20) {
        time = xScaleRef.current.invert(clickX - MARGIN.left).getTime();
        price = level.price;
        snapType = 'fib';
        break;
      }
    }
  }
  
  if (snapType === 'candle') {
    const magnetPoint = findMagnetPoint(clickX, clickY);
    if (magnetPoint) {
      time = magnetPoint.time;
      price = magnetPoint.price;
      const candle = candles.find(c => c.time === time);
      snappedToHigh = candle ? Math.abs(price - candle.high) < Math.abs(price - candle.low) : false;
    } else {
      time = xScaleRef.current.invert(clickX - MARGIN.left).getTime();
      price = yScaleRef.current.invert(clickY - MARGIN.top);
    }
  }
  
  elliottWave.placePoint(time!, price!, snappedToHigh, snapType);
}, [elliottWave, candles, findMagnetPoint]);
```

## 4. Click overlay JSX (in render section)
```tsx
{activeTool === 'elliottwave' && elliottWave.isActive && (
  <div 
    className="absolute inset-0 cursor-crosshair z-[25]"
    style={{ touchAction: 'none' }}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      handleElliottWaveClick(clickX, clickY);
    }}
  ></div>
)}
```

## 5. Wire toolbar button onClick
```typescript
onClick={() => {
  if (activeTool === 'elliottwave') {
    setActiveTool(null);
    elliottWave.deactivateMode();
  } else {
    setActiveTool('elliottwave');
    elliottWave.activateMode();
  }
}}
```

## 6. Add D3 rendering in useEffect
Add a `drawElliottWave()` function that renders placed points, trendlines, fib levels, and simulated candles.
