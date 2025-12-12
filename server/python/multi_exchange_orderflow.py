#!/usr/bin/env python3
import ccxt
import sys
import json
import time
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Any, Tuple
import statistics

# Exchanges that provide OHLCV data with taker buy volume
EXCHANGES = {
    'binanceus': {'id': 'binanceus', 'name': 'Binance US', 'priority': 1.0, 'has_taker_volume': True},
    'okx': {'id': 'okx', 'name': 'OKX', 'priority': 0.9, 'has_taker_volume': True},
    'gateio': {'id': 'gateio', 'name': 'Gate.io', 'priority': 0.85, 'has_taker_volume': False},
    'kraken': {'id': 'kraken', 'name': 'Kraken', 'priority': 0.8, 'has_taker_volume': False},
    'kucoin': {'id': 'kucoin', 'name': 'KuCoin', 'priority': 0.75, 'has_taker_volume': False},
    'coinbase': {'id': 'coinbase', 'name': 'Coinbase', 'priority': 0.7, 'has_taker_volume': False}
}

DIVERGENCE_THRESHOLD = 0.20  # 20% divergence triggers warning
MIN_EXCHANGES_REQUIRED = 2

# Reliability settings
TIMEOUT_MS = 15000

def normalize_symbol(symbol: str, exchange_id: str) -> str:
    """Normalize symbol format for different exchanges"""
    symbol = symbol.upper().replace('-', '')
    
    if symbol.endswith('USDT'):
        base = symbol[:-4]
        quote = 'USDT'
    elif symbol.endswith('USD'):
        base = symbol[:-3]
        quote = 'USD'
    else:
        return symbol
    
    if exchange_id == 'binanceus':
        return f"{base}USDT"
    elif exchange_id == 'okx':
        return f"{base}/USDT"
    elif exchange_id == 'gateio':
        return f"{base}/USDT"
    elif exchange_id == 'kraken':
        return f"{base}/USD"
    elif exchange_id == 'kucoin':
        return f"{base}-USDT"
    elif exchange_id == 'coinbase':
        return f"{base}-USD"
    
    return f"{base}{quote}"

def fetch_ohlcv_from_exchange(exchange_id: str, symbol: str, interval: str, since_ms: int, limit: int = 100) -> Tuple[List[Dict], Dict[str, Any]]:
    """Fetch OHLCV candlestick data from a single exchange"""
    metadata = {
        'exchange': EXCHANGES[exchange_id]['name'],
        'exchange_id': exchange_id,
        'success': False,
        'candles_count': 0,
        'error': None,
        'response_time_ms': 0,
        'data_quality': 'unknown'
    }
    
    start_time = time.time()
    
    try:
        normalized_symbol = normalize_symbol(symbol, exchange_id)
        exchange_class = getattr(ccxt, exchange_id)
        exchange = exchange_class({
            'enableRateLimit': True,
            'timeout': TIMEOUT_MS,
        })
        
        # Map interval to ccxt timeframe format
        timeframe_map = {
            '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
            '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h',
            '6h': '6h', '12h': '12h', '1d': '1d'
        }
        timeframe = timeframe_map.get(interval, '15m')
        
        # Fetch OHLCV data
        ohlcv = exchange.fetch_ohlcv(normalized_symbol, timeframe, since=since_ms, limit=limit)
        
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['candles_count'] = len(ohlcv)
        
        if ohlcv and len(ohlcv) > 0:
            metadata['success'] = True
            metadata['data_quality'] = 'valid'
            
            # Parse OHLCV data into structured format
            # Standard OHLCV: [timestamp, open, high, low, close, volume]
            candles = []
            for candle in ohlcv:
                timestamp = candle[0]
                volume = candle[5] if len(candle) > 5 else 0
                
                # For exchanges without taker volume, estimate 50/50 split
                # This is a reasonable approximation for delta calculation
                buy_volume = volume * 0.5
                sell_volume = volume * 0.5
                
                candles.append({
                    'timestamp': timestamp,
                    'open': candle[1],
                    'high': candle[2],
                    'low': candle[3],
                    'close': candle[4],
                    'volume': volume,
                    'buy_volume': buy_volume,
                    'sell_volume': sell_volume,
                    'delta': buy_volume - sell_volume  # Will be 0 for estimated, but volume contributes to weighting
                })
            
            print(f"✅ {EXCHANGES[exchange_id]['name']}: {len(candles)} candles in {metadata['response_time_ms']}ms", file=sys.stderr)
            return candles, metadata
        else:
            metadata['error'] = 'No candles returned'
            metadata['data_quality'] = 'empty'
            print(f"⚠️ {EXCHANGES[exchange_id]['name']}: No candles returned", file=sys.stderr)
            return [], metadata
            
    except Exception as e:
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['error'] = str(e)
        metadata['data_quality'] = 'error'
        print(f"❌ {EXCHANGES[exchange_id]['name']}: {str(e)}", file=sys.stderr)
        return [], metadata

def fetch_binance_ohlcv_with_taker_volume(symbol: str, interval: str, since_ms: int, limit: int = 100) -> Tuple[List[Dict], Dict[str, Any]]:
    """Fetch Binance OHLCV with actual taker buy/sell volume breakdown"""
    import urllib.request
    import urllib.error
    
    metadata = {
        'exchange': 'Binance US',
        'exchange_id': 'binanceus',
        'success': False,
        'candles_count': 0,
        'error': None,
        'response_time_ms': 0,
        'data_quality': 'unknown'
    }
    
    start_time = time.time()
    
    try:
        # Binance klines include taker buy volume at index 9
        url = f"https://api.binance.us/api/v3/klines?symbol={symbol}&interval={interval}&startTime={since_ms}&limit={limit}"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode())
        
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['candles_count'] = len(data)
        
        if data and len(data) > 0:
            metadata['success'] = True
            metadata['data_quality'] = 'valid'
            
            candles = []
            for kline in data:
                # Binance kline format:
                # [0] Open time, [1] Open, [2] High, [3] Low, [4] Close, [5] Volume,
                # [6] Close time, [7] Quote volume, [8] Trades, [9] Taker buy base volume,
                # [10] Taker buy quote volume, [11] Ignore
                timestamp = kline[0]
                volume = float(kline[5])
                taker_buy_volume = float(kline[9])
                taker_sell_volume = volume - taker_buy_volume
                
                candles.append({
                    'timestamp': timestamp,
                    'open': float(kline[1]),
                    'high': float(kline[2]),
                    'low': float(kline[3]),
                    'close': float(kline[4]),
                    'volume': volume,
                    'buy_volume': taker_buy_volume,
                    'sell_volume': taker_sell_volume,
                    'delta': taker_buy_volume - taker_sell_volume
                })
            
            print(f"✅ Binance US: {len(candles)} candles with taker volume in {metadata['response_time_ms']}ms", file=sys.stderr)
            return candles, metadata
        else:
            metadata['error'] = 'No candles returned'
            print(f"⚠️ Binance US: No candles returned", file=sys.stderr)
            return [], metadata
            
    except Exception as e:
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['error'] = str(e)
        metadata['data_quality'] = 'error'
        print(f"❌ Binance US: {str(e)}", file=sys.stderr)
        return [], metadata

def fetch_okx_ohlcv_with_taker_volume(symbol: str, interval: str, since_ms: int, limit: int = 100) -> Tuple[List[Dict], Dict[str, Any]]:
    """Fetch OKX OHLCV - OKX provides volume but not taker breakdown in standard API"""
    import urllib.request
    
    metadata = {
        'exchange': 'OKX',
        'exchange_id': 'okx',
        'success': False,
        'candles_count': 0,
        'error': None,
        'response_time_ms': 0,
        'data_quality': 'unknown'
    }
    
    start_time = time.time()
    
    try:
        # OKX uses different interval format
        interval_map = {
            '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
            '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H',
            '6h': '6H', '12h': '12H', '1d': '1D'
        }
        okx_interval = interval_map.get(interval, '15m')
        
        # Format symbol for OKX (e.g., XRP-USDT)
        base = symbol.replace('USDT', '')
        okx_symbol = f"{base}-USDT"
        
        url = f"https://www.okx.com/api/v5/market/candles?instId={okx_symbol}&bar={okx_interval}&after={since_ms + (limit * 60000 * 15)}&limit={limit}"
        
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read().decode())
        
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        
        if result.get('data') and len(result['data']) > 0:
            data = result['data']
            metadata['candles_count'] = len(data)
            metadata['success'] = True
            metadata['data_quality'] = 'valid'
            
            candles = []
            for kline in reversed(data):  # OKX returns newest first
                # OKX format: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
                timestamp = int(kline[0])
                volume = float(kline[5])
                
                # OKX doesn't provide taker breakdown in candle API
                # Use price movement to estimate buy/sell pressure
                open_price = float(kline[1])
                close_price = float(kline[4])
                
                # If close > open, more buying pressure; if close < open, more selling
                if close_price >= open_price:
                    buy_ratio = 0.55  # Slightly more buying
                else:
                    buy_ratio = 0.45  # Slightly more selling
                
                buy_volume = volume * buy_ratio
                sell_volume = volume * (1 - buy_ratio)
                
                candles.append({
                    'timestamp': timestamp,
                    'open': open_price,
                    'high': float(kline[2]),
                    'low': float(kline[3]),
                    'close': close_price,
                    'volume': volume,
                    'buy_volume': buy_volume,
                    'sell_volume': sell_volume,
                    'delta': buy_volume - sell_volume
                })
            
            print(f"✅ OKX: {len(candles)} candles in {metadata['response_time_ms']}ms", file=sys.stderr)
            return candles, metadata
        else:
            metadata['error'] = 'No candles returned'
            print(f"⚠️ OKX: No candles returned", file=sys.stderr)
            return [], metadata
            
    except Exception as e:
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['error'] = str(e)
        metadata['data_quality'] = 'error'
        print(f"❌ OKX: {str(e)}", file=sys.stderr)
        return [], metadata

def aggregate_multi_exchange_data(all_exchange_data: Dict[str, List[Dict]]) -> Dict[int, Dict[str, Any]]:
    """Aggregate candle data from multiple exchanges into unified delta/CVD"""
    
    # Collect all timestamps
    all_timestamps = set()
    for exchange_id, candles in all_exchange_data.items():
        for candle in candles:
            # Normalize to seconds
            ts = candle['timestamp']
            if ts > 10000000000:  # milliseconds
                ts = ts // 1000
            all_timestamps.add(ts)
    
    aggregated = {}
    
    for timestamp in sorted(all_timestamps):
        total_delta = 0.0
        total_volume = 0.0
        total_buy_volume = 0.0
        total_sell_volume = 0.0
        exchange_participation = []
        deltas_per_exchange = {}
        
        for exchange_id, candles in all_exchange_data.items():
            # Find candle for this timestamp
            for candle in candles:
                candle_ts = candle['timestamp']
                if candle_ts > 10000000000:
                    candle_ts = candle_ts // 1000
                
                if candle_ts == timestamp:
                    delta = candle['delta']
                    volume = candle['volume']
                    priority = EXCHANGES[exchange_id]['priority']
                    
                    total_delta += delta * priority
                    total_volume += volume
                    total_buy_volume += candle['buy_volume']
                    total_sell_volume += candle['sell_volume']
                    
                    exchange_participation.append({
                        'exchange': EXCHANGES[exchange_id]['name'],
                        'delta': delta,
                        'volume': volume
                    })
                    deltas_per_exchange[EXCHANGES[exchange_id]['name']] = delta
                    break
        
        if exchange_participation:
            # Normalize delta by total priority weight
            total_weight = sum(EXCHANGES[ep['exchange'].lower().replace(' ', '').replace('.', '')]['priority'] 
                              for ep in exchange_participation 
                              if ep['exchange'].lower().replace(' ', '').replace('.', '') in [e.replace('us', ' us') for e in EXCHANGES.keys()] or True)
            
            # Calculate divergence
            deltas = [ep['delta'] for ep in exchange_participation]
            has_divergence = False
            variance = 0
            
            if len(deltas) >= 2:
                mean_delta = statistics.mean(deltas)
                if mean_delta != 0:
                    variance = statistics.stdev(deltas) / abs(mean_delta) if len(deltas) > 1 else 0
                    has_divergence = variance > DIVERGENCE_THRESHOLD
            
            aggregated[timestamp] = {
                'delta': total_delta / len(exchange_participation) if exchange_participation else 0,
                'volume': total_volume,
                'buy_volume': total_buy_volume,
                'sell_volume': total_sell_volume,
                'exchange_count': len(exchange_participation),
                'exchanges': exchange_participation,
                'confidence': len(exchange_participation) / len(EXCHANGES),
                'divergence': {
                    'has_divergence': has_divergence,
                    'variance': variance,
                    'deltas': deltas_per_exchange
                }
            }
    
    return aggregated

def analyze_multi_exchange_orderflow(symbol: str = 'XRPUSDT', period: str = '1mo', interval: str = '15m') -> str:
    """Main function to analyze orderflow across multiple exchanges using OHLCV data"""
    try:
        interval_map = {
            '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
            '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
            '6h': 21600000, '12h': 43200000, '1d': 86400000
        }
        
        interval_ms = interval_map.get(interval, 900000)
        
        # Calculate time range for last 50 candles
        num_candles = 50
        lookback_ms = interval_ms * num_candles
        
        now = datetime.now()
        until_ms = int(now.timestamp() * 1000)
        since_ms = until_ms - lookback_ms
        since_dt = datetime.fromtimestamp(since_ms / 1000)
        
        print(f"\n🔄 Fetching OHLCV data from {len(EXCHANGES)} exchanges...", file=sys.stderr)
        print(f"Symbol: {symbol}, Last {num_candles} candles, Interval: {interval}", file=sys.stderr)
        print(f"Time range: {since_dt.strftime('%Y-%m-%d %H:%M:%S')} to {now.strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
        
        all_exchange_data = {}
        all_metadata = []
        
        # Fetch from Binance with actual taker volume (most accurate)
        binance_candles, binance_meta = fetch_binance_ohlcv_with_taker_volume(symbol, interval, since_ms, num_candles)
        all_metadata.append(binance_meta)
        if binance_meta['success']:
            all_exchange_data['binanceus'] = binance_candles
        
        # Fetch from OKX
        okx_candles, okx_meta = fetch_okx_ohlcv_with_taker_volume(symbol, interval, since_ms, num_candles)
        all_metadata.append(okx_meta)
        if okx_meta['success']:
            all_exchange_data['okx'] = okx_candles
        
        # Fetch from other exchanges using ccxt
        for exchange_id in ['gateio', 'kraken', 'kucoin', 'coinbase']:
            candles, metadata = fetch_ohlcv_from_exchange(exchange_id, symbol, interval, since_ms, num_candles)
            all_metadata.append(metadata)
            if metadata['success']:
                all_exchange_data[exchange_id] = candles
        
        if len(all_exchange_data) < MIN_EXCHANGES_REQUIRED:
            return json.dumps({
                'error': f'Insufficient exchanges responding (got {len(all_exchange_data)}, need {MIN_EXCHANGES_REQUIRED})',
                'metadata': {'exchanges': all_metadata}
            })
        
        print(f"\n✅ Successfully fetched data from {len(all_exchange_data)}/{len(EXCHANGES)} exchanges", file=sys.stderr)
        
        # Aggregate data across exchanges
        aggregated_data = aggregate_multi_exchange_data(all_exchange_data)
        
        # Build output arrays
        footprint = []
        cvd_data = []
        orderflow_table = []
        cumulative_delta = 0
        prev_cvd = 0
        divergence_alerts = []
        
        # Calculate average volume for high-value divergence detection
        all_volumes = [aggregated_data[ts]['volume'] for ts in aggregated_data.keys()]
        avg_volume = statistics.mean(all_volumes) if all_volumes else 0
        
        for timestamp in sorted(aggregated_data.keys()):
            data = aggregated_data[timestamp]
            delta = data['delta']
            cumulative_delta += delta
            
            # CVD vs Delta divergence detection:
            # Divergence = CVD rising + delta negative, OR CVD dropping + delta positive
            cvd_rising = cumulative_delta > prev_cvd
            cvd_dropping = cumulative_delta < prev_cvd
            delta_positive = delta > 0
            delta_negative = delta < 0
            
            has_divergence = (cvd_rising and delta_negative) or (cvd_dropping and delta_positive)
            
            # High-value divergence: volume is 1.5x+ average (flame symbol)
            volume_multiple = data['volume'] / avg_volume if avg_volume > 0 else 0
            is_high_value = has_divergence and volume_multiple >= 1.5
            
            footprint.append({
                'time': timestamp,
                'delta': delta,
                'volume': data['volume'],
                'exchanges': data['exchange_count'],
                'confidence': data['confidence'],
                'divergence': has_divergence,
                'highValueDivergence': is_high_value,
                'volumeMultiple': round(volume_multiple, 2)
            })
            
            is_increasing = cumulative_delta > prev_cvd
            cvd_data.append({
                'time': timestamp,
                'value': cumulative_delta,
                'delta': delta,
                'color': 'green' if is_increasing else 'red',
                'confidence': data['confidence']
            })
            
            orderflow_table.append({
                'time': timestamp,
                'buyVol': data['buy_volume'],
                'sellVol': data['sell_volume'],
                'delta': delta,
                'volume': data['volume'],
                'exchanges': data['exchange_count'],
                'confidence': data['confidence'],
                'divergence': has_divergence,
                'highValueDivergence': is_high_value,
                'volumeMultiple': round(volume_multiple, 2)
            })
            
            if has_divergence:
                divergence_alerts.append({
                    'time': timestamp,
                    'type': 'high_value' if is_high_value else 'normal',
                    'volumeMultiple': round(volume_multiple, 2),
                    'cvdDirection': 'rising' if cvd_rising else 'dropping',
                    'deltaSign': 'positive' if delta_positive else 'negative'
                })
            
            prev_cvd = cumulative_delta
        
        success_rate = sum(1 for m in all_metadata if m['success']) / len(all_metadata)
        avg_response_time = statistics.mean([m['response_time_ms'] for m in all_metadata])
        
        result = {
            'footprint': footprint,
            'cvd': cvd_data,
            'orderflowTable': orderflow_table,
            'divergences': divergence_alerts,
            'metadata': {
                'exchanges': all_metadata,
                'success_rate': success_rate,
                'avg_response_time_ms': avg_response_time,
                'total_candles': len(footprint),
                'period': period,
                'interval': interval
            }
        }
        
        print(f"\n📊 Analysis complete:", file=sys.stderr)
        print(f"  - Candles: {len(footprint)}", file=sys.stderr)
        print(f"  - Exchanges with data: {len(all_exchange_data)}", file=sys.stderr)
        print(f"  - Success rate: {success_rate*100:.1f}%", file=sys.stderr)
        print(f"  - Avg response time: {avg_response_time:.0f}ms", file=sys.stderr)
        print(f"  - Divergence alerts: {len(divergence_alerts)}", file=sys.stderr)
        
        return json.dumps(result)
        
    except Exception as e:
        import traceback
        return json.dumps({'error': f'Analysis failed: {str(e)}', 'traceback': traceback.format_exc()})

if __name__ == '__main__':
    if len(sys.argv) > 1:
        symbol = sys.argv[1] if len(sys.argv) > 1 else 'XRPUSDT'
        period = sys.argv[2] if len(sys.argv) > 2 else '1mo'
        interval = sys.argv[3] if len(sys.argv) > 3 else '15m'
        
        result = analyze_multi_exchange_orderflow(symbol, period, interval)
        print(result)
    else:
        result = analyze_multi_exchange_orderflow()
        print(result)
