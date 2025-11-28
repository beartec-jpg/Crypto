#!/usr/bin/env python3
"""
Orderflow Analysis Script
Calculates footprint, VRVP, VWAP, CVD, and divergences for cryptocurrency trading
"""

import sys
import json
import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple


def calculate_anchored_vwap(data: pd.DataFrame, anchor: str = 'session') -> List[Dict[str, Any]]:
    """
    Calculate Anchored VWAP - accumulates from the start of each period
    anchor: 'session', 'daily', 'weekly', 'monthly'
    """
    if data.empty:
        return []
    
    typical_price = (data['High'] + data['Low'] + data['Close']) / 3
    data_copy = data.copy()
    data_copy['TypicalPrice'] = typical_price
    
    vwap_data = []
    
    if anchor == 'session':
        # Cumulative VWAP from the dataset start (entire session)
        cum_pv = (typical_price * data['Volume']).cumsum()
        cum_vol = data['Volume'].cumsum()
        vwap_values = cum_pv / cum_vol
        
        for i, (idx, row) in enumerate(data.iterrows()):
            vwap_data.append({
                'time': int(idx.timestamp()),
                'value': float(vwap_values.iloc[i]),
                'anchor': 'session'
            })
    else:
        # Anchored VWAP that resets and accumulates from each period start
        if anchor == 'daily':
            data_copy['Period'] = data_copy.index.date
        elif anchor == 'weekly':
            data_copy['Period'] = data_copy.index.to_period('W')
        elif anchor == 'monthly':
            data_copy['Period'] = data_copy.index.to_period('M')
        
        # Calculate cumulative VWAP within each period
        for period_val in data_copy['Period'].unique():
            period_mask = data_copy['Period'] == period_val
            period_data = data_copy[period_mask].copy()
            
            # Accumulate within this period
            tp = period_data['TypicalPrice']
            vol = period_data['Volume']
            cum_pv = (tp * vol).cumsum()
            cum_vol = vol.cumsum()
            period_vwap = cum_pv / cum_vol
            
            for j, (idx, row) in enumerate(period_data.iterrows()):
                vwap_data.append({
                    'time': int(idx.timestamp()),
                    'value': float(period_vwap.iloc[j]),
                    'anchor': anchor
                })
    
    return vwap_data


def calculate_rolling_vwap(data: pd.DataFrame, periods: int = 20) -> List[Dict[str, Any]]:
    """
    Calculate Rolling VWAP - uses a fixed lookback window
    periods: number of bars to look back
    """
    if data.empty or len(data) < periods:
        return []
    
    typical_price = (data['High'] + data['Low'] + data['Close']) / 3
    vwap_data = []
    
    for i in range(len(data)):
        if i < periods - 1:
            # Not enough data yet, use what we have
            window_tp = typical_price.iloc[:i+1]
            window_vol = data['Volume'].iloc[:i+1]
        else:
            # Use rolling window
            window_tp = typical_price.iloc[i-periods+1:i+1]
            window_vol = data['Volume'].iloc[i-periods+1:i+1]
        
        vwap_val = (window_tp * window_vol).sum() / window_vol.sum() if window_vol.sum() > 0 else window_tp.mean()
        
        vwap_data.append({
            'time': int(data.index[i].timestamp()),
            'value': float(vwap_val),
            'periods': periods
        })
    
    return vwap_data


def calculate_cvd(data: pd.DataFrame) -> Tuple[List[Dict[str, Any]], pd.DataFrame]:
    """
    Calculate Cumulative Volume Delta with improved estimation
    Returns: (cvd_data, enriched_dataframe_with_delta)
    """
    # Improved delta estimation using candle structure
    deltas = []
    buy_volumes = []
    sell_volumes = []
    
    for _, row in data.iterrows():
        high = row['High']
        low = row['Low']
        open_price = row['Open']
        close = row['Close']
        volume = row['Volume']
        
        if high == low:
            # Doji - neutral, split volume 50/50
            buy_vol = volume * 0.5
            sell_vol = volume * 0.5
        else:
            # Calculate where close is relative to the range
            close_position = (close - low) / (high - low) if (high - low) > 0 else 0.5
            
            # Calculate candle body strength
            body_size = abs(close - open_price)
            range_size = high - low
            body_ratio = body_size / range_size if range_size > 0 else 0
            
            # More weight to close position, with body ratio as multiplier
            buy_pressure = close_position * (0.5 + body_ratio * 0.5)
            
            buy_vol = volume * buy_pressure
            sell_vol = volume * (1 - buy_pressure)
        
        delta = buy_vol - sell_vol
        deltas.append(delta)
        buy_volumes.append(buy_vol)
        sell_volumes.append(sell_vol)
    
    # Add to dataframe
    data_enriched = data.copy()
    data_enriched['Delta'] = deltas
    data_enriched['BuyVolume'] = buy_volumes
    data_enriched['SellVolume'] = sell_volumes
    
    # Calculate cumulative delta
    cvd = np.cumsum(deltas)
    
    cvd_data = []
    prev_cvd = 0
    for i, (idx, row) in enumerate(data.iterrows()):
        current_cvd = cvd[i]
        is_increasing = current_cvd > prev_cvd
        
        cvd_data.append({
            'time': int(idx.timestamp()),
            'value': float(current_cvd),
            'delta': float(deltas[i]),
            'color': 'green' if is_increasing else 'red'
        })
        prev_cvd = current_cvd
    
    return cvd_data, data_enriched


def calculate_vrvp(data: pd.DataFrame, num_bins: int = 50) -> Dict[str, Any]:
    """Calculate Volume Profile (VRVP) with POC, VAH, VAL"""
    if data.empty or len(data) == 0:
        return {'poc': 0, 'vah': 0, 'val': 0, 'profile': []}
    
    # Create price bins
    price_min = data['Low'].min()
    price_max = data['High'].max()
    bins = np.linspace(price_min, price_max, num_bins)
    
    # Accumulate volume at each price level
    volume_profile = np.zeros(len(bins) - 1)
    
    for _, row in data.iterrows():
        # Find which bin this candle's range covers
        low_bin = np.digitize(row['Low'], bins) - 1
        high_bin = np.digitize(row['High'], bins) - 1
        
        # Distribute volume across the bins this candle covers
        bins_covered = max(1, high_bin - low_bin + 1)
        volume_per_bin = row['Volume'] / bins_covered
        
        for b in range(max(0, low_bin), min(len(volume_profile), high_bin + 1)):
            volume_profile[b] += volume_per_bin
    
    # Find POC (Point of Control - highest volume price)
    poc_index = np.argmax(volume_profile)
    poc_price = (bins[poc_index] + bins[poc_index + 1]) / 2
    
    # Calculate Value Area (70% of volume)
    total_volume = volume_profile.sum()
    target_volume = total_volume * 0.70
    
    # Start from POC and expand up/down until we hit 70% volume
    accumulated_volume = volume_profile[poc_index]
    low_idx = poc_index
    high_idx = poc_index
    
    while accumulated_volume < target_volume and (low_idx > 0 or high_idx < len(volume_profile) - 1):
        # Check which direction to expand
        low_vol = volume_profile[low_idx - 1] if low_idx > 0 else 0
        high_vol = volume_profile[high_idx + 1] if high_idx < len(volume_profile) - 1 else 0
        
        if low_vol >= high_vol and low_idx > 0:
            low_idx -= 1
            accumulated_volume += volume_profile[low_idx]
        elif high_idx < len(volume_profile) - 1:
            high_idx += 1
            accumulated_volume += volume_profile[high_idx]
        else:
            break
    
    vah = (bins[high_idx] + bins[high_idx + 1]) / 2
    val = (bins[low_idx] + bins[low_idx + 1]) / 2
    
    # Build profile data
    profile = []
    for i in range(len(volume_profile)):
        profile.append({
            'price': float((bins[i] + bins[i + 1]) / 2),
            'volume': float(volume_profile[i])
        })
    
    return {
        'poc': float(poc_price),
        'vah': float(vah),
        'val': float(val),
        'profile': profile
    }


def calculate_footprint(data: pd.DataFrame) -> List[Dict[str, Any]]:
    """Calculate simplified footprint (bid/ask volume estimate per candle)"""
    footprint_data = []
    
    for idx, row in data.iterrows():
        # Create price levels within the candle range
        num_levels = 5
        price_range = row['High'] - row['Low']
        if price_range == 0:
            price_range = row['Close'] * 0.001  # 0.1% if no range
        
        prices = np.linspace(row['Low'], row['High'], num_levels)
        
        # Estimate bid/ask distribution based on close position
        close_position = (row['Close'] - row['Low']) / price_range if price_range > 0 else 0.5
        
        bid_vol = []
        ask_vol = []
        
        for i, price in enumerate(prices):
            price_position = i / (num_levels - 1)
            
            # More ask volume near the high, more bid volume near the low
            if price_position > close_position:
                ask_vol.append(float(row['Volume'] * (price_position - close_position)))
                bid_vol.append(float(row['Volume'] * (1 - price_position) * 0.3))
            else:
                bid_vol.append(float(row['Volume'] * (close_position - price_position)))
                ask_vol.append(float(row['Volume'] * price_position * 0.3))
        
        # Calculate delta for this candle
        total_bid = sum(bid_vol)
        total_ask = sum(ask_vol)
        delta = total_ask - total_bid
        
        footprint_data.append({
            'time': int(idx.timestamp()),
            'bidVol': bid_vol,
            'askVol': ask_vol,
            'prices': [float(p) for p in prices],
            'delta': float(delta)
        })
    
    return footprint_data


def detect_divergences(data: pd.DataFrame, cvd: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect price/volume divergences"""
    divergences = []
    
    if data.empty or len(cvd) == 0:
        return divergences
    
    # Extract CVD values
    cvd_values = [item['value'] for item in cvd]
    prices = data['Close'].values
    
    # Look for divergences using simple peak/trough comparison
    window = 10
    
    for i in range(window, len(data) - window):
        # Check if this is a price low
        price_window = prices[i-window:i+window]
        if len(price_window) > 0 and prices[i] == min(price_window):
            # Check if CVD is making higher low (bullish divergence)
            cvd_slice = cvd_values[max(0, i-window*2):i-window]
            if len(cvd_slice) > 0:
                cvd_prev_low = min(cvd_slice)
                if cvd_values[i] > cvd_prev_low:
                    divergences.append({
                        'time': int(data.index[i].timestamp()),
                        'type': 'bullish',
                        'poi': float(prices[i])
                    })
        
        # Check if this is a price high
        price_window = prices[i-window:i+window]
        if len(price_window) > 0 and prices[i] == max(price_window):
            # Check if CVD is making lower high (bearish divergence)
            cvd_slice = cvd_values[max(0, i-window*2):i-window]
            if len(cvd_slice) > 0:
                cvd_prev_high = max(cvd_slice)
                if cvd_values[i] < cvd_prev_high:
                    divergences.append({
                        'time': int(data.index[i].timestamp()),
                        'type': 'bearish',
                        'poi': float(prices[i])
                    })
    
    return divergences


def analyze_orderflow(symbol: str = 'XRP-USD', period: str = '1mo', interval: str = '15m') -> str:
    """Main function to analyze orderflow"""
    try:
        # Download data
        ticker = yf.Ticker(symbol)
        data = ticker.history(period=period, interval=interval)
        
        if data.empty:
            return json.dumps({'error': 'No data available for the given parameters'})
        
        # Ensure index is datetime
        if not isinstance(data.index, pd.DatetimeIndex):
            data.index = pd.to_datetime(data.index)
        
        # Handle column names (Yahoo Finance sometimes uses multi-level columns)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] if col[1] == '' or col[1] == symbol else col[0] for col in data.columns]
        
        # Calculate all orderflow metrics
        footprint = calculate_footprint(data)
        cvd, data_enriched = calculate_cvd(data)
        vrvp = calculate_vrvp(data)
        
        # Calculate multiple VWAPs with different anchoring periods
        vwap_session = calculate_anchored_vwap(data, 'session')
        vwap_daily = calculate_anchored_vwap(data, 'daily')
        vwap_weekly = calculate_anchored_vwap(data, 'weekly')
        vwap_monthly = calculate_anchored_vwap(data, 'monthly')
        
        # Calculate rolling VWAPs with different periods
        vwap_rolling_10 = calculate_rolling_vwap(data, 10)
        vwap_rolling_20 = calculate_rolling_vwap(data, 20)
        vwap_rolling_50 = calculate_rolling_vwap(data, 50)
        
        divergences = detect_divergences(data, cvd)
        
        # Build orderflow table from last 10 complete candles
        last_10_candles = data_enriched.tail(11).iloc[:-1]  # Exclude current incomplete candle
        orderflow_table = []
        for idx, row in last_10_candles.iterrows():
            orderflow_table.append({
                'time': int(idx.timestamp()),
                'buyVol': float(row['BuyVolume']),
                'sellVol': float(row['SellVolume']),
                'delta': float(row['Delta']),
                'volume': float(row['Volume'])
            })
        
        result = {
            'symbol': symbol,
            'period': period,
            'interval': interval,
            'footprint': footprint,
            'cvd': cvd,
            'vrvp': vrvp,
            'vwaps': {
                'anchored': {
                    'session': vwap_session,
                    'daily': vwap_daily,
                    'weekly': vwap_weekly,
                    'monthly': vwap_monthly
                },
                'rolling': {
                    'period_10': vwap_rolling_10,
                    'period_20': vwap_rolling_20,
                    'period_50': vwap_rolling_50
                }
            },
            'divergences': divergences,
            'orderflowTable': orderflow_table
        }
        
        # Use custom JSON encoder to handle NaN values
        def convert_nan(obj):
            """Recursively convert NaN to None for JSON serialization"""
            if isinstance(obj, float):
                if np.isnan(obj) or np.isinf(obj):
                    return None
                return obj
            elif isinstance(obj, dict):
                return {k: convert_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_nan(item) for item in obj]
            return obj
        
        clean_result = convert_nan(result)
        return json.dumps(clean_result)
    
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
    
    # Analyze and output result
    result = analyze_orderflow(symbol=symbol, period=period, interval=interval)
    print(result)
