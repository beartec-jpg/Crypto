#!/usr/bin/env python3
"""
ABC Elliott Wave Simulator

Generates realistic ABC correction sequences for Elliott Wave W2 analysis.
Implements Elliott-friendly rules for zigzag (5-3-5) and flat (3-3-5) patterns.

Usage:
    python simulate_abc_elliott.py \\
        --w1-time 1704067200000 \\
        --w1-price 50000.0 \\
        --w2-time 1704240000000 \\
        --w2-price 47000.0 \\
        --interval 1h \\
        --pattern zigzag \\
        --volatility 0.01 \\
        --seed 42 \\
        --output-format json

Arguments:
    --w1-time:        W1 endpoint timestamp (epoch milliseconds)
    --w1-price:       W1 endpoint price (float)
    --w2-time:        W2 endpoint timestamp (epoch milliseconds)
    --w2-price:       W2 endpoint price (float)
    --interval:       Candle interval (e.g., '1m', '5m', '15m', '1h', '4h', '1d')
    --pattern:        ABC pattern type: 'zigzag' (default) or 'flat'
    --volatility:     Base volatility multiplier (default: 0.01)
    --seed:           Random seed for deterministic output (default: 42)
    --output-format:  Output format: 'csv' (default) or 'json'

Output:
    CSV format: time,open,high,low,close,volume,label
    JSON format: [{"timestamp_ms": ..., "open": ..., "high": ..., "low": ..., "close": ..., "volume": ..., "label": "..."}]

Labels:
    Only sub-wave endpoints are labeled:
    - W2.A-start: Start of wave A
    - W2.A: End of wave A
    - W2.B-start: Start of wave B (same as W2.A)
    - W2.B: End of wave B
    - W2.C-start: Start of wave C (same as W2.B)
    - W2.C: End of wave C (same as W2)

Elliott Rules:
    Zigzag (5-3-5):
        - Wave A: 5 impulse sub-waves (strong momentum)
        - Wave B: 3 corrective sub-waves (retrace 38.2%-61.8% of A)
        - Wave C: 5 impulse sub-waves (similar length to A, typically 100%-161.8% of A)
    
    Flat (3-3-5):
        - Wave A: 3 corrective sub-waves (less momentum)
        - Wave B: 3 corrective sub-waves (retrace 90%-100% of A)
        - Wave C: 5 impulse sub-waves (shorter, typically 61.8%-100% of A)
"""

import argparse
import csv
import json
import random
import sys
from typing import List, Dict, Tuple, Any


def interval_to_ms(interval: str) -> int:
    """Convert interval string to milliseconds."""
    interval = interval.lower()
    if interval.endswith('m'):
        return int(interval[:-1]) * 60 * 1000
    elif interval.endswith('h'):
        return int(interval[:-1]) * 60 * 60 * 1000
    elif interval.endswith('d'):
        return int(interval[:-1]) * 24 * 60 * 60 * 1000
    elif interval.endswith('w'):
        return int(interval[:-1]) * 7 * 24 * 60 * 60 * 1000
    else:
        # Default to 1 hour
        return 60 * 60 * 1000


def enforce_ohlc(candle: Dict[str, Any]) -> Dict[str, Any]:
    """Enforce OHLC invariants: high >= max(open, close), low <= min(open, close)."""
    candle['high'] = max(candle['high'], candle['open'], candle['close'])
    candle['low'] = min(candle['low'], candle['open'], candle['close'])
    
    # Pad tiny ranges (at least 0.01% of price)
    min_range = max(candle['open'], candle['close']) * 0.0001
    if candle['high'] - candle['low'] < min_range:
        midpoint = (candle['high'] + candle['low']) / 2
        candle['high'] = midpoint + min_range / 2
        candle['low'] = midpoint - min_range / 2
    
    return candle


def generate_momentum_candle(
    time: int,
    current_price: float,
    direction: str,
    volatility: float,
    rng: random.Random,
    is_counter_trend: bool = False
) -> Dict[str, Any]:
    """Generate a momentum candle (for impulse waves)."""
    # Body size with volatility
    body_multiplier = 0.3 if is_counter_trend else 1.0
    body_size = current_price * (0.003 + rng.random() * 0.005) * volatility * body_multiplier
    
    if is_counter_trend:
        # Counter-trend: opposite direction
        if direction == 'down':
            close = current_price + body_size * rng.random()
            open_price = close - body_size
        else:
            close = current_price - body_size * rng.random()
            open_price = close + body_size
    else:
        # Trend candle
        if direction == 'down':
            open_price = current_price
            close = current_price - body_size
        else:
            open_price = current_price
            close = current_price + body_size
    
    # Wicks: smaller for momentum candles
    wick_ratio = 0.05 + rng.random() * 0.10
    upper_wick = body_size * wick_ratio * (0.5 + rng.random())
    lower_wick = body_size * wick_ratio * (0.5 + rng.random())
    
    high = max(open_price, close) + upper_wick
    low = min(open_price, close) - lower_wick
    
    candle = {
        'timestamp_ms': time,
        'open': open_price,
        'high': high,
        'low': low,
        'close': close,
        'volume': int(1000000 + rng.random() * 500000),
        'label': ''
    }
    
    return enforce_ohlc(candle)


def generate_consolidation_candle(
    time: int,
    current_price: float,
    volatility: float,
    rng: random.Random,
    is_doji: bool = False
) -> Dict[str, Any]:
    """Generate a consolidation/corrective candle (for corrective waves)."""
    # Body size: smaller for consolidation
    body_size = (current_price * 0.0005 * rng.random() if is_doji 
                else current_price * (0.001 + rng.random() * 0.001) * volatility)
    
    # Random direction
    is_green = rng.random() > 0.5
    if is_green:
        open_price = current_price
        close = current_price + body_size
    else:
        open_price = current_price
        close = current_price - body_size
    
    # Wicks: longer for consolidation
    wick_ratio = 0.2 + rng.random() * 0.3
    upper_wick = body_size * wick_ratio * (1.0 + rng.random() * 2.0)
    lower_wick = body_size * wick_ratio * (1.0 + rng.random() * 2.0)
    
    high = max(open_price, close) + upper_wick
    low = min(open_price, close) - lower_wick
    
    candle = {
        'timestamp_ms': time,
        'open': open_price,
        'high': high,
        'low': low,
        'close': close,
        'volume': int(800000 + rng.random() * 400000),
        'label': ''
    }
    
    return enforce_ohlc(candle)


def generate_abc_zigzag(
    w1_time: int,
    w1_price: float,
    w2_time: int,
    w2_price: float,
    interval_ms: int,
    volatility: float,
    rng: random.Random
) -> List[Dict[str, Any]]:
    """
    Generate ABC zigzag pattern (5-3-5).
    Wave A: 5 impulse sub-waves (strong momentum down)
    Wave B: 3 corrective sub-waves (retrace 38.2%-61.8% of A)
    Wave C: 5 impulse sub-waves (similar length to A)
    """
    candles = []
    total_duration = w2_time - w1_time
    direction = 'down' if w2_price < w1_price else 'up'
    total_move = w2_price - w1_price
    
    # Calculate ABC proportions for zigzag
    # Wave A: ~38.2% of total time, ~50% of total move
    # Wave B: ~23.6% of total time, retraces 50% of A
    # Wave C: ~38.2% of total time, completes remaining move
    
    wave_a_duration = int(total_duration * 0.382)
    wave_b_duration = int(total_duration * 0.236)
    wave_c_duration = total_duration - wave_a_duration - wave_b_duration
    
    wave_a_move = total_move * 0.618  # A moves 61.8% of total
    b_retrace_ratio = 0.382 + rng.random() * 0.236  # B retraces 38.2%-61.8% of A
    wave_b_move = -wave_a_move * b_retrace_ratio
    wave_c_move = total_move - wave_a_move - wave_b_move
    
    wave_a_end_price = w1_price + wave_a_move
    wave_b_end_price = wave_a_end_price + wave_b_move
    
    current_time = w1_time
    current_price = w1_price
    
    # === WAVE A: 5 impulse sub-waves ===
    wave_a_candle_count = max(5, wave_a_duration // interval_ms)
    for i in range(wave_a_candle_count):
        current_time += interval_ms
        progress = i / wave_a_candle_count
        target_price = w1_price + wave_a_move * progress
        
        # 25% chance of counter-trend candle
        is_counter = rng.random() < 0.25
        
        candle = generate_momentum_candle(
            current_time, current_price, direction, volatility, rng, is_counter
        )
        
        # Adjust close to stay on track
        if not is_counter:
            candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
            candle['high'] = max(candle['high'], candle['close'])
            candle['low'] = min(candle['low'], candle['close'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.A-start'
        elif i == wave_a_candle_count - 1:
            candle['label'] = 'W2.A'
            candle['close'] = wave_a_end_price
            current_price = wave_a_end_price
        
        candles.append(candle)
    
    # === WAVE B: 3 corrective sub-waves ===
    wave_b_candle_count = max(3, wave_b_duration // interval_ms)
    opposite_direction = 'up' if direction == 'down' else 'down'
    
    for i in range(wave_b_candle_count):
        current_time += interval_ms
        progress = i / wave_b_candle_count
        target_price = wave_a_end_price + wave_b_move * progress
        
        is_doji = rng.random() < 0.3
        candle = generate_consolidation_candle(
            current_time, current_price, volatility, rng, is_doji
        )
        
        # Adjust close to stay on track
        candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
        candle['high'] = max(candle['high'], candle['close'], candle['open'])
        candle['low'] = min(candle['low'], candle['close'], candle['open'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.B-start'
        elif i == wave_b_candle_count - 1:
            candle['label'] = 'W2.B'
            candle['close'] = wave_b_end_price
            current_price = wave_b_end_price
        
        candles.append(candle)
    
    # === WAVE C: 5 impulse sub-waves ===
    wave_c_candle_count = max(5, wave_c_duration // interval_ms)
    
    for i in range(wave_c_candle_count):
        current_time += interval_ms
        progress = i / wave_c_candle_count
        target_price = wave_b_end_price + wave_c_move * progress
        
        is_counter = rng.random() < 0.25
        candle = generate_momentum_candle(
            current_time, current_price, direction, volatility, rng, is_counter
        )
        
        # Adjust close to stay on track
        if not is_counter:
            candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
            candle['high'] = max(candle['high'], candle['close'])
            candle['low'] = min(candle['low'], candle['close'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.C-start'
        elif i == wave_c_candle_count - 1:
            candle['label'] = 'W2.C'
            # Snap final close to W2 price
            candle['close'] = w2_price
            candle['high'] = max(candle['high'], w2_price)
            candle['low'] = min(candle['low'], w2_price)
        
        candles.append(candle)
    
    return candles


def generate_abc_flat(
    w1_time: int,
    w1_price: float,
    w2_time: int,
    w2_price: float,
    interval_ms: int,
    volatility: float,
    rng: random.Random
) -> List[Dict[str, Any]]:
    """
    Generate ABC flat pattern (3-3-5).
    Wave A: 3 corrective sub-waves (less momentum)
    Wave B: 3 corrective sub-waves (retrace 90%-100% of A)
    Wave C: 5 impulse sub-waves (shorter, typically 61.8%-100% of A)
    """
    candles = []
    total_duration = w2_time - w1_time
    direction = 'down' if w2_price < w1_price else 'up'
    total_move = w2_price - w1_price
    
    # Calculate ABC proportions for flat
    # Wave A: ~30% of total time, ~30% of total move
    # Wave B: ~30% of total time, retraces 90%-100% of A
    # Wave C: ~40% of total time, completes remaining move
    
    wave_a_duration = int(total_duration * 0.30)
    wave_b_duration = int(total_duration * 0.30)
    wave_c_duration = total_duration - wave_a_duration - wave_b_duration
    
    wave_a_move = total_move * 0.45  # A moves 45% of total
    b_retrace_ratio = 0.90 + rng.random() * 0.10  # B retraces 90%-100% of A
    wave_b_move = -wave_a_move * b_retrace_ratio
    wave_c_move = total_move - wave_a_move - wave_b_move
    
    wave_a_end_price = w1_price + wave_a_move
    wave_b_end_price = wave_a_end_price + wave_b_move
    
    current_time = w1_time
    current_price = w1_price
    
    # === WAVE A: 3 corrective sub-waves ===
    wave_a_candle_count = max(3, wave_a_duration // interval_ms)
    
    for i in range(wave_a_candle_count):
        current_time += interval_ms
        progress = i / wave_a_candle_count
        target_price = w1_price + wave_a_move * progress
        
        is_doji = rng.random() < 0.3
        candle = generate_consolidation_candle(
            current_time, current_price, volatility, rng, is_doji
        )
        
        # Adjust close to stay on track
        candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
        candle['high'] = max(candle['high'], candle['close'], candle['open'])
        candle['low'] = min(candle['low'], candle['close'], candle['open'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.A-start'
        elif i == wave_a_candle_count - 1:
            candle['label'] = 'W2.A'
            candle['close'] = wave_a_end_price
            current_price = wave_a_end_price
        
        candles.append(candle)
    
    # === WAVE B: 3 corrective sub-waves ===
    wave_b_candle_count = max(3, wave_b_duration // interval_ms)
    
    for i in range(wave_b_candle_count):
        current_time += interval_ms
        progress = i / wave_b_candle_count
        target_price = wave_a_end_price + wave_b_move * progress
        
        is_doji = rng.random() < 0.3
        candle = generate_consolidation_candle(
            current_time, current_price, volatility, rng, is_doji
        )
        
        # Adjust close to stay on track
        candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
        candle['high'] = max(candle['high'], candle['close'], candle['open'])
        candle['low'] = min(candle['low'], candle['close'], candle['open'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.B-start'
        elif i == wave_b_candle_count - 1:
            candle['label'] = 'W2.B'
            candle['close'] = wave_b_end_price
            current_price = wave_b_end_price
        
        candles.append(candle)
    
    # === WAVE C: 5 impulse sub-waves ===
    wave_c_candle_count = max(5, wave_c_duration // interval_ms)
    
    for i in range(wave_c_candle_count):
        current_time += interval_ms
        progress = i / wave_c_candle_count
        target_price = wave_b_end_price + wave_c_move * progress
        
        is_counter = rng.random() < 0.25
        candle = generate_momentum_candle(
            current_time, current_price, direction, volatility, rng, is_counter
        )
        
        # Adjust close to stay on track
        if not is_counter:
            candle['close'] = current_price + (target_price - current_price) * (0.8 + rng.random() * 0.4)
            candle['high'] = max(candle['high'], candle['close'])
            candle['low'] = min(candle['low'], candle['close'])
        
        current_price = candle['close']
        
        # Label endpoints
        if i == 0:
            candle['label'] = 'W2.C-start'
        elif i == wave_c_candle_count - 1:
            candle['label'] = 'W2.C'
            # Snap final close to W2 price
            candle['close'] = w2_price
            candle['high'] = max(candle['high'], w2_price)
            candle['low'] = min(candle['low'], w2_price)
        
        candles.append(candle)
    
    return candles


def write_csv(candles: List[Dict[str, Any]], output_file=None):
    """Write candles to CSV format."""
    writer = csv.writer(sys.stdout if output_file is None else output_file)
    writer.writerow(['time', 'open', 'high', 'low', 'close', 'volume', 'label'])
    
    for candle in candles:
        writer.writerow([
            candle['timestamp_ms'],
            f"{candle['open']:.8f}",
            f"{candle['high']:.8f}",
            f"{candle['low']:.8f}",
            f"{candle['close']:.8f}",
            candle['volume'],
            candle['label']
        ])


def write_json(candles: List[Dict[str, Any]], output_file=None):
    """Write candles to JSON format."""
    json_output = json.dumps(candles, indent=2)
    if output_file is None:
        print(json_output)
    else:
        output_file.write(json_output)


def main():
    parser = argparse.ArgumentParser(
        description='Generate ABC Elliott Wave correction sequences',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('--w1-time', type=int, required=True,
                       help='W1 endpoint timestamp (epoch milliseconds)')
    parser.add_argument('--w1-price', type=float, required=True,
                       help='W1 endpoint price')
    parser.add_argument('--w2-time', type=int, required=True,
                       help='W2 endpoint timestamp (epoch milliseconds)')
    parser.add_argument('--w2-price', type=float, required=True,
                       help='W2 endpoint price')
    parser.add_argument('--interval', type=str, default='1h',
                       help='Candle interval (e.g., 1m, 5m, 15m, 1h, 4h, 1d)')
    parser.add_argument('--pattern', type=str, default='zigzag',
                       choices=['zigzag', 'flat'],
                       help='ABC pattern type: zigzag or flat')
    parser.add_argument('--volatility', type=float, default=0.01,
                       help='Base volatility multiplier (default: 0.01)')
    parser.add_argument('--seed', type=int, default=42,
                       help='Random seed for deterministic output')
    parser.add_argument('--output-format', type=str, default='csv',
                       choices=['csv', 'json'],
                       help='Output format: csv or json')
    parser.add_argument('-o', '--output', type=str,
                       help='Output file path (default: stdout)')
    
    args = parser.parse_args()
    
    # Initialize random number generator with seed
    rng = random.Random(args.seed)
    
    # Convert interval to milliseconds
    interval_ms = interval_to_ms(args.interval)
    
    # Generate ABC candles based on pattern
    if args.pattern == 'zigzag':
        candles = generate_abc_zigzag(
            args.w1_time, args.w1_price,
            args.w2_time, args.w2_price,
            interval_ms, args.volatility, rng
        )
    else:  # flat
        candles = generate_abc_flat(
            args.w1_time, args.w1_price,
            args.w2_time, args.w2_price,
            interval_ms, args.volatility, rng
        )
    
    # Write output
    output_file = None
    if args.output:
        output_file = open(args.output, 'w', newline='')
    
    try:
        if args.output_format == 'json':
            write_json(candles, output_file)
        else:
            write_csv(candles, output_file)
    finally:
        if output_file:
            output_file.close()


if __name__ == '__main__':
    main()
