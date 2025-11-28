#!/usr/bin/env python3
"""
Market Structure Analysis for Crypto Trading
Detects: Swing Highs/Lows, HH/HL/LH/LL patterns, FVGs, BOS/ChoCh
"""

import yfinance as yf
import pandas as pd
import json
import sys
from typing import List, Dict, Tuple


def find_swing_points(data: pd.DataFrame, left_bars: int = 5, right_bars: int = 5) -> Dict[str, List]:
    """
    Find swing highs and swing lows
    
    A swing high: high is higher than left_bars and right_bars on either side
    A swing low: low is lower than left_bars and right_bars on either side
    
    Args:
        data: DataFrame with OHLC data
        left_bars: Number of bars to the left that must be lower/higher
        right_bars: Number of bars to the right that must be lower/higher
    
    Returns:
        Dict with 'highs' and 'lows' arrays containing indices and values
    """
    swing_highs = []
    swing_lows = []
    
    for i in range(left_bars, len(data) - right_bars):
        # Check for swing high
        is_swing_high = True
        for j in range(i - left_bars, i + right_bars + 1):
            if j == i:
                continue
            if data['High'].iloc[j] >= data['High'].iloc[i]:
                is_swing_high = False
                break
        
        if is_swing_high:
            swing_highs.append({
                'index': i,
                'time': int(data['Date'].iloc[i].timestamp()),
                'price': float(data['High'].iloc[i])
            })
        
        # Check for swing low
        is_swing_low = True
        for j in range(i - left_bars, i + right_bars + 1):
            if j == i:
                continue
            if data['Low'].iloc[j] <= data['Low'].iloc[i]:
                is_swing_low = False
                break
        
        if is_swing_low:
            swing_lows.append({
                'index': i,
                'time': int(data['Date'].iloc[i].timestamp()),
                'price': float(data['Low'].iloc[i])
            })
    
    return {'highs': swing_highs, 'lows': swing_lows}


def classify_market_structure(swing_highs: List, swing_lows: List) -> List[Dict]:
    """
    Classify swings as HH, HL, LH, LL
    
    HH (Higher High): Swing high is higher than previous swing high (bullish)
    HL (Higher Low): Swing low is higher than previous swing low (bullish)
    LH (Lower High): Swing high is lower than previous swing high (bearish)
    LL (Lower Low): Swing low is lower than previous swing low (bearish)
    
    Returns:
        List of structure points with type classification
    """
    structure_points = []
    
    # Classify swing highs
    for i in range(1, len(swing_highs)):
        prev_price = swing_highs[i-1]['price']
        curr_price = swing_highs[i]['price']
        
        if curr_price > prev_price:
            structure_type = 'HH'  # Higher High - bullish
        else:
            structure_type = 'LH'  # Lower High - bearish
        
        structure_points.append({
            'type': structure_type,
            'time': swing_highs[i]['time'],
            'price': swing_highs[i]['price'],
            'index': swing_highs[i]['index']
        })
    
    # Classify swing lows
    for i in range(1, len(swing_lows)):
        prev_price = swing_lows[i-1]['price']
        curr_price = swing_lows[i]['price']
        
        if curr_price > prev_price:
            structure_type = 'HL'  # Higher Low - bullish
        else:
            structure_type = 'LL'  # Lower Low - bearish
        
        structure_points.append({
            'type': structure_type,
            'time': swing_lows[i]['time'],
            'price': swing_lows[i]['price'],
            'index': swing_lows[i]['index']
        })
    
    # Sort by index to maintain chronological order
    structure_points.sort(key=lambda x: x['index'])
    
    return structure_points


def calculate_atr(data: pd.DataFrame, period: int = 14) -> float:
    """Calculate Average True Range for significance filtering"""
    high_low = data['High'] - data['Low']
    high_close = abs(data['High'] - data['Close'].shift())
    low_close = abs(data['Low'] - data['Close'].shift())
    
    true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr = true_range.rolling(window=period).mean().iloc[-1]
    
    return float(atr) if not pd.isna(atr) else 0.0


def detect_fvgs(data: pd.DataFrame, min_size_atr_multiplier: float = 0.5) -> List[Dict]:
    """
    Detect Fair Value Gaps (FVGs) with mitigation tracking
    
    Bullish FVG: candle[i-2].high < candle[i].low (gap between them)
    Bearish FVG: candle[i-2].low > candle[i].high (gap between them)
    
    FVG represents imbalance/inefficiency that price often returns to fill
    
    Args:
        data: DataFrame with OHLC data
        min_size_atr_multiplier: Minimum gap size as multiple of ATR (default 0.5)
    
    Returns:
        List of FVG zones with top, bottom, time range, and mitigation status
    """
    fvgs = []
    atr = calculate_atr(data)
    min_gap_size = atr * min_size_atr_multiplier
    
    for i in range(2, len(data)):
        # Bullish FVG: gap between candle i-2 high and candle i low
        if data['High'].iloc[i-2] < data['Low'].iloc[i]:
            gap_size = data['Low'].iloc[i] - data['High'].iloc[i-2]
            
            # Filter by minimum size
            if gap_size >= min_gap_size:
                top = float(data['Low'].iloc[i])
                bottom = float(data['High'].iloc[i-2])
                
                # Check if FVG has been mitigated (filled) by subsequent price action
                mitigated = False
                for j in range(i + 1, len(data)):
                    # FVG is mitigated if price closes within the gap
                    if data['Low'].iloc[j] <= top and data['High'].iloc[j] >= bottom:
                        mitigated = True
                        break
                
                fvgs.append({
                    'type': 'bullish',
                    'top': top,
                    'bottom': bottom,
                    'start_time': int(data['Date'].iloc[i-2].timestamp()),
                    'end_time': int(data['Date'].iloc[i].timestamp()),
                    'current_time': int(data['Date'].iloc[i].timestamp()),
                    'mitigated': mitigated,
                    'size': float(gap_size)
                })
        
        # Bearish FVG: gap between candle i-2 low and candle i high
        if data['Low'].iloc[i-2] > data['High'].iloc[i]:
            gap_size = data['Low'].iloc[i-2] - data['High'].iloc[i]
            
            # Filter by minimum size
            if gap_size >= min_gap_size:
                top = float(data['Low'].iloc[i-2])
                bottom = float(data['High'].iloc[i])
                
                # Check if FVG has been mitigated (filled) by subsequent price action
                mitigated = False
                for j in range(i + 1, len(data)):
                    # FVG is mitigated if price closes within the gap
                    if data['Low'].iloc[j] <= top and data['High'].iloc[j] >= bottom:
                        mitigated = True
                        break
                
                fvgs.append({
                    'type': 'bearish',
                    'top': top,
                    'bottom': bottom,
                    'start_time': int(data['Date'].iloc[i-2].timestamp()),
                    'end_time': int(data['Date'].iloc[i].timestamp()),
                    'current_time': int(data['Date'].iloc[i].timestamp()),
                    'mitigated': mitigated,
                    'size': float(gap_size)
                })
    
    return fvgs


def detect_bos_choch(data: pd.DataFrame, swing_highs: List, swing_lows: List) -> List[Dict]:
    """
    Detect Break of Structure (BOS) and Change of Character (ChoCh)
    
    Simplified approach:
    - BOS: Price makes a new swing high (higher than all previous highs) or new swing low (lower than all previous lows)
    - ChoCh: Price breaks the most recent counter-trend swing (reversal signal)
    
    Returns:
        List of BOS/ChoCh events with actual break levels
    """
    bos_choch = []
    
    if len(swing_highs) < 3 or len(swing_lows) < 3:
        return bos_choch
    
    # Track highest high and lowest low seen so far
    for i in range(2, len(swing_highs)):
        curr_high = swing_highs[i]
        prev_highs = swing_highs[:i]
        max_prev_high = max(prev_highs, key=lambda x: x['price'])
        
        # Bullish BOS: New high - higher than all previous highs
        if curr_high['price'] > max_prev_high['price']:
            bos_choch.append({
                'type': 'BOS',
                'direction': 'bullish',
                'time': curr_high['time'],
                'price': curr_high['price'],
                'broken_level': max_prev_high['price']
            })
    
    for i in range(2, len(swing_lows)):
        curr_low = swing_lows[i]
        prev_lows = swing_lows[:i]
        min_prev_low = min(prev_lows, key=lambda x: x['price'])
        
        # Bearish BOS: New low - lower than all previous lows
        if curr_low['price'] < min_prev_low['price']:
            bos_choch.append({
                'type': 'BOS',
                'direction': 'bearish',
                'time': curr_low['time'],
                'price': curr_low['price'],
                'broken_level': min_prev_low['price']
            })
    
    # Detect ChoCh by looking for reversals
    # We'll look for when price action changes direction significantly
    # ChoCh = when most recent swing breaks the previous opposite swing
    
    # Combine all swings with their types
    all_swings = []
    for h in swing_highs:
        all_swings.append({**h, 'swing_type': 'high'})
    for l in swing_lows:
        all_swings.append({**l, 'swing_type': 'low'})
    
    # Sort by index to get chronological order
    all_swings.sort(key=lambda x: x['index'])
    
    # Look for alternating high-low pattern breaks (potential reversals)
    for i in range(2, len(all_swings)):
        curr = all_swings[i]
        prev_same_type = None
        prev_opposite_type = None
        
        # Find previous swing of same type and opposite type
        for j in range(i - 1, -1, -1):
            if all_swings[j]['swing_type'] == curr['swing_type'] and prev_same_type is None:
                prev_same_type = all_swings[j]
            if all_swings[j]['swing_type'] != curr['swing_type'] and prev_opposite_type is None:
                prev_opposite_type = all_swings[j]
            if prev_same_type and prev_opposite_type:
                break
        
        if not prev_same_type or not prev_opposite_type:
            continue
        
        # Bullish ChoCh: Low is higher than previous low AND breaks above previous high
        if curr['swing_type'] == 'low' and curr['price'] > prev_same_type['price']:
            # Check if this breaks above a recent high
            if curr['price'] > prev_opposite_type['price']:
                bos_choch.append({
                    'type': 'ChoCh',
                    'direction': 'bullish',
                    'time': curr['time'],
                    'price': curr['price'],
                    'broken_level': prev_opposite_type['price']
                })
        
        # Bearish ChoCh: High is lower than previous high AND breaks below previous low
        elif curr['swing_type'] == 'high' and curr['price'] < prev_same_type['price']:
            # Check if this breaks below a recent low
            if curr['price'] < prev_opposite_type['price']:
                bos_choch.append({
                    'type': 'ChoCh',
                    'direction': 'bearish',
                    'time': curr['time'],
                    'price': curr['price'],
                    'broken_level': prev_opposite_type['price']
                })
    
    # Sort by time
    bos_choch.sort(key=lambda x: x['time'])
    
    return bos_choch


def filter_present_mode(structure: List, bos_choch: List, fvgs: List, max_structure: int = 10, max_bos_choch: int = 5) -> Tuple[List, List, List]:
    """
    Filter data for "Present Mode" - only show recent/active patterns
    
    Args:
        structure: All market structure points
        bos_choch: All BOS/ChoCh events
        fvgs: All Fair Value Gaps
        max_structure: Maximum structure points to show
        max_bos_choch: Maximum BOS/ChoCh events to show
    
    Returns:
        Tuple of (filtered_structure, filtered_bos_choch, filtered_fvgs)
    """
    # Show only last N structure points
    filtered_structure = structure[-max_structure:] if len(structure) > max_structure else structure
    
    # Show only last N BOS/ChoCh events
    filtered_bos_choch = bos_choch[-max_bos_choch:] if len(bos_choch) > max_bos_choch else bos_choch
    
    # Show only unmitigated (active) FVGs
    filtered_fvgs = [fvg for fvg in fvgs if not fvg.get('mitigated', False)]
    
    return filtered_structure, filtered_bos_choch, filtered_fvgs


def analyze_market_structure(symbol='XRP-USD', period='1mo', interval='15m', mode='present', 
                             min_bos_percent=1.0, fvg_filter=True):
    """
    Complete market structure analysis
    
    Args:
        symbol: Crypto pair (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y')
        interval: Data interval ('1m', '5m', '15m', '1h', '1d', '1wk')
        mode: 'present' (recent/active only) or 'historical' (all patterns)
        min_bos_percent: Minimum price change % for BOS/ChoCh to be significant
        fvg_filter: Whether to filter FVGs by ATR threshold
    
    Returns:
        JSON with all detected patterns
    """
    try:
        # Fetch data
        data = yf.download(symbol, period=period, interval=interval, progress=False)
        
        if data.empty:
            return json.dumps({'error': f'No data found for {symbol}'})
        
        # Reset index to make Date/Datetime a column
        data.reset_index(inplace=True)
        
        # Flatten MultiIndex columns if present
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] if col[1] == '' or col[1] == symbol else col[0] for col in data.columns]
        
        # Handle different column names for date
        date_column = None
        for col in ['Date', 'Datetime', 'index']:
            if col in data.columns:
                date_column = col
                break
        
        if date_column is None:
            return json.dumps({'error': 'No date column found in data'})
        
        # Rename to standard 'Date' for consistency
        if date_column != 'Date':
            data.rename(columns={date_column: 'Date'}, inplace=True)
        
        # Find swing points
        swings = find_swing_points(data, left_bars=5, right_bars=5)
        
        # Classify market structure
        structure = classify_market_structure(swings['highs'], swings['lows'])
        
        # Detect Fair Value Gaps with optional filtering
        atr_multiplier = 0.5 if fvg_filter else 0.0
        fvgs = detect_fvgs(data, min_size_atr_multiplier=atr_multiplier)
        
        # Detect BOS and ChoCh
        bos_choch = detect_bos_choch(data, swings['highs'], swings['lows'])
        
        # Filter BOS/ChoCh by minimum percentage move
        if min_bos_percent > 0:
            filtered_bos_choch = []
            for event in bos_choch:
                price_change_pct = abs((event['price'] - event['broken_level']) / event['broken_level'] * 100)
                if price_change_pct >= min_bos_percent:
                    filtered_bos_choch.append(event)
            bos_choch = filtered_bos_choch
        
        # Apply present mode filtering if requested
        if mode.lower() == 'present':
            structure, bos_choch, fvgs = filter_present_mode(structure, bos_choch, fvgs)
        
        # Prepare result with statistics
        total_fvgs = len(fvgs)
        active_fvgs = len([f for f in fvgs if not f.get('mitigated', False)])
        bullish_fvgs = len([f for f in fvgs if f.get('type') == 'bullish'])
        bearish_fvgs = len([f for f in fvgs if f.get('type') == 'bearish'])
        
        result = {
            'symbol': symbol,
            'period': period,
            'interval': interval,
            'mode': mode,
            'swing_highs': swings['highs'],
            'swing_lows': swings['lows'],
            'market_structure': structure,
            'fvgs': fvgs,
            'bos_choch': bos_choch,
            'stats': {
                'total_structure_points': len(structure),
                'total_bos_choch': len(bos_choch),
                'total_fvgs': total_fvgs,
                'active_fvgs': active_fvgs,
                'bullish_fvgs': bullish_fvgs,
                'bearish_fvgs': bearish_fvgs
            }
        }
        
        return json.dumps(result)
    
    except Exception as e:
        import traceback
        return json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        })


if __name__ == "__main__":
    # Parse command line arguments
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'XRP-USD'
    period = sys.argv[2] if len(sys.argv) > 2 else '1mo'
    interval = sys.argv[3] if len(sys.argv) > 3 else '15m'
    mode = sys.argv[4] if len(sys.argv) > 4 else 'present'
    min_bos_percent = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    fvg_filter = sys.argv[6].lower() == 'true' if len(sys.argv) > 6 else True
    
    # Analyze and output result
    result = analyze_market_structure(
        symbol=symbol, 
        period=period, 
        interval=interval,
        mode=mode,
        min_bos_percent=min_bos_percent,
        fvg_filter=fvg_filter
    )
    print(result)
