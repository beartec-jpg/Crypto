#!/usr/bin/env python3
"""
Elliott-aware ABC (W2) simulator for crypto candles.
Generates a realistic Elliott Wave 2 corrective pattern (ABC) with proper sub-wave labels.
Supports both zigzag and flat patterns with configurable volatility.
"""

import argparse
import json
import csv
import sys
import random
import math
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional


def parse_interval_ms(interval: str) -> int:
    """Convert interval string (e.g., '1h', '15m', '1d') to milliseconds."""
    unit = interval[-1]
    value = int(interval[:-1])
    
    multipliers = {
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
    }
    
    if unit not in multipliers:
        raise ValueError(f"Invalid interval unit: {unit}. Use 'm', 'h', or 'd'.")
    
    return value * multipliers[unit]


def generate_zigzag_abc(
    w1_time: int,
    w2_time: int,
    w1_price: float,
    w2_price: float,
    interval_ms: int,
    volatility: float,
    seed: int
) -> List[Dict]:
    """
    Generate a zigzag ABC pattern.
    In zigzag: A is strong, B is weak (~50% of A), C extends beyond A.
    """
    random.seed(seed)
    
    # Calculate W1 characteristics
    w1_range = abs(w2_price - w1_price)
    w1_direction = 1 if w2_price > w1_price else -1
    
    # ABC proportions for zigzag (Fibonacci-like)
    # A wave: 61.8% retracement of W1
    # B wave: 38.2-50% retracement of A
    # C wave: extends to 100-161.8% of A
    
    a_retrace_pct = 0.618
    b_retrace_pct = 0.382 + random.uniform(0, 0.118)  # 38.2-50%
    c_extension_pct = 1.0 + random.uniform(0, 0.618)  # 100-161.8%
    
    # Calculate prices
    a_price = w1_price - (w1_direction * w1_range * a_retrace_pct)
    b_price = a_price + (w1_direction * (w1_price - a_price) * b_retrace_pct)
    c_price = a_price - (w1_direction * abs(a_price - w1_price) * c_extension_pct)
    
    # Calculate time divisions (A: 33%, B: 27%, C: 40%)
    total_time = w2_time - w1_time
    a_time = w1_time + int(total_time * 0.33)
    b_time = a_time + int(total_time * 0.27)
    c_time = w2_time
    
    # Generate candles for each wave
    candles = []
    
    # Wave A (W1 -> A)
    a_candles = generate_wave_candles(
        w1_time, a_time, w1_price, a_price, interval_ms, volatility, -w1_direction, seed
    )
    candles.extend(a_candles)
    
    # Wave B (A -> B)
    b_candles = generate_wave_candles(
        a_time, b_time, a_price, b_price, interval_ms, volatility, w1_direction, seed + 1000
    )
    candles.extend(b_candles)
    
    # Wave C (B -> C)
    c_candles = generate_wave_candles(
        b_time, c_time, b_price, c_price, interval_ms, volatility, -w1_direction, seed + 2000
    )
    candles.extend(c_candles)
    
    # Add labels only at sub-wave endpoints
    if candles:
        candles[0]['label'] = 'W2.A-start'
        # Find candle closest to A endpoint
        a_idx = find_closest_candle_idx(candles, a_time)
        if a_idx is not None:
            candles[a_idx]['label'] = 'W2.A'
            # B-start is the candle right after A
            if a_idx + 1 < len(candles):
                candles[a_idx + 1]['label'] = 'W2.B-start'
        
        # Find candle closest to B endpoint  
        b_idx = find_closest_candle_idx(candles, b_time)
        if b_idx is not None:
            candles[b_idx]['label'] = 'W2.B'
            # C-start is the candle right after B
            if b_idx + 1 < len(candles):
                candles[b_idx + 1]['label'] = 'W2.C-start'
        
        # Last candle is C
        candles[-1]['label'] = 'W2.C'
    
    return candles


def generate_flat_abc(
    w1_time: int,
    w2_time: int,
    w1_price: float,
    w2_price: float,
    interval_ms: int,
    volatility: float,
    seed: int
) -> List[Dict]:
    """
    Generate a flat ABC pattern.
    In flat: A and B are nearly equal (~90-100% retracement), C is shorter.
    """
    random.seed(seed)
    
    # Calculate W1 characteristics
    w1_range = abs(w2_price - w1_price)
    w1_direction = 1 if w2_price > w1_price else -1
    
    # ABC proportions for flat
    # A wave: 50% retracement of W1
    # B wave: 90-100% retracement of A (nearly flat)
    # C wave: 61.8% extension of A
    
    a_retrace_pct = 0.5
    b_retrace_pct = 0.9 + random.uniform(0, 0.1)  # 90-100%
    c_extension_pct = 0.618
    
    # Calculate prices
    a_price = w1_price - (w1_direction * w1_range * a_retrace_pct)
    b_price = a_price + (w1_direction * (w1_price - a_price) * b_retrace_pct)
    c_price = a_price - (w1_direction * abs(a_price - w1_price) * c_extension_pct)
    
    # Calculate time divisions (A: 35%, B: 35%, C: 30%)
    total_time = w2_time - w1_time
    a_time = w1_time + int(total_time * 0.35)
    b_time = a_time + int(total_time * 0.35)
    c_time = w2_time
    
    # Generate candles for each wave
    candles = []
    
    # Wave A
    a_candles = generate_wave_candles(
        w1_time, a_time, w1_price, a_price, interval_ms, volatility, -w1_direction, seed
    )
    candles.extend(a_candles)
    
    # Wave B
    b_candles = generate_wave_candles(
        a_time, b_time, a_price, b_price, interval_ms, volatility, w1_direction, seed + 1000
    )
    candles.extend(b_candles)
    
    # Wave C
    c_candles = generate_wave_candles(
        b_time, c_time, b_price, c_price, interval_ms, volatility, -w1_direction, seed + 2000
    )
    candles.extend(c_candles)
    
    # Add labels only at sub-wave endpoints
    if candles:
        candles[0]['label'] = 'W2.A-start'
        a_idx = find_closest_candle_idx(candles, a_time)
        if a_idx is not None:
            candles[a_idx]['label'] = 'W2.A'
        b_idx = find_closest_candle_idx(candles, b_time)
        if b_idx is not None:
            candles[b_idx]['label'] = 'W2.B'
        candles[-1]['label'] = 'W2.C'
        
        # Mark B-start and C-start
        if a_idx is not None and a_idx + 1 < len(candles):
            candles[a_idx + 1]['label'] = 'W2.B-start'
        if b_idx is not None and b_idx + 1 < len(candles):
            candles[b_idx + 1]['label'] = 'W2.C-start'
    
    return candles


def find_closest_candle_idx(candles: List[Dict], target_time: int) -> Optional[int]:
    """Find the index of the candle closest to target_time."""
    if not candles:
        return None
    
    min_diff = float('inf')
    closest_idx = 0
    
    for i, candle in enumerate(candles):
        diff = abs(candle['timestamp_ms'] - target_time)
        if diff < min_diff:
            min_diff = diff
            closest_idx = i
    
    return closest_idx


def generate_wave_candles(
    start_time: int,
    end_time: int,
    start_price: float,
    end_price: float,
    interval_ms: int,
    volatility: float,
    direction: int,
    seed: int
) -> List[Dict]:
    """
    Generate OHLC candles for a single wave segment with realistic price action.
    """
    random.seed(seed)
    
    # Fallback volatility factor when drift is zero
    FALLBACK_VOLATILITY_FACTOR = 0.01
    
    candles = []
    current_time = start_time
    current_price = start_price
    
    # Calculate total bars needed
    time_range = end_time - start_time
    num_bars = max(1, int(time_range / interval_ms))
    
    # Price movement per bar (with drift toward target)
    price_range = end_price - start_price
    drift_per_bar = price_range / num_bars if num_bars > 0 else 0
    
    for i in range(num_bars):
        # Add some noise around the drift
        noise_factor = volatility * abs(drift_per_bar) if drift_per_bar != 0 else volatility
        noise = random.gauss(0, noise_factor)
        
        # Calculate open (previous close or start price)
        open_price = current_price
        
        # Calculate close with drift and noise
        close_price = current_price + drift_per_bar + noise
        
        # Ensure we hit the target on the last bar
        if i == num_bars - 1:
            close_price = end_price
        
        # Generate high and low with intrabar volatility
        if abs(close_price - open_price) > 0:
            intrabar_vol = volatility * abs(close_price - open_price)
        else:
            intrabar_vol = volatility * abs(current_price) * FALLBACK_VOLATILITY_FACTOR
        
        high_price = max(open_price, close_price) + abs(random.gauss(0, intrabar_vol))
        low_price = min(open_price, close_price) - abs(random.gauss(0, intrabar_vol))
        
        # Ensure OHLC consistency
        high_price = max(high_price, open_price, close_price)
        low_price = min(low_price, open_price, close_price)
        
        candle = {
            'timestamp_ms': current_time,
            'open': round(open_price, 8),
            'high': round(high_price, 8),
            'low': round(low_price, 8),
            'close': round(close_price, 8),
            'label': ''  # Empty by default, only endpoints get labels
        }
        
        candles.append(candle)
        current_price = close_price
        current_time += interval_ms
    
    return candles


def write_json(candles: List[Dict], output_path: str):
    """Write candles to JSON file."""
    with open(output_path, 'w') as f:
        json.dump(candles, f, indent=2)
    print(f"✅ Generated {len(candles)} candles -> {output_path} (JSON)")


def write_csv(candles: List[Dict], output_path: str):
    """Write candles to CSV file."""
    if not candles:
        print("⚠️  No candles to write")
        return
    
    fieldnames = ['timestamp_ms', 'open', 'high', 'low', 'close', 'label']
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(candles)
    
    print(f"✅ Generated {len(candles)} candles -> {output_path} (CSV)")


def main():
    parser = argparse.ArgumentParser(
        description='Simulate Elliott Wave ABC (W2) corrective pattern with realistic candles'
    )
    
    parser.add_argument('--w1-time', type=int, required=True,
                        help='W1 timestamp in milliseconds (start of ABC)')
    parser.add_argument('--w2-time', type=int, required=True,
                        help='W2 timestamp in milliseconds (end of ABC)')
    parser.add_argument('--w1-price', type=float, required=True,
                        help='W1 price (start of ABC)')
    parser.add_argument('--w2-price', type=float, required=True,
                        help='W2 price (end of ABC)')
    parser.add_argument('--interval', type=str, default='1h',
                        help='Candle interval (e.g., 1h, 15m, 1d). Default: 1h')
    parser.add_argument('--pattern', type=str, choices=['zigzag', 'flat'], default='zigzag',
                        help='ABC pattern type: zigzag (deep) or flat (shallow). Default: zigzag')
    parser.add_argument('--volatility', type=float, default=0.01,
                        help='Price volatility factor (0.001-0.1). Default: 0.01')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed for reproducibility. Default: 42')
    parser.add_argument('--output', type=str, default='abc_simulation.json',
                        help='Output file path. Default: abc_simulation.json')
    parser.add_argument('--output-format', type=str, choices=['json', 'csv'], default='json',
                        help='Output format. Default: json')
    
    args = parser.parse_args()
    
    # Validate inputs
    if args.w2_time <= args.w1_time:
        print("❌ Error: w2-time must be greater than w1-time", file=sys.stderr)
        sys.exit(1)
    
    if args.w1_price <= 0 or args.w2_price <= 0:
        print("❌ Error: prices must be positive", file=sys.stderr)
        sys.exit(1)
    
    if args.volatility <= 0:
        print("❌ Error: volatility must be positive", file=sys.stderr)
        sys.exit(1)
    
    # Parse interval
    try:
        interval_ms = parse_interval_ms(args.interval)
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Generate pattern
    print(f"🔧 Generating {args.pattern} ABC pattern...")
    print(f"   W1: {args.w1_price} @ {datetime.fromtimestamp(args.w1_time/1000).isoformat()}")
    print(f"   W2: {args.w2_price} @ {datetime.fromtimestamp(args.w2_time/1000).isoformat()}")
    print(f"   Interval: {args.interval} ({interval_ms}ms)")
    print(f"   Volatility: {args.volatility}")
    print(f"   Seed: {args.seed}")
    
    if args.pattern == 'zigzag':
        candles = generate_zigzag_abc(
            args.w1_time, args.w2_time, args.w1_price, args.w2_price,
            interval_ms, args.volatility, args.seed
        )
    else:  # flat
        candles = generate_flat_abc(
            args.w1_time, args.w2_time, args.w1_price, args.w2_price,
            interval_ms, args.volatility, args.seed
        )
    
    # Write output
    if args.output_format == 'json':
        write_json(candles, args.output)
    else:
        write_csv(candles, args.output)
    
    # Print summary
    labeled_candles = [c for c in candles if c.get('label')]
    print(f"\n📊 Summary:")
    print(f"   Total candles: {len(candles)}")
    print(f"   Labeled points: {len(labeled_candles)}")
    if labeled_candles:
        print(f"   Labels: {', '.join([c['label'] for c in labeled_candles if c['label']])}")


if __name__ == '__main__':
    main()
