#!/usr/bin/env python3
"""
Binance Orderflow Analysis Script
Fetches real tick-by-tick trade data from Binance API and calculates orderflow metrics
"""

import sys
import json
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple
from collections import defaultdict


def convert_symbol(symbol: str) -> str:
    """Convert Yahoo Finance symbol format to Binance format"""
    # XRP-USD -> XRPUSDT, BTC-USD -> BTCUSDT
    symbol = symbol.upper().replace('-USD', 'USDT').replace('-', '')
    return symbol


def period_to_milliseconds(period: str) -> int:
    """Convert period string to milliseconds"""
    # Handle multi-character units like 'mo', 'wk'
    if period.endswith('mo'):
        value = int(period[:-2])
        return value * 30 * 24 * 60 * 60 * 1000
    elif period.endswith('wk'):
        value = int(period[:-2])
        return value * 7 * 24 * 60 * 60 * 1000
    elif period.endswith('y'):
        value = int(period[:-1])
        return value * 365 * 24 * 60 * 60 * 1000
    elif period.endswith('d'):
        value = int(period[:-1])
        return value * 24 * 60 * 60 * 1000
    else:
        return 30 * 24 * 60 * 60 * 1000  # Default 30 days


def interval_to_milliseconds(interval: str) -> int:
    """Convert interval string to milliseconds"""
    unit = interval[-1]
    value = int(interval[:-1])
    
    if unit == 'm':
        return value * 60 * 1000
    elif unit == 'h':
        return value * 60 * 60 * 1000
    elif unit == 'd':
        return value * 24 * 60 * 60 * 1000
    else:
        return 15 * 60 * 1000  # Default 15 minutes


def fetch_binance_trades(symbol: str, start_time: int, end_time: int) -> List[Dict]:
    """
    Fetch historical trades from Binance US API
    Returns list of trades with price, quantity, time, and is_buyer_maker
    """
    url = "https://api.binance.us/api/v3/aggTrades"
    all_trades = []
    
    current_start = start_time
    
    # Binance aggTrades endpoint limits to 1000 trades per request
    while current_start < end_time:
        params = {
            'symbol': symbol,
            'startTime': current_start,
            'endTime': end_time,
            'limit': 1000
        }
        
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            trades = response.json()
            
            if not trades:
                break
            
            all_trades.extend(trades)
            
            # Update start time to last trade time + 1ms
            current_start = trades[-1]['T'] + 1
            
            # Break if we got less than 1000 trades (no more data)
            if len(trades) < 1000:
                break
                
        except Exception as e:
            print(f"Error fetching trades: {str(e)}", file=sys.stderr)
            break
    
    return all_trades


def aggregate_trades_to_candles(trades: List[Dict], interval_ms: int) -> pd.DataFrame:
    """
    Aggregate tick trades into OHLCV candles with real delta volume
    """
    if not trades:
        return pd.DataFrame()
    
    # Convert trades to DataFrame
    df_trades = pd.DataFrame(trades)
    df_trades['T'] = pd.to_datetime(df_trades['T'], unit='ms')
    df_trades['p'] = df_trades['p'].astype(float)
    df_trades['q'] = df_trades['q'].astype(float)
    
    # Calculate buy/sell volume for each trade
    df_trades['buy_vol'] = df_trades.apply(
        lambda x: x['q'] if not x['m'] else 0, axis=1
    )
    df_trades['sell_vol'] = df_trades.apply(
        lambda x: x['q'] if x['m'] else 0, axis=1
    )
    df_trades['delta'] = df_trades['buy_vol'] - df_trades['sell_vol']
    
    # Group by interval to create candles
    df_trades.set_index('T', inplace=True)
    
    # Resample to the specified interval
    interval_str = f'{interval_ms // 1000}S'  # Convert ms to seconds
    
    candles = pd.DataFrame({
        'Open': df_trades['p'].resample(interval_str).first(),
        'High': df_trades['p'].resample(interval_str).max(),
        'Low': df_trades['p'].resample(interval_str).min(),
        'Close': df_trades['p'].resample(interval_str).last(),
        'Volume': df_trades['q'].resample(interval_str).sum(),
        'BuyVolume': df_trades['buy_vol'].resample(interval_str).sum(),
        'SellVolume': df_trades['sell_vol'].resample(interval_str).sum(),
        'Delta': df_trades['delta'].resample(interval_str).sum(),
        'Trades': df_trades['a'].resample(interval_str).count()
    })
    
    # Remove candles with no trades
    candles = candles.dropna(subset=['Close'])
    
    return candles


def build_footprint_from_trades(trades: List[Dict], interval_ms: int) -> List[Dict[str, Any]]:
    """
    Build footprint chart data showing bid/ask volume at each price level
    """
    footprint_data = []
    
    if not trades:
        return footprint_data
    
    # Group trades by candle intervals
    candles = defaultdict(lambda: {'trades': [], 'start_time': None, 'end_time': None})
    
    for trade in trades:
        timestamp = trade['T']
        candle_start = (timestamp // interval_ms) * interval_ms
        
        if candles[candle_start]['start_time'] is None:
            candles[candle_start]['start_time'] = candle_start
            candles[candle_start]['end_time'] = candle_start + interval_ms
        
        candles[candle_start]['trades'].append(trade)
    
    # Build footprint for each candle
    for candle_start in sorted(candles.keys()):
        candle = candles[candle_start]
        price_levels = defaultdict(lambda: {'bid': 0.0, 'ask': 0.0})
        
        # Aggregate volume at each price level
        for trade in candle['trades']:
            price = float(trade['p'])
            qty = float(trade['q'])
            is_buyer_maker = trade['m']  # true if buyer was maker (passive), so taker was seller
            
            if is_buyer_maker:
                # Buyer was maker (limit buy), so taker SOLD into the bid
                price_levels[price]['bid'] += qty
            else:
                # Buyer was taker (market buy), so they BOUGHT from the ask
                price_levels[price]['ask'] += qty
        
        # Convert to arrays for footprint visualization
        if price_levels:
            prices = sorted(price_levels.keys())
            bid_vol = [price_levels[p]['bid'] for p in prices]
            ask_vol = [price_levels[p]['ask'] for p in prices]
            delta = [ask_vol[i] - bid_vol[i] for i in range(len(prices))]
            
            footprint_data.append({
                'time': candle_start // 1000,  # Convert to seconds
                'prices': prices,
                'bidVol': bid_vol,
                'askVol': ask_vol,
                'delta': sum(delta)
            })
    
    return footprint_data


def calculate_cvd_from_candles(candles: pd.DataFrame) -> List[Dict[str, Any]]:
    """Calculate Cumulative Volume Delta from real delta data"""
    cvd_data = []
    
    if candles.empty:
        return cvd_data
    
    cumulative_delta = 0
    prev_cvd = 0
    
    for idx, row in candles.iterrows():
        delta = row['Delta']
        cumulative_delta += delta
        
        # Determine color based on CVD change (green if increasing, red if decreasing)
        is_increasing = cumulative_delta > prev_cvd
        
        cvd_data.append({
            'time': int(idx.timestamp()),
            'value': float(cumulative_delta),
            'delta': float(delta),
            'color': 'green' if is_increasing else 'red'
        })
        
        prev_cvd = cumulative_delta
    
    return cvd_data


def calculate_vwap(candles: pd.DataFrame, anchor: str = 'session') -> List[Dict[str, Any]]:
    """
    Calculate VWAP with different anchoring periods
    """
    if candles.empty:
        return []
    
    typical_price = (candles['High'] + candles['Low'] + candles['Close']) / 3
    candles_copy = candles.copy()
    candles_copy['TypicalPrice'] = typical_price
    
    vwap_data = []
    
    if anchor == 'session':
        # Cumulative VWAP from the start
        vwap_values = (typical_price * candles['Volume']).cumsum() / candles['Volume'].cumsum()
        squared_diff = ((typical_price - vwap_values) ** 2 * candles['Volume']).cumsum() / candles['Volume'].cumsum()
        std_dev = np.sqrt(squared_diff)
        
        for i, (idx, row) in enumerate(candles.iterrows()):
            vwap_data.append({
                'time': int(idx.timestamp()),
                'value': float(vwap_values.iloc[i]),
                'upperBand': float(vwap_values.iloc[i] + std_dev.iloc[i]),
                'lowerBand': float(vwap_values.iloc[i] - std_dev.iloc[i]),
                'anchor': 'session'
            })
    else:
        # Rolling VWAP with period-based anchoring
        if anchor == 'daily':
            candles_copy['Period'] = candles_copy.index.date
        elif anchor == 'weekly':
            candles_copy['Period'] = candles_copy.index.to_period('W')
        elif anchor == 'monthly':
            candles_copy['Period'] = candles_copy.index.to_period('M')
        
        # Calculate VWAP for each period
        for period_val in candles_copy['Period'].unique():
            period_data = candles_copy[candles_copy['Period'] == period_val]
            tp = period_data['TypicalPrice']
            vol = period_data['Volume']
            
            vwap_val = (tp * vol).sum() / vol.sum() if vol.sum() > 0 else tp.mean()
            squared_diff_period = ((tp - vwap_val) ** 2 * vol).sum() / vol.sum() if vol.sum() > 0 else 0
            std_dev_val = np.sqrt(squared_diff_period)
            
            for idx, row in period_data.iterrows():
                vwap_data.append({
                    'time': int(idx.timestamp()),
                    'value': float(vwap_val),
                    'upperBand': float(vwap_val + std_dev_val),
                    'lowerBand': float(vwap_val - std_dev_val),
                    'anchor': anchor
                })
    
    return vwap_data


def calculate_vrvp(candles: pd.DataFrame) -> Dict[str, Any]:
    """Calculate Volume-Weighted Volume Profile"""
    if candles.empty:
        return {'profile': [], 'poc': 0, 'valueAreaHigh': 0, 'valueAreaLow': 0}
    
    # Create price bins
    price_range = candles['High'].max() - candles['Low'].min()
    num_bins = min(50, len(candles))
    
    if price_range == 0 or num_bins == 0:
        return {'profile': [], 'poc': 0, 'valueAreaHigh': 0, 'valueAreaLow': 0}
    
    price_bins = np.linspace(candles['Low'].min(), candles['High'].max(), num_bins)
    
    # Calculate volume at each price level
    volume_profile = defaultdict(float)
    
    for _, row in candles.iterrows():
        # Distribute volume across price range of candle
        candle_range = row['High'] - row['Low']
        if candle_range == 0:
            # All volume at close price
            bin_idx = np.digitize(row['Close'], price_bins) - 1
            if 0 <= bin_idx < len(price_bins):
                volume_profile[price_bins[bin_idx]] += row['Volume']
        else:
            # Distribute volume proportionally
            for price in price_bins:
                if row['Low'] <= price <= row['High']:
                    volume_profile[price] += row['Volume'] / len(price_bins)
    
    # Sort by price
    sorted_profile = sorted(volume_profile.items())
    
    if not sorted_profile:
        return {'profile': [], 'poc': 0, 'valueAreaHigh': 0, 'valueAreaLow': 0}
    
    # Find POC (Point of Control) - price with highest volume
    poc_price = max(sorted_profile, key=lambda x: x[1])[0]
    
    # Calculate Value Area (70% of volume)
    total_volume = sum(v for _, v in sorted_profile)
    value_area_volume = total_volume * 0.70
    
    # Find value area by expanding from POC
    poc_idx = next(i for i, (p, _) in enumerate(sorted_profile) if p == poc_price)
    
    current_volume = sorted_profile[poc_idx][1]
    low_idx = poc_idx
    high_idx = poc_idx
    
    while current_volume < value_area_volume and (low_idx > 0 or high_idx < len(sorted_profile) - 1):
        low_vol = sorted_profile[low_idx - 1][1] if low_idx > 0 else 0
        high_vol = sorted_profile[high_idx + 1][1] if high_idx < len(sorted_profile) - 1 else 0
        
        if low_vol > high_vol and low_idx > 0:
            low_idx -= 1
            current_volume += sorted_profile[low_idx][1]
        elif high_idx < len(sorted_profile) - 1:
            high_idx += 1
            current_volume += sorted_profile[high_idx][1]
        else:
            break
    
    profile_data = [
        {'price': float(price), 'volume': float(vol)}
        for price, vol in sorted_profile
    ]
    
    return {
        'profile': profile_data,
        'poc': float(poc_price),
        'valueAreaHigh': float(sorted_profile[high_idx][0]),
        'valueAreaLow': float(sorted_profile[low_idx][0])
    }


def analyze_binance_orderflow(symbol: str = 'XRP-USD', period: str = '1mo', interval: str = '15m') -> str:
    """Main function to analyze orderflow using Binance data"""
    try:
        # Convert symbol to Binance format
        binance_symbol = convert_symbol(symbol)
        
        # Calculate time range
        period_ms = period_to_milliseconds(period)
        interval_ms = interval_to_milliseconds(interval)
        end_time = int(datetime.now().timestamp() * 1000)
        start_time = end_time - period_ms
        
        # Fetch trades from Binance
        print(f"Fetching trades for {binance_symbol} from {datetime.fromtimestamp(start_time/1000)} to {datetime.fromtimestamp(end_time/1000)}", file=sys.stderr)
        trades = fetch_binance_trades(binance_symbol, start_time, end_time)
        
        if not trades:
            return json.dumps({'error': 'No trade data available from Binance'})
        
        print(f"Fetched {len(trades)} trades", file=sys.stderr)
        
        # Aggregate trades into candles
        candles = aggregate_trades_to_candles(trades, interval_ms)
        
        if candles.empty:
            return json.dumps({'error': 'Failed to aggregate trades into candles'})
        
        print(f"Created {len(candles)} candles", file=sys.stderr)
        
        # Build footprint data
        footprint = build_footprint_from_trades(trades, interval_ms)
        
        # Calculate CVD
        cvd = calculate_cvd_from_candles(candles)
        
        # Calculate multi-VWAP
        vwaps = {
            'session': calculate_vwap(candles, 'session'),
            'daily': calculate_vwap(candles, 'daily'),
            'weekly': calculate_vwap(candles, 'weekly'),
            'monthly': calculate_vwap(candles, 'monthly')
        }
        
        # Calculate VRVP
        vrvp = calculate_vrvp(candles)
        
        # Calculate last 10 bars for orderflow table
        last_10_candles = candles.tail(11).iloc[:-1]  # Exclude current incomplete candle
        
        orderflow_table = []
        for idx, row in last_10_candles.iterrows():
            orderflow_table.append({
                'time': int(idx.timestamp()),
                'buyVol': float(row['BuyVolume']),
                'sellVol': float(row['SellVolume']),
                'delta': float(row['Delta']),
                'volume': float(row['Volume'])
            })
        
        # Build result
        result = {
            'footprint': footprint,
            'cvd': cvd,
            'vwaps': vwaps,
            'vrvp': vrvp,
            'orderflowTable': orderflow_table,
            'divergences': []  # We can add this later if needed
        }
        
        return json.dumps(result)
        
    except Exception as e:
        import traceback
        return json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        })


if __name__ == '__main__':
    # Get command line arguments
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'XRP-USD'
    period = sys.argv[2] if len(sys.argv) > 2 else '1mo'
    interval = sys.argv[3] if len(sys.argv) > 3 else '15m'
    
    result = analyze_binance_orderflow(symbol, period, interval)
    print(result)
