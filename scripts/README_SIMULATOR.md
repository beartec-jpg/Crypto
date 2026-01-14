# Elliott ABC (W2) Wave Simulator

This Python script generates realistic Elliott Wave ABC corrective patterns (Wave 2) with proper OHLC candles and sub-wave labels.

## Features

- **Two Pattern Types**: Zigzag (deep retracement) and Flat (shallow retracement)
- **Realistic OHLC**: Generates proper open, high, low, close data with configurable volatility
- **Sub-wave Labels**: Automatically labels endpoints (W2.A-start, W2.A, W2.B-start, W2.B, W2.C-start, W2.C)
- **Multiple Formats**: Outputs JSON or CSV
- **Deterministic**: Uses seed for reproducible results

## Usage

```bash
python3 scripts/simulate_abc_elliott.py \
  --w1-time <W1_TIMESTAMP_MS> \
  --w2-time <W2_TIMESTAMP_MS> \
  --w1-price <W1_PRICE> \
  --w2-price <W2_PRICE> \
  --interval <INTERVAL> \
  --pattern <zigzag|flat> \
  --volatility <VOLATILITY> \
  --seed <SEED> \
  --output <OUTPUT_PATH> \
  --output-format <json|csv>
```

## Parameters

- `--w1-time`: W1 endpoint timestamp in milliseconds (start of ABC)
- `--w2-time`: W2 endpoint timestamp in milliseconds (end of ABC)
- `--w1-price`: Price at W1 (start of correction)
- `--w2-price`: Price at W2 (end of correction)
- `--interval`: Candle interval (e.g., `1h`, `4h`, `15m`, `1d`)
- `--pattern`: Pattern type - `zigzag` (A=61.8%, B=38-50%, C=100-161.8%) or `flat` (A=50%, B=90-100%, C=61.8%)
- `--volatility`: Price volatility factor (0.001-0.1, default: 0.01)
- `--seed`: Random seed for reproducibility (default: 42)
- `--output`: Output file path (default: abc_simulation.json)
- `--output-format`: Output format - `json` or `csv` (default: json)

## Examples

### Generate a Zigzag Pattern (Deep Correction)

```bash
python3 scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 \
  --w2-time 1704240000000 \
  --w1-price 42000 \
  --w2-price 39500 \
  --interval 4h \
  --pattern zigzag \
  --volatility 0.02 \
  --seed 123 \
  --output abc_zigzag.json
```

### Generate a Flat Pattern (Shallow Correction)

```bash
python3 scripts/simulate_abc_elliott.py \
  --w1-time 1704067200000 \
  --w2-time 1704153600000 \
  --w1-price 50000 \
  --w2-price 48500 \
  --interval 1h \
  --pattern flat \
  --volatility 0.015 \
  --seed 456 \
  --output abc_flat.csv \
  --output-format csv
```

## Output Format

### JSON Format

```json
[
  {
    "timestamp_ms": 1704067200000,
    "open": 42000.0,
    "high": 42520.59656256,
    "low": 41995.86138679,
    "close": 42519.16355286,
    "label": "W2.A-start"
  },
  {
    "timestamp_ms": 1704081600000,
    "open": 42519.16355286,
    "high": 43039.21906908,
    "low": 42517.48364103,
    "close": 43036.86985715,
    "label": ""
  }
]
```

### CSV Format

```csv
timestamp_ms,open,high,low,close,label
1704067200000,42000.0,42324.57718239,41992.34844455,42312.36197709,W2.A-start
1704081600000,42312.36197709,42632.08377964,42307.09483357,42628.16261751,
```

## Integration with TypeScript Loader

Use the companion TypeScript loader to load the simulated data into your frontend:

```typescript
import { loadSimulatedCandles } from '@/client/src/utils/loadSimulatedCandles';

// Load JSON or CSV file
const candles = await loadSimulatedCandles('/path/to/abc_simulation.json');

// Use the candles
candles.forEach(candle => {
  console.log(candle.time, candle.open, candle.high, candle.low, candle.close, candle.label);
});
```

## Pattern Characteristics

### Zigzag Pattern
- **Wave A**: Strong move (61.8% retracement of W1)
- **Wave B**: Weak correction (38.2-50% of A)
- **Wave C**: Extension beyond A (100-161.8% of A)
- **Use Case**: Sharp corrections, strong momentum reversals

### Flat Pattern
- **Wave A**: Moderate move (50% retracement of W1)
- **Wave B**: Nearly equal to A (90-100% retracement)
- **Wave C**: Shorter extension (61.8% of A)
- **Use Case**: Sideways consolidations, weak corrections

## Technical Details

- Uses deterministic random number generator (mulberry32) for reproducibility
- Applies Gaussian noise for realistic price action
- Ensures OHLC consistency (high >= max(open, close), low <= min(open, close))
- Labels only appear at sub-wave endpoints, internal candles have empty labels
- Timestamps are in milliseconds (Unix epoch)
