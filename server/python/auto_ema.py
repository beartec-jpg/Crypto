#!/usr/bin/env python3
"""
Auto-adjusting EMA calculator for crypto data
Finds the optimal EMA length (5-20) based on price reaction to touches
"""

import yfinance as yf
import pandas as pd
import json
import sys
from datetime import datetime


def calculate_best_ema(symbol='XRP-USD', period='1mo', interval='15m', ema_range=(5, 20), min_touches=1):
    """
    Calculate the best EMA length based on reactivity to price touches
    
    Args:
        symbol: Crypto pair (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y')
        interval: Data interval ('1m', '5m', '15m', '1h', '1d', '1wk')
        ema_range: Tuple of (min_length, max_length) to test
        min_touches: Minimum touches required to consider an EMA valid
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
        
        def get_ema_reactivity(length):
            """Calculate reactivity score for a specific EMA length"""
            data[f'EMA_{length}'] = data['Close'].ewm(span=length, adjust=False).mean()
            total_bull_touches = 0
            reacted_bull = 0
            total_bear_touches = 0
            reacted_bear = 0
            
            for i in range(1, len(data) - 1):
                # Bullish touch: previous close > EMA, low <= EMA, current close > EMA
                if (data['Close'].iloc[i + 1] > data[f'EMA_{length}'].iloc[i + 1] and
                    data['Low'].iloc[i] <= data[f'EMA_{length}'].iloc[i] and
                    data['Close'].iloc[i] > data[f'EMA_{length}'].iloc[i]):
                    total_bull_touches += 1
                    if data['Close'].iloc[i - 1] > data[f'EMA_{length}'].iloc[i - 1]:
                        reacted_bull += 1
                
                # Bearish touch: previous close < EMA, high >= EMA, current close < EMA
                if (data['Close'].iloc[i + 1] < data[f'EMA_{length}'].iloc[i + 1] and
                    data['High'].iloc[i] >= data[f'EMA_{length}'].iloc[i] and
                    data['Close'].iloc[i] < data[f'EMA_{length}'].iloc[i]):
                    total_bear_touches += 1
                    if data['Close'].iloc[i - 1] < data[f'EMA_{length}'].iloc[i - 1]:
                        reacted_bear += 1
            
            bull_p = (reacted_bull / total_bull_touches * 100) if total_bull_touches >= min_touches else -1.0
            bear_p = (reacted_bear / total_bear_touches * 100) if total_bear_touches >= min_touches else -1.0
            return bull_p if bull_p > -1.0 else bear_p if bear_p > -1.0 else -1.0, total_bull_touches, total_bear_touches

        # Find best EMA
        best_length = ema_range[0]
        best_score = -1.0
        best_bull_touches = 0
        best_bear_touches = 0
        
        for length in range(ema_range[0], ema_range[1] + 1):
            score, bull_touches, bear_touches = get_ema_reactivity(length)
            if score > best_score:
                best_score = score
                best_length = length
                best_bull_touches = bull_touches
                best_bear_touches = bear_touches
        
        # Calculate EMA data for the best length
        data['EMA'] = data['Close'].ewm(span=best_length, adjust=False).mean()
        
        # Convert timestamps to milliseconds (JavaScript format)
        def to_timestamp(dt):
            if isinstance(dt, pd.Timestamp):
                return int(dt.timestamp() * 1000)
            return int(dt.timestamp() * 1000)
        
        # Prepare candlestick data
        candlestick_data = []
        for _, row in data.iterrows():
            candlestick_data.append({
                'time': to_timestamp(row['Date']),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close'])
            })
        
        # Prepare EMA data
        ema_data = []
        for _, row in data.iterrows():
            if pd.notna(row['EMA']):
                ema_data.append({
                    'time': to_timestamp(row['Date']),
                    'value': float(row['EMA'])
                })
        
        # Prepare volume data
        volume_data = []
        for _, row in data.iterrows():
            volume_data.append({
                'time': to_timestamp(row['Date']),
                'value': float(row['Volume'])
            })
        
        # Prepare JSON response
        result = {
            'symbol': symbol,
            'period': period,
            'interval': interval,
            'candlestick': candlestick_data,
            'volume': volume_data,
            'ema': ema_data,
            'best_ema_length': int(best_length),
            'best_score': round(best_score, 2),
            'bull_touches': int(best_bull_touches),
            'bear_touches': int(best_bear_touches)
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
    
    # Calculate and output result
    result = calculate_best_ema(symbol=symbol, period=period, interval=interval)
    print(result)
