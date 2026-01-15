import { useAdaptiveTimeframe, TimeframeInterval } from 'your-hook-library';

const symbol = 'YOUR_SYMBOL';
const baseTimeframe = TimeframeInterval.HOURLY;
const visibleCandleCount = 100;
const chartWidth = 800;
const zoomScale = 1.0;

const { adaptiveTimeframe, setAdaptiveTimeframe } = useAdaptiveTimeframe(symbol, baseTimeframe, visibleCandleCount, chartWidth, zoomScale, onTimeframeChange);

// Your component or additional code here
