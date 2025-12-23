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
from datetime import datetime


def fetch_chart_data(symbol: str, period: str = '1mo', interval: str = '15m', start_date: str = None, end_date: str = None) -> Dict[str, Any]:
    """
    Fetch OHLCV data from Yahoo Finance
    
    Args:
        symbol: Trading symbol (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1h', '1d', '1mo', '1y', etc.) - ignored if start/end provided
        interval: Candle interval ('1m', '5m', '15m', '1h', '1d', etc.)
        start_date: Optional start date in YYYY-MM-DD format
        end_date: Optional end date in YYYY-MM-DD format
    
    Returns:
        Dict with candlestick data formatted for TradingView Lightweight Charts
    """
    try:
        if start_date and end_date:
            data = yf.download(symbol, start=start_date, end=end_date, interval=interval, progress=False)
        else:
            data = yf.download(symbol, period=period, interval=interval, progress=False)
        
        if data.empty:
            return {
                'symbol': symbol,
                'period': period,
                'interval': interval,
                'data': [],
                'count': 0
            }
        
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        
        data = data.reset_index()
        
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
            'error': 'Usage: chart_data.py <symbol> <period> <interval> [start_date] [end_date]'
        }))
        sys.exit(1)
    
    symbol = sys.argv[1]
    period = sys.argv[2]
    interval = sys.argv[3]
    start_date = sys.argv[4] if len(sys.argv) > 4 else None
    end_date = sys.argv[5] if len(sys.argv) > 5 else None
    
    result = fetch_chart_data(symbol, period, interval, start_date, end_date)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
