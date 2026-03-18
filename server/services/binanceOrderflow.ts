import WebSocket from 'ws';
import { EventEmitter } from 'events';

interface BybitTrade {
  T: number;   // Timestamp (ms)
  s: string;   // Symbol
  S: string;   // Side: 'Buy' | 'Sell'
  v: string;   // Volume (quantity)
  p: string;   // Price
  i: string;   // Trade ID
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  deltaVolume: number;
  trades: number;
}

export class BinanceOrderflowService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private candles: Map<string, Candle> = new Map(); // key: "timeframe-timestamp"
  private symbol: string;
  private timeframes: number[] = [60, 300, 900, 3600]; // 1m, 5m, 15m, 1h in seconds
  private isConnected = false;

  constructor(symbol: string = 'XRPUSDT') {
    super();
    this.symbol = symbol.toUpperCase();
  }

  private async fetchHistoricalKlines() {
    // Bybit interval strings: '1'=1m, '5'=5m, '15'=15m, '60'=1h
    const intervals = [
      { bybitInterval: '1', timeframe: 60, label: '1m' },
      { bybitInterval: '5', timeframe: 300, label: '5m' },
      { bybitInterval: '15', timeframe: 900, label: '15m' },
      { bybitInterval: '60', timeframe: 3600, label: '1h' },
    ];

    console.log(`📊 Fetching historical klines for ${this.symbol} from Bybit...`);

    for (const { bybitInterval, timeframe, label } of intervals) {
      try {
        const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${this.symbol}&interval=${bybitInterval}&limit=100`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

        if (!response.ok) {
          console.error(`Failed to fetch ${label} klines from Bybit:`, response.statusText);
          continue;
        }

        const json = await response.json();
        // Bybit kline list: [timestamp, open, high, low, close, volume, turnover] — newest first
        const klines: string[][] = json?.result?.list ?? [];

        for (const kline of klines) {
          const candleTime = Math.floor(parseInt(kline[0]) / 1000); // ms → seconds
          const key = `${timeframe}-${candleTime}`;

          const totalVolume = parseFloat(kline[5]);
          // Bybit doesn't expose taker buy/sell split in kline endpoint; approximate 50/50
          const buyVolume = totalVolume * 0.5;
          const sellVolume = totalVolume * 0.5;

          this.candles.set(key, {
            time: candleTime,
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: totalVolume,
            buyVolume,
            sellVolume,
            deltaVolume: 0,
            trades: 0,
          });
        }

        console.log(`✅ Loaded ${klines.length} ${label} candles from Bybit`);
      } catch (error) {
        console.error(`Error fetching ${label} klines from Bybit:`, error);
      }
    }
  }

  connect() {
    if (this.ws) {
      this.ws.close();
    }

    const url = `wss://stream.bybit.com/v5/public/linear`;
    console.log(`🔌 Connecting to Bybit public linear stream: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', async () => {
      console.log(`✅ Connected to Bybit stream for ${this.symbol}`);

      // Subscribe to public trade feed
      const subscribeMsg = JSON.stringify({
        op: 'subscribe',
        args: [`publicTrade.${this.symbol}`],
      });
      this.ws?.send(subscribeMsg);

      // Fetch historical data before marking as connected
      await this.fetchHistoricalKlines();

      this.isConnected = true;
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        // Bybit sends pong responses and subscription confirmations; skip non-trade messages
        if (msg.topic && msg.topic.startsWith('publicTrade.') && Array.isArray(msg.data)) {
          for (const trade of msg.data as BybitTrade[]) {
            this.processBybitTrade(trade);
          }
        }
      } catch (error) {
        console.error('Error processing Bybit trade:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('Bybit WebSocket error:', error);
      this.isConnected = false;
    });

    this.ws.on('close', () => {
      console.log('❌ Disconnected from Bybit');
      this.isConnected = false;
      this.reconnect();
    });

    this.ws.on('ping', () => {
      this.ws?.pong();
    });
  }

  private reconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log('🔄 Reconnecting to Bybit...');
      this.connect();
    }, 5000);
  }

  private processBybitTrade(trade: BybitTrade) {
    const price = parseFloat(trade.p);
    const quantity = parseFloat(trade.v);
    const timestamp = Math.floor(trade.T / 1000); // ms → seconds
    const isBuy = trade.S === 'Buy';

    // Update candles for each timeframe
    for (const timeframe of this.timeframes) {
      const candleTime = Math.floor(timestamp / timeframe) * timeframe;
      const key = `${timeframe}-${candleTime}`;

      let candle = this.candles.get(key);

      if (!candle) {
        candle = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          deltaVolume: 0,
          trades: 0,
        };
        this.candles.set(key, candle);
      }

      candle.close = price;
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.volume += quantity;
      candle.trades += 1;

      if (isBuy) {
        candle.buyVolume += quantity;
      } else {
        candle.sellVolume += quantity;
      }

      candle.deltaVolume = candle.buyVolume - candle.sellVolume;

      this.emit('candleUpdate', {
        timeframe,
        candle: { ...candle },
      });
    }

    this.cleanOldCandles();
  }

  private cleanOldCandles() {
    const maxCandles = 1000;
    
    for (const timeframe of this.timeframes) {
      const candlesForTimeframe = Array.from(this.candles.entries())
        .filter(([key]) => key.startsWith(`${timeframe}-`))
        .sort(([keyA], [keyB]) => {
          const timeA = parseInt(keyA.split('-')[1]);
          const timeB = parseInt(keyB.split('-')[1]);
          return timeB - timeA;
        });

      if (candlesForTimeframe.length > maxCandles) {
        const toDelete = candlesForTimeframe.slice(maxCandles);
        for (const [key] of toDelete) {
          this.candles.delete(key);
        }
      }
    }
  }

  getCandles(timeframe: number, limit: number = 100): Candle[] {
    const candlesForTimeframe = Array.from(this.candles.entries())
      .filter(([key]) => key.startsWith(`${timeframe}-`))
      .map(([_, candle]) => candle)
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);

    return candlesForTimeframe;
  }

  getCVD(timeframe: number, limit: number = 100): { time: number; cvd: number }[] {
    const candles = this.getCandles(timeframe, limit).reverse(); // oldest first
    
    let cumulativeDelta = 0;
    const cvdData = candles.map(candle => {
      cumulativeDelta += candle.deltaVolume;
      return {
        time: candle.time,
        cvd: cumulativeDelta,
      };
    });

    return cvdData.reverse(); // newest first
  }

  getOrderflowTable(timeframe: number, limit: number = 11): any[] {
    const candles = this.getCandles(timeframe, limit); // newest first
    
    // Calculate CVD from oldest to newest without mutating candles array
    let cumulativeDelta = 0;
    const cvdData = [...candles].reverse().map(candle => {
      cumulativeDelta += candle.deltaVolume;
      return cumulativeDelta;
    }).reverse(); // back to newest first

    return candles.map((candle, index) => ({
      bar: index === 0 ? 'Current' : `-${index}`,
      time: candle.time,
      open: candle.open.toFixed(4),
      high: candle.high.toFixed(4),
      low: candle.low.toFixed(4),
      close: candle.close.toFixed(4),
      volume: Math.round(candle.volume),
      buyVolume: Math.round(candle.buyVolume),
      sellVolume: Math.round(candle.sellVolume),
      deltaVolume: Math.round(candle.deltaVolume),
      cvd: Math.round(cvdData[index]),
      trades: candle.trades,
    }));
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.candles.clear();
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      symbol: this.symbol.toUpperCase(),
      candleCount: this.candles.size,
      timeframes: this.timeframes,
    };
  }
}

// Singleton instance per symbol
const orderflowServices = new Map<string, BinanceOrderflowService>();

export function getOrderflowService(symbol: string = 'XRPUSDT'): BinanceOrderflowService {
  const key = symbol.toLowerCase();
  
  if (!orderflowServices.has(key)) {
    const service = new BinanceOrderflowService(key);
    service.connect();
    orderflowServices.set(key, service);
  }

  return orderflowServices.get(key)!;
}
