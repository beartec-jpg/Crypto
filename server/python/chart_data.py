#!/usr/bin/env python3
"""
Chart Data Fetcher for Crypto Trading
Fetches OHLCV data from Yahoo Finance
"""

import sys
import json
import yfinance as yf
import pandas as pd
from typing import Dict, Any


def fetch_chart_data(symbol: str, period: str = '1mo', interval: str = '15m') -> Dict[str, Any]:
    """
    Fetch OHLCV data from Yahoo Finance
    
    Args:
        symbol: Trading symbol (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1h', '1d', '1mo', '1y', etc.)
        interval: Candle interval ('1m', '5m', '15m', '1h', '1d', etc.)
    
    Returns:
        Dict with candlestick data formatted for TradingView Lightweight Charts
    """
    try:
        # Download data from Yahoo Finance
        data = yf.download(symbol, period=period, interval=interval, progress=False)
        
        if data.empty:
            return {
                'symbol': symbol,
                'period': period,
                'interval': interval,
                'data': [],
                'count': 0
            }
        
        # Flatten MultiIndex columns if present (yfinance returns MultiIndex for single symbol)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        
        # Reset index to access datetime
        data = data.reset_index()
        
        # Convert to TradingView Lightweight Charts format
        candlesticks = []
        for _, row in data.iterrows():
            candlesticks.append({
                'time': int(row['Datetime'].timestamp()) if 'Datetime' in data.columns else int(row['Date'].timestamp()),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': float(row['Volume'])
            })
        
        return {
            'symbol': symbol,
            'period': period,
            'interval': interval,
            'data': candlesticks,
            'count': len(candlesticks)
        }
    
    except Exception as e:
        return {
            'symbol': symbol,
            'period': period,
            'interval': interval,
            'data': [],
            'count': 0,
            'error': str(e)
        }


def main():
    """Main entry point for command-line execution"""
    if len(sys.argv) < 4:
        print(json.dumps({
            'error': 'Usage: chart_data.py <symbol> <period> <interval>'
        }))
        sys.exit(1)
    
    symbol = sys.argv[1]
    period = sys.argv[2]
    interval = sys.argv[3]
    
    result = fetch_chart_data(symbol, period, interval)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
