interface CacheEntry {
  symbol: string;
  timeframe: string;
  data: any[];
  timestamp: number;
  oldestTime: number;
  newestTime: number;
}

interface RequestQueue {
  symbol: string;
  timeframe: string;
  startTime?: number;
  endTime?: number;
  priority: number;
}

class HistoricalDataCache {
  private cache: Map<string, CacheEntry>;
  private requestQueue: RequestQueue[];
  private isProcessing: boolean;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly REQUEST_DELAY = 100; // 100ms between requests
  private readonly MAX_CANDLES_PER_REQUEST = 1000; // Binance limit
  private readonly DESIRED_HISTORY = 5000;
  
  constructor() {
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
  }
  
  private getCacheKey(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
  }
  
  async getHistoricalData(
    symbol: string, 
    timeframe: string,
    limit: number = 5000
  ): Promise<any[]> {
    const cacheKey = this.getCacheKey(symbol, timeframe);
    const cached = this.cache.get(cacheKey);
    
    // Check cache validity
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      if (cached.data.length >= limit) {
        return cached.data.slice(-limit);
      }
    }
    
    // Need to fetch more data
    const existingData = cached?.data || [];
    const needMore = limit - existingData.length;
    
    if (needMore > 0) {
      await this.queueHistoricalRequests(
        symbol, 
        timeframe, 
        needMore,
        cached?.oldestTime
      );
    }
    
    return existingData.slice(-limit);
  }
  
  private async queueHistoricalRequests(
    symbol: string,
    timeframe: string,
    needCount: number,
    oldestTime?: number
  ): Promise<void> {
    const requestsNeeded = Math.ceil(needCount / this.MAX_CANDLES_PER_REQUEST);
    const interval = this.timeframeToMs(timeframe);
    let currentEndTime = oldestTime || Date.now();
    
    for (let i = 0; i < requestsNeeded; i++) {
      const startTime = currentEndTime - (this.MAX_CANDLES_PER_REQUEST * interval);
      
      this.requestQueue.push({
        symbol,
        timeframe,
        startTime,
        endTime: currentEndTime,
        priority: i
      });
      
      currentEndTime = startTime;
    }
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  
  private async processQueue(): Promise<void> {
    if (this.requestQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    this.requestQueue.sort((a, b) => a.priority - b.priority);
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      
      try {
        const data = await this.fetchBinanceData(
          request.symbol,
          request.timeframe,
          request.startTime,
          request.endTime
        );
        
        this.updateCache(request.symbol, request.timeframe, data);
        
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
      } catch (error) {
        console.error('[HistoricalCache] Request failed:', error);
        request.priority += 100;
        this.requestQueue.push(request);
      }
    }
    
    this.isProcessing = false;
  }
  
  private async fetchBinanceData(
    symbol: string,
    timeframe: string,
    startTime?: number,
    endTime?: number
  ): Promise<any[]> {
    const binanceTimeframe = this.convertTimeframe(timeframe);
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceTimeframe}&limit=${this.MAX_CANDLES_PER_REQUEST}`;
    
    if (startTime) url += `&startTime=${startTime}`;
    if (endTime) url += `&endTime=${endTime}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const klines = await response.json();
    
    return klines.map((kline: any) => ({
      time: Math.floor(kline[0] / 1000),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));
  }
  
  private updateCache(symbol: string, timeframe: string, newData: any[]): void {
    const cacheKey = this.getCacheKey(symbol, timeframe);
    const existing = this.cache.get(cacheKey);
    
    let combinedData = newData;
    
    if (existing) {
      const existingTimes = new Set(existing.data.map(d => d.time));
      const filtered = newData.filter(d => !existingTimes.has(d.time));
      combinedData = [...filtered, ...existing.data].sort((a, b) => a.time - b.time);
    }
    
    this.cache.set(cacheKey, {
      symbol,
      timeframe,
      data: combinedData,
      timestamp: Date.now(),
      oldestTime: combinedData[0]?.time * 1000 || Date.now(),
      newestTime: combinedData[combinedData.length - 1]?.time * 1000 || Date.now(),
    });
  }
  
  private timeframeToMs(timeframe: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[timeframe] || 60000;
  }
  
  private convertTimeframe(tf: string): string {
    const map: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
    };
    return map[tf] || '1h';
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  getCacheStats(): { entries: number; totalCandles: number } {
    let totalCandles = 0;
    this.cache.forEach(entry => {
      totalCandles += entry.data.length;
    });
    return {
      entries: this.cache.size,
      totalCandles
    };
  }
}

export const historicalDataCache = new HistoricalDataCache();
