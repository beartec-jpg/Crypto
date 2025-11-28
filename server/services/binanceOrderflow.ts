import WebSocket from 'ws';
import { EventEmitter } from 'events';

interface BinanceTrade {
  e: string;      // Event type
  E: number;      // Event time
  s: string;      // Symbol
  a: number;      // Aggregate trade ID
  p: string;      // Price
  q: string;      // Quantity
  f: number;      // First trade ID
  l: number;      // Last trade ID
  T: number;      // Trade time
  m: boolean;     // Is buyer the market maker? (true = SELL, false = BUY)
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
    this.symbol = symbol.toLowerCase();
  }

  private async fetchHistoricalKlines() {
    const intervals = ['1m', '5m', '15m', '1h'];
    const timeframeMap: { [key: string]: number } = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
    };

    console.log(`📊 Fetching historical klines for ${this.symbol.toUpperCase()}...`);

    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      const timeframe = timeframeMap[interval];
      
      try {
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${this.symbol.toUpperCase()}&interval=${interval}&limit=100`;
        const response = await fetch(url);
        
        if (!response.ok) {
          console.error(`Failed to fetch ${interval} klines:`, response.statusText);
          continue;
        }

        const klines = await response.json();
        
        // Parse klines: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
        for (const kline of klines) {
          const candleTime = Math.floor(kline[0] / 1000); // Convert ms to seconds
          const key = `${timeframe}-${candleTime}`;
          
          // Estimate buy/sell volume (taker buy volume is buying pressure)
          const totalVolume = parseFloat(kline[5]);
          const takerBuyVolume = parseFloat(kline[9]);
          const takerSellVolume = totalVolume - takerBuyVolume;
          
          this.candles.set(key, {
            time: candleTime,
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: totalVolume,
            buyVolume: takerBuyVolume,
            sellVolume: takerSellVolume,
            deltaVolume: takerBuyVolume - takerSellVolume,
            trades: kline[8],
          });
        }
        
        console.log(`✅ Loaded ${klines.length} ${interval} candles`);
      } catch (error) {
        console.error(`Error fetching ${interval} klines:`, error);
      }
    }
  }

  connect() {
    if (this.ws) {
      this.ws.close();
    }

    const url = `wss://fstream.binance.com/ws/${this.symbol}@aggTrade`;
    console.log(`🔌 Connecting to Binance Futures: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', async () => {
      console.log(`✅ Connected to Binance Futures: ${this.symbol.toUpperCase()}`);
      
      // Fetch historical data before marking as connected
      await this.fetchHistoricalKlines();
      
      this.isConnected = true;
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const trade: BinanceTrade = JSON.parse(data.toString());
        this.processTrade(trade);
      } catch (error) {
        console.error('Error processing trade:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.isConnected = false;
    });

    this.ws.on('close', () => {
      console.log('❌ Disconnected from Binance');
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
      console.log('🔄 Reconnecting to Binance...');
      this.connect();
    }, 5000);
  }

  private processTrade(trade: BinanceTrade) {
    const price = parseFloat(trade.p);
    const quantity = parseFloat(trade.q);
    const timestamp = Math.floor(trade.T / 1000); // Convert to seconds
    const isBuy = !trade.m; // m: true = SELL (buyer is maker), m: false = BUY (buyer is taker)

    // Update candles for each timeframe
    for (const timeframe of this.timeframes) {
      const candleTime = Math.floor(timestamp / timeframe) * timeframe;
      const key = `${timeframe}-${candleTime}`;

      let candle = this.candles.get(key);

      if (!candle) {
        // Create new candle
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

      // Update candle
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

      // Emit candle update
      this.emit('candleUpdate', {
        timeframe,
        candle: { ...candle },
      });
    }

    // Clean old candles (keep last 1000 per timeframe)
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
