#!/usr/bin/env python3
"""
Multi-timeframe EMA calculator using CoinGecko API
Finds optimal EMAs in 3 categories: short (5-15), medium (20-50), long (100-200)
Only counts touches where candle CLOSES on correct side of EMA
"""

import requests
import pandas as pd
import json
import sys
from datetime import datetime, timedelta


def convert_symbol_to_coingecko(symbol: str) -> str:
    """Convert Yahoo Finance symbol format to CoinGecko ID"""
    symbol_map = {
        'XRP-USD': 'ripple',
        'BTC-USD': 'bitcoin',
        'ETH-USD': 'ethereum',
        'ADA-USD': 'cardano',
        'SOL-USD': 'solana'
    }
    return symbol_map.get(symbol, 'bitcoin')


def period_to_days(period: str) -> int:
    """Convert period string to days"""
    if period.endswith('mo'):
        value = int(period[:-2])
        return value * 30
    elif period.endswith('y'):
        value = int(period[:-1])
        return value * 365
    elif period.endswith('d'):
        value = int(period[:-1])
        return value
    elif period.endswith('wk'):
        value = int(period[:-2])
        return value * 7
    else:
        return 30  # Default 1 month


def fetch_coingecko_ohlc(coin_id: str, days: int) -> pd.DataFrame:
    """
    Fetch OHLC data from CoinGecko API
    CoinGecko auto-selects granularity based on days:
    - 1-2 days: 30 minute intervals
    - 3-30 days: 4 hour intervals  
    - 31-90 days: 4 hour intervals
    - 90+ days: 4 day intervals
    """
    url = f'https://api.coingecko.com/api/v3/coins/{coin_id}/ohlc'
    params = {
        'vs_currency': 'usd',
        'days': days
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data:
            return pd.DataFrame()
        
        # CoinGecko returns: [[timestamp_ms, open, high, low, close], ...]
        df = pd.DataFrame(data, columns=['timestamp', 'Open', 'High', 'Low', 'Close'])
        
        # Convert timestamp to datetime
        df['Date'] = pd.to_datetime(df['timestamp'], unit='ms')
        df = df.drop('timestamp', axis=1)
        
        # Add Volume column (CoinGecko free tier doesn't provide volume in OHLC)
        # We'll set it to 0 since EMAs don't need volume
        df['Volume'] = 0
        
        return df
        
    except Exception as e:
        print(f"Error fetching from CoinGecko: {str(e)}", file=sys.stderr)
        return pd.DataFrame()


def calculate_multi_ema(symbol='XRP-USD', period='1mo', interval='15m'):
    """
    Calculate best EMAs across 3 timeframe categories using CoinGecko data
    
    Args:
        symbol: Crypto pair (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y')
        interval: Data interval (ignored - CoinGecko auto-selects granularity)
    
    Returns:
        JSON with best EMA from each category (short, medium, long)
    """
    try:
        # Convert symbol to CoinGecko ID
        coin_id = convert_symbol_to_coingecko(symbol)
        days = period_to_days(period)
        
        # Fetch data from CoinGecko
        data = fetch_coingecko_ohlc(coin_id, days)
        
        if data.empty:
            return json.dumps({'error': f'No data found for {symbol}'})
        
        def get_ema_reactivity(length):
            """
            Calculate reactivity score for a specific EMA length
            Only counts touches where candle CLOSES on correct side
            """
            data[f'EMA_{length}'] = data['Close'].ewm(span=length, adjust=False).mean()
            
            bull_touches = 0
            bear_touches = 0
            
            for i in range(1, len(data)):
                prev_close = data['Close'].iloc[i - 1]
                curr_close = data['Close'].iloc[i]
                curr_low = data['Low'].iloc[i]
                curr_high = data['High'].iloc[i]
                curr_ema = data[f'EMA_{length}'].iloc[i]
                
                # Bull touch: price dips to/through EMA BUT candle closes ABOVE EMA
                # This shows EMA acted as support
                if curr_low <= curr_ema and curr_close > curr_ema:
                    bull_touches += 1
                
                # Bear touch: price rallies to/through EMA BUT candle closes BELOW EMA
                # This shows EMA acted as resistance
                if curr_high >= curr_ema and curr_close < curr_ema:
                    bear_touches += 1
            
            total_touches = bull_touches + bear_touches
            reactivity = (total_touches / len(data)) * 100 if len(data) > 0 else 0
            
            return {
                'length': length,
                'reactivity': reactivity,
                'bullTouches': bull_touches,
                'bearTouches': bear_touches,
                'totalTouches': total_touches
            }
        
        # Test different EMA ranges
        short_emas = range(5, 16)   # 5-15
        medium_emas = range(20, 51)  # 20-50
        long_emas = range(100, 201)  # 100-200
        
        # Find best EMA in each category
        best_short = max([get_ema_reactivity(l) for l in short_emas], key=lambda x: x['reactivity'])
        best_medium = max([get_ema_reactivity(l) for l in medium_emas], key=lambda x: x['reactivity'])
        best_long = max([get_ema_reactivity(l) for l in long_emas], key=lambda x: x['reactivity'])
        
        # Calculate adaptive EMAs based on recent volatility
        recent_data = data.tail(50)
        volatility = recent_data['Close'].pct_change().std()
        
        # Adjust EMA lengths based on volatility
        # Higher volatility -> shorter EMAs
        # Lower volatility -> longer EMAs
        volatility_factor = min(max(volatility * 100, 0.5), 2.0)
        
        adaptive_short = int(best_short['length'] / volatility_factor)
        adaptive_medium = int(best_medium['length'] / volatility_factor)
        adaptive_long = int(best_long['length'] / volatility_factor)
        
        # Clamp to valid ranges
        adaptive_short = max(5, min(15, adaptive_short))
        adaptive_medium = max(20, min(50, adaptive_medium))
        adaptive_long = max(100, min(200, adaptive_long))
        
        # Calculate adaptive EMA values
        data[f'EMA_short'] = data['Close'].ewm(span=best_short['length'], adjust=False).mean()
        data[f'EMA_medium'] = data['Close'].ewm(span=best_medium['length'], adjust=False).mean()
        data[f'EMA_long'] = data['Close'].ewm(span=best_long['length'], adjust=False).mean()
        
        data[f'EMA_short_adaptive'] = data['Close'].ewm(span=adaptive_short, adjust=False).mean()
        data[f'EMA_medium_adaptive'] = data['Close'].ewm(span=adaptive_medium, adjust=False).mean()
        data[f'EMA_long_adaptive'] = data['Close'].ewm(span=adaptive_long, adjust=False).mean()
        
        # Prepare chart data
        chart_data = []
        for _, row in data.iterrows():
            candle = {
                'time': int(row['Date'].timestamp()),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': float(row['Volume']) if 'Volume' in row else 0,
                'ema_short': float(row['EMA_short']),
                'ema_medium': float(row['EMA_medium']),
                'ema_long': float(row['EMA_long']),
                'ema_short_adaptive': float(row['EMA_short_adaptive']),
                'ema_medium_adaptive': float(row['EMA_medium_adaptive']),
                'ema_long_adaptive': float(row['EMA_long_adaptive'])
            }
            chart_data.append(candle)
        
        result = {
            'symbol': symbol,
            'period': period,
            'data': chart_data,
            'analysis': {
                'short': {
                    'length': best_short['length'],
                    'reactivity': round(best_short['reactivity'], 2),
                    'touches': best_short['totalTouches'],
                    'adaptive_length': adaptive_short
                },
                'medium': {
                    'length': best_medium['length'],
                    'reactivity': round(best_medium['reactivity'], 2),
                    'touches': best_medium['totalTouches'],
                    'adaptive_length': adaptive_medium
                },
                'long': {
                    'length': best_long['length'],
                    'reactivity': round(best_long['reactivity'], 2),
                    'touches': best_long['totalTouches'],
                    'adaptive_length': adaptive_long
                },
                'volatility': round(volatility * 100, 2),
                'source': 'CoinGecko API'
            }
        }
        
        return json.dumps(result)
        
    except Exception as e:
        import traceback
        return json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        })


if __name__ == '__main__':
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'XRP-USD'
    period = sys.argv[2] if len(sys.argv) > 2 else '1mo'
    interval = sys.argv[3] if len(sys.argv) > 3 else '15m'  # Ignored by CoinGecko
    
    result = calculate_multi_ema(symbol, period, interval)
    print(result)
