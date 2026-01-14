# ABC Elliott Wave Simulator

This directory contains tools for generating realistic ABC Elliott Wave correction sequences.

## Python Simulator

`simulate_abc_elliott.py` - Generate ABC correction data for Elliott Wave W2 analysis.

### Features

- **Pattern Types**:
  - **Zigzag (5-3-5)**: Sharp correction with strong A and C waves
  - **Flat (3-3-5)**: Sideways correction with deeper B wave retracement

- **Elliott-Friendly Rules**:
  - Zigzag: B retraces 38.2%-61.8% of A, C typically 100%-161.8% of A
  - Flat: B retraces 90%-100% of A, C typically 61.8%-100% of A
  - Proper ABC time proportions
  - Momentum candles for impulse waves (A, C in zigzag / C in flat)
  - Consolidation candles for corrective waves (B in all patterns / A in flat)

- **Output Formats**:
  - **CSV**: `time,open,high,low,close,volume,label`
  - **JSON**: Array of objects with `timestamp_ms`, OHLC, `volume`, `label`

- **Labels**: Only sub-wave endpoints are labeled:
  - `W2.A-start`, `W2.A`, `W2.B-start`, `W2.B`, `W2.C-start`, `W2.C`
  - Internal bars have no label (empty string)

### Usage

```bash
# Generate zigzag pattern (default)
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 \
  --w1-price 50000.0 \
  --w2-time 1704240000000 \
  --w2-price 47000.0 \
  --interval 1h \
  --pattern zigzag \
  --seed 42 \
  --output-format json

# Generate flat pattern with CSV output
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 \
  --w1-price 50000.0 \
  --w2-time 1704240000000 \
  --w2-price 47000.0 \
  --interval 4h \
  --pattern flat \
  --volatility 0.015 \
  --seed 123 \
  --output-format csv \
  -o output.csv
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--w1-time` | int | Required | W1 endpoint timestamp (epoch milliseconds) |
| `--w1-price` | float | Required | W1 endpoint price |
| `--w2-time` | int | Required | W2 endpoint timestamp (epoch milliseconds) |
| `--w2-price` | float | Required | W2 endpoint price |
| `--interval` | string | `'1h'` | Candle interval ('1m', '5m', '15m', '1h', '4h', '1d', etc.) |
| `--pattern` | string | `'zigzag'` | ABC pattern type: 'zigzag' or 'flat' |
| `--volatility` | float | `0.01` | Base volatility multiplier (affects candle body sizes) |
| `--seed` | int | `42` | Random seed for deterministic output |
| `--output-format` | string | `'csv'` | Output format: 'csv' or 'json' |
| `-o, --output` | string | stdout | Output file path |

### Examples

#### Example 1: Generate test data for visualization

```bash
# Create sample ABC data for BTC 1h chart
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 \
  --w1-price 50000 \
  --w2-time 1704240000000 \
  --w2-price 47000 \
  --interval 1h \
  --pattern zigzag \
  --seed 42 \
  --output-format json \
  -o abc_btc_1h.json
```

#### Example 2: Generate multiple patterns for comparison

```bash
# Zigzag
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 --w1-price 50000 \
  --w2-time 1704240000000 --w2-price 47000 \
  --interval 1h --pattern zigzag --seed 1 \
  --output-format json -o zigzag.json

# Flat
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 --w1-price 50000 \
  --w2-time 1704240000000 --w2-price 47000 \
  --interval 1h --pattern flat --seed 1 \
  --output-format json -o flat.json
```

## TypeScript Loader

`client/src/utils/loadSimulatedCandles.ts` - Load simulated candle data into frontend.

### Features

- Reads CSV or JSON output from simulator
- Auto-detects format based on file extension
- Fallback parsing (tries JSON first, then CSV)
- Returns data in frontend `SimulatedCandle` shape
- Includes OHLC validation helper

### Usage

```typescript
import { loadSimulatedCandles, validateCandles } from '@/utils/loadSimulatedCandles';

// Load from file (Node.js environment)
const candles = await loadSimulatedCandles('./data/abc_zigzag.json');

// Validate OHLC relationships
if (!validateCandles(candles)) {
  console.error('Invalid OHLC data!');
}

// Use in React component
const [simulatedData, setSimulatedData] = useState<SimulatedCandle[]>([]);

useEffect(() => {
  loadSimulatedCandles('/data/abc.json')
    .then(setSimulatedData)
    .catch(console.error);
}, []);
```

### Synchronous Loading

```typescript
import { loadSimulatedCandlesSync } from '@/utils/loadSimulatedCandles';
import { readFileSync } from 'fs';

// Load from string content
const content = readFileSync('data.json', 'utf-8');
const candles = loadSimulatedCandlesSync(content, 'json');
```

## Frontend Integration

The simulated candles are rendered in `client/src/pages/CryptoSandbox.tsx` with the following improvements:

1. **Visible Filtering**: Only renders candles within the current time range
2. **Dynamic Width**: Calculates candle width based on visible simulated candles (not real candles)
3. **Matching Geometry**: Uses same candlestick geometry as real candles (wicks + bodies)
4. **Label Filtering**: Only displays non-empty labels (endpoint labels)
5. **Consistent Appearance**: Works across all timeframes (1m, 5m, 15m, 1h, 4h, 1d, etc.)

### Rendering Updates

The updated rendering ensures predictive ABC candles match real candles:

```typescript
// Filter visible simulated candles based on time range
const visibleSimulatedCandles = elliottWave.simulatedCandles.filter(d => {
  const date = new Date(d.time);
  return date >= visibleTimeRange[0] && date <= visibleTimeRange[1];
});

// Calculate candle width based on visible simulated candles
const simulatedCandleWidth = Math.max(1, Math.min(20, (innerWidth / visibleSimulatedCandles.length) * 0.8));

// Render with same geometry as real candles
// - Wicks: lines from high to low
// - Bodies: rectangles from max(O,C) to min(O,C)
// - Labels: only for non-empty label strings
```

## Testing

### Python Simulator Tests

```bash
# Test zigzag pattern
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 --w1-price 50000 \
  --w2-time 1704240000000 --w2-price 47000 \
  --interval 1h --pattern zigzag --seed 42 \
  --output-format json | python -m json.tool | head -50

# Test flat pattern
python scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 --w1-price 50000 \
  --w2-time 1704240000000 --w2-price 47000 \
  --interval 1h --pattern flat --seed 123 \
  --output-format csv | head -20

# Verify OHLC invariants
# Each candle should satisfy: high >= max(open, close) and low <= min(open, close)
```

### TypeScript Compilation

```bash
npm run check
```

### Full Test Suite

```bash
npm test
```

## Notes

- All timestamps are in epoch milliseconds
- Prices support up to 8 decimal places for precision
- Volume is randomly generated (800k-1.5M range)
- OHLC invariants are strictly enforced
- Deterministic output with seeded RNG for testing
