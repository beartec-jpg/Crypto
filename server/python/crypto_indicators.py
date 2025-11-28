#!/usr/bin/env python3
"""
Crypto data fetcher with custom technical indicators
Fetches XRP/USDT data and calculates RSI, MACD, SMA, EMA
"""

import yfinance as yf
import pandas as pd
import numpy as np
import json
import sys
from datetime import datetime, timedelta


def calculate_rsi(data, period=14):
    """Calculate Relative Strength Index"""
    delta = data['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_macd(data, fast=12, slow=26, signal=9):
    """Calculate MACD (Moving Average Convergence Divergence)"""
    ema_fast = data['Close'].ewm(span=fast, adjust=False).mean()
    ema_slow = data['Close'].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_sma(data, period=20):
    """Calculate Simple Moving Average"""
    return data['Close'].rolling(window=period).mean()


def calculate_ema(data, period=20):
    """Calculate Exponential Moving Average"""
    return data['Close'].ewm(span=period, adjust=False).mean()


def calculate_bollinger_bands(data, period=20, std_dev=2):
    """Calculate Bollinger Bands"""
    sma = data['Close'].rolling(window=period).mean()
    std = data['Close'].rolling(window=period).std()
    upper_band = sma + (std * std_dev)
    lower_band = sma - (std * std_dev)
    return upper_band, sma, lower_band


def fetch_crypto_data(symbol='XRP-USD', period='3mo', interval='1d'):
    """
    Fetch crypto data from Yahoo Finance
    
    Args:
        symbol: Crypto pair (e.g., 'XRP-USD', 'BTC-USD')
        period: Time period ('1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max')
        interval: Data interval ('1m', '5m', '15m', '1h', '1d', '1wk', '1mo')
    """
    try:
        # Download data
        data = yf.download(symbol, period=period, interval=interval, progress=False)
        
        if data.empty:
            return {"error": f"No data found for {symbol}"}
        
        # Reset index to make Date/Datetime a column
        data.reset_index(inplace=True)
        
        # Flatten MultiIndex columns if present (yfinance returns MultiIndex for single symbol)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0] if col[1] == '' or col[1] == symbol else col[0] for col in data.columns]
        
        # Handle different column names for date
        date_column = None
        for col in ['Date', 'Datetime', 'index']:
            if col in data.columns:
                date_column = col
                break
        
        if date_column is None:
            return {"error": "No date column found in data"}
        
        # Rename to standard 'Date' for consistency
        if date_column != 'Date':
            data.rename(columns={date_column: 'Date'}, inplace=True)
        
        # Calculate indicators
        data['SMA_20'] = calculate_sma(data, 20)
        data['SMA_50'] = calculate_sma(data, 50)
        data['EMA_12'] = calculate_ema(data, 12)
        data['EMA_26'] = calculate_ema(data, 26)
        data['RSI_14'] = calculate_rsi(data, 14)
        
        macd, signal, histogram = calculate_macd(data)
        data['MACD'] = macd
        data['MACD_Signal'] = signal
        data['MACD_Histogram'] = histogram
        
        bb_upper, bb_middle, bb_lower = calculate_bollinger_bands(data)
        data['BB_Upper'] = bb_upper
        data['BB_Middle'] = bb_middle
        data['BB_Lower'] = bb_lower
        
        # Convert to format suitable for Lightweight Charts
        result = {
            "symbol": symbol,
            "period": period,
            "interval": interval,
            "candlestick": [],
            "volume": [],
            "indicators": {
                "sma_20": [],
                "sma_50": [],
                "ema_12": [],
                "ema_26": [],
                "rsi_14": [],
                "macd": [],
                "macd_signal": [],
                "macd_histogram": [],
                "bb_upper": [],
                "bb_middle": [],
                "bb_lower": []
            }
        }
        
        for idx, row in data.iterrows():
            # Convert datetime to Unix timestamp (seconds)
            try:
                if isinstance(row['Date'], pd.Timestamp):
                    timestamp = int(row['Date'].timestamp())
                elif isinstance(row['Date'], (int, float)):
                    timestamp = int(row['Date'])
                else:
                    # Try to convert to pandas Timestamp
                    timestamp = int(pd.Timestamp(str(row['Date'])).timestamp())
            except Exception as e:
                # Skip rows with invalid timestamps
                continue
            
            # Candlestick data
            result["candlestick"].append({
                "time": timestamp,
                "open": float(row['Open']) if not pd.isna(row['Open']) else None,
                "high": float(row['High']) if not pd.isna(row['High']) else None,
                "low": float(row['Low']) if not pd.isna(row['Low']) else None,
                "close": float(row['Close']) if not pd.isna(row['Close']) else None
            })
            
            # Volume data
            result["volume"].append({
                "time": timestamp,
                "value": float(row['Volume']) if not pd.isna(row['Volume']) else 0
            })
            
            # Indicator data (only add if not NaN)
            if not pd.isna(row['SMA_20']):
                result["indicators"]["sma_20"].append({
                    "time": timestamp,
                    "value": float(row['SMA_20'])
                })
            
            if not pd.isna(row['SMA_50']):
                result["indicators"]["sma_50"].append({
                    "time": timestamp,
                    "value": float(row['SMA_50'])
                })
            
            if not pd.isna(row['EMA_12']):
                result["indicators"]["ema_12"].append({
                    "time": timestamp,
                    "value": float(row['EMA_12'])
                })
            
            if not pd.isna(row['EMA_26']):
                result["indicators"]["ema_26"].append({
                    "time": timestamp,
                    "value": float(row['EMA_26'])
                })
            
            if not pd.isna(row['RSI_14']):
                result["indicators"]["rsi_14"].append({
                    "time": timestamp,
                    "value": float(row['RSI_14'])
                })
            
            if not pd.isna(row['MACD']):
                result["indicators"]["macd"].append({
                    "time": timestamp,
                    "value": float(row['MACD'])
                })
            
            if not pd.isna(row['MACD_Signal']):
                result["indicators"]["macd_signal"].append({
                    "time": timestamp,
                    "value": float(row['MACD_Signal'])
                })
            
            if not pd.isna(row['MACD_Histogram']):
                result["indicators"]["macd_histogram"].append({
                    "time": timestamp,
                    "value": float(row['MACD_Histogram'])
                })
            
            if not pd.isna(row['BB_Upper']):
                result["indicators"]["bb_upper"].append({
                    "time": timestamp,
                    "value": float(row['BB_Upper'])
                })
            
            if not pd.isna(row['BB_Middle']):
                result["indicators"]["bb_middle"].append({
                    "time": timestamp,
                    "value": float(row['BB_Middle'])
                })
            
            if not pd.isna(row['BB_Lower']):
                result["indicators"]["bb_lower"].append({
                    "time": timestamp,
                    "value": float(row['BB_Lower'])
                })
        
        return result
        
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    # Get parameters from command line or use defaults
    symbol = sys.argv[1] if len(sys.argv) > 1 else 'XRP-USD'
    period = sys.argv[2] if len(sys.argv) > 2 else '3mo'
    interval = sys.argv[3] if len(sys.argv) > 3 else '1d'
    
    # Fetch and calculate
    result = fetch_crypto_data(symbol, period, interval)
    
    # Output as JSON
    print(json.dumps(result))
