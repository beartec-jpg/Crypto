#!/usr/bin/env python3
"""
Multi-timeframe EMA calculator for crypto data
Finds optimal EMAs in 3 categories: short (5-15), medium (20-50), long (100-200)
Only counts touches where candle CLOSES on correct side of EMA
"""

import yfinance as yf
import pandas as pd
import json
import sys
from datetime import datetime


def calculate_multi_ema(symbol='XRP-USD', period='1mo', interval='15m'):
    """
    Calculate best EMAs across 3 timeframe categories
    
    Args:
        symbol: Crypto pair (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y')
        interval: Data interval ('1m', '5m', '15m', '1h', '1d', '1wk')
    
    Returns:
        JSON with best EMA from each category (short, medium, long)
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
                
                # Bear touch: price rises to/through EMA BUT candle closes BELOW EMA
                # This shows EMA acted as resistance
                elif curr_high >= curr_ema and curr_close < curr_ema:
                    bear_touches += 1
            
            total_touches = bull_touches + bear_touches
            
            # Reactivity score: percentage of total candles that had valid touches
            score = (total_touches / len(data) * 100) if len(data) > 0 else 0
            
            return score, bull_touches, bear_touches
        
        # Define EMA ranges for each category
        ranges = {
            'short': (5, 15),
            'medium': (20, 50),
            'long': (100, 200)
        }
        
        results = {}
        ema_details = {}  # Store all tested EMAs for adaptive selection
        
        # Test each category and store all results
        for category, (min_len, max_len) in ranges.items():
            best_length = min_len
            best_score = -1
            best_bull = 0
            best_bear = 0
            
            # Store details for each tested EMA
            ema_details[category] = []
            
            for length in range(min_len, max_len + 1):
                score, bull, bear = get_ema_reactivity(length)
                
                # Store this EMA's details
                ema_details[category].append({
                    'length': length,
                    'score': score,
                    'bull_touches': bull,
                    'bear_touches': bear
                })
                
                if score > best_score:
                    best_score = score
                    best_length = length
                    best_bull = bull
                    best_bear = bear
            
            # Calculate EMA data for best length in this category
            data[f'EMA_{category}'] = data['Close'].ewm(span=best_length, adjust=False).mean()
            
            results[category] = {
                'length': int(best_length),
                'score': round(best_score, 2),
                'bull_touches': int(best_bull),
                'bear_touches': int(best_bear)
            }
        
        # Determine trend direction based on latest EMA positions
        latest_short = data['EMA_short'].iloc[-1]
        latest_medium = data['EMA_medium'].iloc[-1]
        latest_long = data['EMA_long'].iloc[-1]
        
        trend = 'neutral'
        if latest_short > latest_long and latest_medium > latest_long:
            trend = 'bull'
        elif latest_short < latest_long and latest_medium < latest_long:
            trend = 'bear'
        
        # Find adaptive EMAs based on trend
        adaptive_results = {}
        for category in ['short', 'medium', 'long']:
            if trend == 'bull':
                # Find EMA with best bull touches
                best_adaptive = max(ema_details[category], key=lambda x: x['bull_touches'])
            elif trend == 'bear':
                # Find EMA with best bear touches
                best_adaptive = max(ema_details[category], key=lambda x: x['bear_touches'])
            else:
                # Neutral: use overall best
                best_adaptive = max(ema_details[category], key=lambda x: x['score'])
            
            adaptive_length = best_adaptive['length']
            
            # Calculate adaptive EMA
            data[f'EMA_{category}_adaptive'] = data['Close'].ewm(span=adaptive_length, adjust=False).mean()
            
            adaptive_results[category] = {
                'length': int(adaptive_length),
                'score': round(best_adaptive['score'], 2),
                'bull_touches': int(best_adaptive['bull_touches']),
                'bear_touches': int(best_adaptive['bear_touches'])
            }
        
        # Convert timestamps to milliseconds (JavaScript format)
        def to_timestamp(dt):
            if isinstance(dt, pd.Timestamp):
                return int(dt.timestamp())
            return int(dt.timestamp())
        
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
        
        # Prepare EMA data for each category (both overall and adaptive)
        ema_data = {}
        adaptive_ema_data = {}
        for category in ['short', 'medium', 'long']:
            ema_data[category] = []
            adaptive_ema_data[category] = []
            for _, row in data.iterrows():
                if pd.notna(row[f'EMA_{category}']):
                    ema_data[category].append({
                        'time': to_timestamp(row['Date']),
                        'value': float(row[f'EMA_{category}'])
                    })
                if pd.notna(row[f'EMA_{category}_adaptive']):
                    adaptive_ema_data[category].append({
                        'time': to_timestamp(row['Date']),
                        'value': float(row[f'EMA_{category}_adaptive'])
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
            'trend': trend,
            'short': {
                **results['short'],
                'ema': ema_data['short']
            },
            'medium': {
                **results['medium'],
                'ema': ema_data['medium']
            },
            'long': {
                **results['long'],
                'ema': ema_data['long']
            },
            'adaptive': {
                'short': {
                    **adaptive_results['short'],
                    'ema': adaptive_ema_data['short']
                },
                'medium': {
                    **adaptive_results['medium'],
                    'ema': adaptive_ema_data['medium']
                },
                'long': {
                    **adaptive_results['long'],
                    'ema': adaptive_ema_data['long']
                }
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
    
    # Calculate and output result
    result = calculate_multi_ema(symbol=symbol, period=period, interval=interval)
    print(result)
