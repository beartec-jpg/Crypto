#!/usr/bin/env python3
import ccxt
import sys
import json
import time
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Any, Tuple
import statistics

EXCHANGES = {
    'binanceus': {'id': 'binanceus', 'name': 'Binance US', 'priority': 1.0},
    'okx': {'id': 'okx', 'name': 'OKX', 'priority': 0.9},
    'gateio': {'id': 'gateio', 'name': 'Gate.io', 'priority': 0.85},
    'kraken': {'id': 'kraken', 'name': 'Kraken', 'priority': 0.8},
    'kucoin': {'id': 'kucoin', 'name': 'KuCoin', 'priority': 0.75},
    'coinbase': {'id': 'coinbase', 'name': 'Coinbase', 'priority': 0.7}
}

DIVERGENCE_THRESHOLD = 0.20  # 20% divergence triggers warning
MIN_EXCHANGES_REQUIRED = 2  # Lowered to 2 since some exchanges are geo-blocked

# Reliability settings
MAX_RETRIES = 2  # Number of retries for failed exchanges
TIMEOUT_MS = 15000  # Timeout for slow exchanges (15 seconds)
RETRY_DELAY_MS = 1000  # Base delay between retries (1 second)

def normalize_symbol(symbol: str, exchange_id: str) -> str:
    """Normalize symbol format for different exchanges"""
    symbol = symbol.upper().replace('-', '')
    
    # Extract base and quote currencies
    if symbol.endswith('USDT'):
        base = symbol[:-4]  # Remove USDT
        quote = 'USDT'
    elif symbol.endswith('USD'):
        base = symbol[:-3]  # Remove USD
        quote = 'USD'
    else:
        # Assume it's already in the right format
        return symbol
    
    # Format for specific exchanges
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

def validate_trade_data(trades: List[Dict], exchange_id: str) -> Tuple[bool, str]:
    """Validate trade data quality"""
    if not trades:
        return False, "No trades returned"
    
    if len(trades) < 10:
        return False, f"Insufficient trades: {len(trades)}"
    
    buy_count = sum(1 for t in trades if t.get('side') == 'buy')
    sell_count = len(trades) - buy_count
    
    if buy_count == 0 or sell_count == 0:
        return False, f"Suspicious buy/sell ratio: {buy_count}/{sell_count}"
    
    ratio = max(buy_count, sell_count) / min(buy_count, sell_count)
    if ratio > 10:
        return False, f"Extreme buy/sell imbalance: {ratio:.1f}:1"
    
    timestamps = [t['timestamp'] for t in trades if 'timestamp' in t]
    if len(timestamps) < len(trades) * 0.9:
        return False, "Missing timestamps"
    
    if timestamps:
        time_gaps = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
        max_gap = max(time_gaps) if time_gaps else 0
        if max_gap > 3600000:  # 1 hour gap
            return False, f"Large time gap detected: {max_gap/60000:.1f}m"
    
    return True, "Valid"

def fetch_trades_from_exchange(exchange_id: str, symbol: str, since_ms: int = None, until_ms: int = None, limit: int = 1000, retry_count: int = 0) -> Tuple[List[Dict], Dict[str, Any]]:
    """Fetch trades from a single exchange with error handling and retry logic"""
    metadata = {
        'exchange': EXCHANGES[exchange_id]['name'],
        'exchange_id': exchange_id,
        'success': False,
        'trades_count': 0,
        'error': None,
        'response_time_ms': 0,
        'data_quality': 'unknown',
        'retries': retry_count
    }
    
    start_time = time.time()
    
    try:
        normalized_symbol = normalize_symbol(symbol, exchange_id)
        exchange_class = getattr(ccxt, exchange_id)
        exchange = exchange_class({
            'enableRateLimit': True,
            'timeout': TIMEOUT_MS,
        })
        
        # Fetch trades with time range if provided
        # Coinbase requires 'until' parameter when using 'since'
        if since_ms:
            if exchange_id == 'coinbase' and until_ms:
                trades = exchange.fetch_trades(normalized_symbol, since=since_ms, limit=limit, params={'until': until_ms})
            else:
                trades = exchange.fetch_trades(normalized_symbol, since=since_ms, limit=limit)
        else:
            trades = exchange.fetch_trades(normalized_symbol, limit=limit)
        
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['trades_count'] = len(trades)
        
        is_valid, validation_msg = validate_trade_data(trades, exchange_id)
        metadata['data_quality'] = 'valid' if is_valid else 'invalid'
        metadata['validation_message'] = validation_msg
        
        if is_valid:
            metadata['success'] = True
            retry_info = f" (after {retry_count} retries)" if retry_count > 0 else ""
            print(f"✅ {EXCHANGES[exchange_id]['name']}: {len(trades)} trades in {metadata['response_time_ms']}ms{retry_info}", file=sys.stderr)
            return trades, metadata
        else:
            metadata['error'] = f"Validation failed: {validation_msg}"
            print(f"⚠️ {EXCHANGES[exchange_id]['name']}: {validation_msg}", file=sys.stderr)
            return [], metadata
            
    except Exception as e:
        metadata['response_time_ms'] = int((time.time() - start_time) * 1000)
        metadata['error'] = str(e)
        metadata['data_quality'] = 'error'
        
        # Retry logic
        if retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_MS * (2 ** retry_count) / 1000  # Exponential backoff
            print(f"🔄 {EXCHANGES[exchange_id]['name']}: Retrying in {delay:.1f}s (attempt {retry_count + 1}/{MAX_RETRIES})...", file=sys.stderr)
            time.sleep(delay)
            return fetch_trades_from_exchange(exchange_id, symbol, since_ms, until_ms, limit, retry_count + 1)
        else:
            print(f"❌ {EXCHANGES[exchange_id]['name']}: {str(e)}", file=sys.stderr)
            return [], metadata

def calculate_delta_per_exchange(trades: List[Dict], interval_ms: int, exchange_id: str) -> Dict[int, Dict[str, float]]:
    """Calculate delta footprint for a single exchange"""
    candles = defaultdict(lambda: {'buy_vol': 0.0, 'sell_vol': 0.0, 'delta': 0.0, 'total_vol': 0.0, 'trade_count': 0})
    
    for trade in trades:
        timestamp = trade['timestamp']
        candle_ts = (timestamp // interval_ms) * interval_ms
        
        amount = trade['amount']
        is_buy = trade['side'] == 'buy'
        
        if is_buy:
            candles[candle_ts]['buy_vol'] += amount
        else:
            candles[candle_ts]['sell_vol'] += amount
        
        candles[candle_ts]['total_vol'] += amount
        candles[candle_ts]['trade_count'] += 1
    
    for ts in candles:
        candles[ts]['delta'] = candles[ts]['buy_vol'] - candles[ts]['sell_vol']
    
    return candles

def detect_divergence(exchange_deltas: Dict[str, Dict[int, Dict[str, float]]], timestamp: int) -> Dict[str, Any]:
    """Detect divergence across exchanges for a specific timestamp"""
    deltas = []
    exchange_names = []
    
    for exchange_id, candles in exchange_deltas.items():
        if timestamp in candles:
            deltas.append(candles[timestamp]['delta'])
            exchange_names.append(EXCHANGES[exchange_id]['name'])
    
    if len(deltas) < 2:
        return {'has_divergence': False, 'variance': 0, 'exchanges': exchange_names}
    
    mean_delta = statistics.mean(deltas)
    
    if mean_delta == 0:
        variance = 0
    else:
        variance = statistics.stdev(deltas) / abs(mean_delta) if len(deltas) > 1 else 0
    
    has_divergence = variance > DIVERGENCE_THRESHOLD
    
    return {
        'has_divergence': has_divergence,
        'variance': variance,
        'mean_delta': mean_delta,
        'deltas': {exchange_names[i]: deltas[i] for i in range(len(deltas))},
        'exchanges': exchange_names,
        'exchange_count': len(exchange_names)
    }

def volume_weighted_average(exchange_deltas: Dict[str, Dict[int, Dict[str, float]]]) -> Dict[int, Dict[str, Any]]:
    """Calculate volume-weighted average delta across exchanges"""
    all_timestamps = set()
    for candles in exchange_deltas.values():
        all_timestamps.update(candles.keys())
    
    averaged_data = {}
    
    for timestamp in sorted(all_timestamps):
        total_weighted_delta = 0.0
        total_weight = 0.0
        total_volume = 0.0
        exchange_participation = []
        
        for exchange_id, candles in exchange_deltas.items():
            if timestamp in candles:
                candle = candles[timestamp]
                volume = candle['total_vol']
                delta = candle['delta']
                priority = EXCHANGES[exchange_id]['priority']
                
                weight = volume * priority
                total_weighted_delta += delta * weight
                total_weight += weight
                total_volume += volume
                
                exchange_participation.append({
                    'exchange': EXCHANGES[exchange_id]['name'],
                    'delta': delta,
                    'volume': volume,
                    'weight': weight
                })
        
        if total_weight > 0:
            avg_delta = total_weighted_delta / total_weight
            
            divergence_info = detect_divergence(exchange_deltas, timestamp)
            
            averaged_data[timestamp] = {
                'delta': avg_delta,
                'volume': total_volume,
                'exchange_count': len(exchange_participation),
                'exchanges': exchange_participation,
                'divergence': divergence_info,
                'confidence': min(1.0, len(exchange_participation) / len(EXCHANGES))
            }
    
    return averaged_data

def analyze_multi_exchange_orderflow(symbol: str = 'XRPUSDT', period: str = '1mo', interval: str = '15m') -> str:
    """Main function to analyze orderflow across multiple exchanges"""
    try:
        interval_map = {
            '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000,
            '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000,
            '6h': 21600000, '12h': 43200000, '1d': 86400000
        }
        
        interval_ms = interval_map.get(interval, 900000)
        
        # Calculate time range for last 50 candles to provide deeper history
        # This gives more rows in the orderflow table for analysis
        num_candles = 50
        lookback_ms = interval_ms * num_candles
        
        now = datetime.now()
        until_ms = int(now.timestamp() * 1000)
        since_ms = until_ms - lookback_ms
        since_dt = datetime.fromtimestamp(since_ms / 1000)
        
        print(f"\n🔄 Fetching orderflow data from {len(EXCHANGES)} exchanges...", file=sys.stderr)
        print(f"Symbol: {symbol}, Last {num_candles} candles, Interval: {interval}", file=sys.stderr)
        print(f"Time range: {since_dt.strftime('%Y-%m-%d %H:%M:%S')} to {now.strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
        
        exchange_deltas = {}
        all_metadata = []
        
        for exchange_id in EXCHANGES.keys():
            trades, metadata = fetch_trades_from_exchange(exchange_id, symbol, since_ms=since_ms, until_ms=until_ms, limit=1000)
            all_metadata.append(metadata)
            
            if metadata['success']:
                deltas = calculate_delta_per_exchange(trades, interval_ms, exchange_id)
                if deltas:
                    exchange_deltas[exchange_id] = deltas
        
        if len(exchange_deltas) < MIN_EXCHANGES_REQUIRED:
            return json.dumps({
                'error': f'Insufficient exchanges responding (got {len(exchange_deltas)}, need {MIN_EXCHANGES_REQUIRED})',
                'metadata': all_metadata
            })
        
        print(f"\n✅ Successfully fetched data from {len(exchange_deltas)}/{len(EXCHANGES)} exchanges", file=sys.stderr)
        
        averaged_data = volume_weighted_average(exchange_deltas)
        
        footprint = []
        cvd_data = []
        cumulative_delta = 0
        prev_cvd = 0
        divergence_alerts = []
        
        for timestamp in sorted(averaged_data.keys()):
            data = averaged_data[timestamp]
            delta = data['delta']
            cumulative_delta += delta
            
            footprint.append({
                'time': timestamp // 1000,
                'delta': delta,
                'volume': data['volume'],
                'exchanges': data['exchange_count'],
                'confidence': data['confidence'],
                'divergence': data['divergence']['has_divergence']
            })
            
            is_increasing = cumulative_delta > prev_cvd
            cvd_data.append({
                'time': timestamp // 1000,
                'value': cumulative_delta,
                'delta': delta,
                'color': 'green' if is_increasing else 'red',
                'confidence': data['confidence']
            })
            
            if data['divergence']['has_divergence']:
                divergence_alerts.append({
                    'time': timestamp // 1000,
                    'variance': data['divergence']['variance'],
                    'exchanges': data['divergence']['exchanges'],
                    'deltas': data['divergence']['deltas']
                })
            
            prev_cvd = cumulative_delta
        
        orderflow_table = []
        # Return all available candles for the table, not just last 10
        all_timestamps = sorted(averaged_data.keys())
        for timestamp in all_timestamps:
            data = averaged_data[timestamp]
            buy_vol = sum(e['volume'] for e in data['exchanges'] if e['delta'] > 0)
            sell_vol = sum(e['volume'] for e in data['exchanges'] if e['delta'] < 0)
            
            orderflow_table.append({
                'time': timestamp // 1000,
                'buyVol': buy_vol,
                'sellVol': sell_vol,
                'delta': data['delta'],
                'volume': data['volume'],
                'exchanges': data['exchange_count'],
                'confidence': data['confidence']
            })
        
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
        print(f"  - Success rate: {success_rate*100:.1f}%", file=sys.stderr)
        print(f"  - Avg response time: {avg_response_time:.0f}ms", file=sys.stderr)
        print(f"  - Divergence alerts: {len(divergence_alerts)}", file=sys.stderr)
        
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({'error': f'Analysis failed: {str(e)}'})

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
