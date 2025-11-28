import type { Express } from "express";
import { createServer, type Server } from "http";
import { execFile, execSync } from "child_process";
import { promisify } from "util";
import path from "path";
import OpenAI from "openai";
import WebSocket from "ws";
import { storage } from "./storage";
import { CalculationService } from "./services/calculationService";
import { calculationRequestSchema, insertFeedbackSchema } from "@shared/schema";

const execFileAsync = promisify(execFile);

// XAI API disabled - using null API key
const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY // NOW USING THE SECRET
});

// Helper to check if XAI API key is configured - always returns false (disabled)
function checkXaiApiKey(): { configured: boolean; error?: string } {
  // API key disabled - always return not configured
  return {
    configured: false,
    error: "AI analysis is temporarily disabled. API configuration required."
  };
}

// In-memory cache for market analysis (15 min TTL)
interface AnalysisCache {
  analysis: string;
  timestamp: number;
  cost: number;
}
let marketAnalysisCache: AnalysisCache | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// In-memory cache for liquidation data (5 min TTL)
interface LiquidationCache {
  data: any;
  timestamp: number;
  symbol: string;
  interval: string;
}
let liquidationCache: Map<string, LiquidationCache> = new Map();
const LIQUIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory storage for real-time liquidation events
interface LiquidationEvent {
  symbol: string;
  side: 'BUY' | 'SELL'; // BUY = long liquidation, SELL = short liquidation
  price: number;
  quantity: number;
  timestamp: number;
  exchange: 'binance' | 'bybit';
}

// Store last 500 liquidations per symbol
const realtimeLiquidations: Map<string, LiquidationEvent[]> = new Map();
const MAX_LIQUIDATIONS_PER_SYMBOL = 500;

// WebSocket connections for each symbol
const binanceWsConnections: Map<string, WebSocket> = new Map();


// Initialize Binance WebSocket for real-time liquidation tracking
function initBinanceLiquidationStream(symbol: string) {
  const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@forceOrder`;
  
  console.log(`📊 Connecting to Binance liquidation stream for ${symbol}...`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log(`✅ Binance liquidation stream connected: ${symbol}`);
  });
  
  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.o) {
        const order = message.o;
        
        const event: LiquidationEvent = {
          symbol: order.s,
          side: order.S,
          price: parseFloat(order.p),
          quantity: parseFloat(order.q),
          timestamp: order.T,
          exchange: 'binance'
        };
        
        if (!realtimeLiquidations.has(symbol)) {
          realtimeLiquidations.set(symbol, []);
        }
        
        const events = realtimeLiquidations.get(symbol)!;
        events.push(event);
        
        if (events.length > MAX_LIQUIDATIONS_PER_SYMBOL) {
          events.shift();
        }
        
        console.log(`🔥 ${symbol} liquidation: ${event.side} ${event.quantity} @ $${event.price}`);
      }
    } catch (error) {
      console.error(`Error parsing Binance liquidation message:`, error);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Binance WebSocket error for ${symbol}:`, error);
  });
  
  ws.on('close', () => {
    console.log(`🔌 Binance liquidation stream closed for ${symbol}, reconnecting in 5s...`);
    
    setTimeout(() => {
      binanceWsConnections.delete(symbol);
      initBinanceLiquidationStream(symbol);
    }, 5000);
  });
  
  binanceWsConnections.set(symbol, ws);
}

// Initialize Bybit WebSocket for real-time liquidation tracking
// Bybit's new "allLiquidation" stream (Feb 2025) provides ALL liquidations with 500ms updates
const bybitWsConnections: Map<string, WebSocket> = new Map();
const bybitPingIntervals: Map<string, NodeJS.Timeout> = new Map();

function initBybitLiquidationStream(symbol: string) {
  const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
  
  console.log(`📊 Connecting to Bybit liquidation stream for ${symbol}...`);
  
  const ws = new WebSocket(wsUrl);
  let pingInterval: NodeJS.Timeout | null = null;
  
  ws.on('open', () => {
    console.log(`✅ Bybit WebSocket connected, subscribing to ${symbol}...`);
    
    // Subscribe to allLiquidation stream
    ws.send(JSON.stringify({
      op: 'subscribe',
      args: [`allLiquidation.${symbol}`]
    }));
    
    // Bybit requires ping every 20 seconds to keep connection alive
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20000);
    
    bybitPingIntervals.set(symbol, pingInterval);
  });
  
  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle pong response
      if (message.op === 'pong') {
        return;
      }
      
      // Bybit allLiquidation format:
      // {
      //   "topic": "allLiquidation.BTCUSDT",
      //   "type": "snapshot",
      //   "ts": 1739502303204,
      //   "data": [
      //     {
      //       "T": 1739502302929,  // Timestamp
      //       "s": "BTCUSDT",      // Symbol
      //       "S": "Sell",         // Side (Sell = long liquidation, Buy = short liquidation)
      //       "v": "20000",        // Volume/Size
      //       "p": "0.04499"       // Price
      //     }
      //   ]
      // }
      
      if (message.topic && message.topic.startsWith('allLiquidation.') && message.data) {
        for (const liq of message.data) {
          const event: LiquidationEvent = {
            symbol: liq.s,
            side: liq.S === 'Sell' ? 'SELL' : 'BUY',
            price: parseFloat(liq.p),
            quantity: parseFloat(liq.v),
            timestamp: liq.T,
            exchange: 'bybit'
          };
          
          if (!realtimeLiquidations.has(symbol)) {
            realtimeLiquidations.set(symbol, []);
          }
          
          const events = realtimeLiquidations.get(symbol)!;
          events.push(event);
          
          if (events.length > MAX_LIQUIDATIONS_PER_SYMBOL) {
            events.shift();
          }
          
          console.log(`🔥 [Bybit] ${symbol} liquidation: ${event.side} ${event.quantity} @ $${event.price}`);
        }
      }
    } catch (error) {
      console.error(`Error parsing Bybit liquidation message:`, error);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Bybit WebSocket error for ${symbol}:`, error);
  });
  
  ws.on('close', () => {
    console.log(`🔌 Bybit liquidation stream closed for ${symbol}, reconnecting in 5s...`);
    
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    bybitPingIntervals.delete(symbol);
    
    setTimeout(() => {
      bybitWsConnections.delete(symbol);
      initBybitLiquidationStream(symbol);
    }, 5000);
  });
  
  bybitWsConnections.set(symbol, ws);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // No authentication required - open site
  
  // Pass-through middleware (no-op for open access)
  // Sets default user objects for routes that expect authenticated users
  const noAuth = (req: any, _res: any, next: any) => {
    // Set default user for calculator routes
    if (!req.user) {
      req.user = {
        id: 'open-access',
        email: 'user@open.access',
        firstName: 'Open',
        lastName: 'Access',
        claims: { sub: 'open-access' }
      };
    }
    // Set default user for crypto routes
    if (!req.cryptoUser) {
      req.cryptoUser = {
        id: 'open-access-crypto',
        email: 'crypto@open.access',
        firstName: 'Open',
        lastName: 'Access'
      };
    }
    next();
  };
  const isAuthenticated = noAuth;
  const optionalAuth = noAuth;
  const checkSubscription = noAuth;
  const checkExportAccess = noAuth;
  const requireCryptoAuth = noAuth;
  const requireEliteTier = noAuth;
  
  // Stripe removed - all features are now free
  
  // Stub for removed subscription service - returns elite tier for all users
  const cryptoSubscriptionService = {
    getUserSubscription: async () => ({ tier: 'elite', subscriptionStatus: 'active', aiCredits: 999999 }),
    createCheckoutSession: async () => ({ url: null }),
    handleWebhookEvent: async () => ({}),
    cancelSubscription: async () => ({}),
    setDefaultTier: async () => ({}),
    getDefaultTier: () => 'elite',
    resetMonthlyCredits: async () => ({}),
    getSubscriptionStats: async () => ({ 
      tier: 'elite', 
      subscriptionStatus: 'active',
      aiCredits: 999999,
      aiCreditsLimit: 999999,
      renewalDate: null
    }),
    checkTierAccess: async () => true,
    useAICredit: async () => true,
    saveAnalysis: async () => ({}),
    getAnalysisHistory: async () => [],
  };

  // Initialize multi-exchange real-time liquidation WebSocket streams
  const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT', 'SOLUSDT'];
  console.log('🚀 Initializing real-time liquidation streams...');
  SUPPORTED_SYMBOLS.forEach(symbol => {
    initBinanceLiquidationStream(symbol);
    initBybitLiquidationStream(symbol);
  });

  // Real-time liquidation data endpoint (public access)
  app.get("/api/crypto/liquidations/realtime", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const limit = parseInt(req.query.limit as string) || 100;
      const exchange = (req.query.exchange as string)?.toLowerCase() || 'all';

      if (!SUPPORTED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${SUPPORTED_SYMBOLS.join(', ')}`
        });
      }

      const events = realtimeLiquidations.get(symbol) || [];
      
      // Filter by exchange if specified
      const filteredEvents = exchange === 'all' 
        ? events 
        : events.filter(e => e.exchange === exchange);
      
      const recentEvents = filteredEvents.slice(-limit);

      // Group by price ranges for heatmap-style display
      const priceRanges: Map<number, { longs: number, shorts: number, totalVolume: number, exchanges: Set<string> }> = new Map();
      
      recentEvents.forEach(event => {
        const bucketSize = symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 10 : 0.01;
        const priceBucket = Math.round(event.price / bucketSize) * bucketSize;
        
        if (!priceRanges.has(priceBucket)) {
          priceRanges.set(priceBucket, { longs: 0, shorts: 0, totalVolume: 0, exchanges: new Set() });
        }
        
        const bucket = priceRanges.get(priceBucket)!;
        if (event.side === 'SELL') {
          bucket.longs += event.quantity;
        } else {
          bucket.shorts += event.quantity;
        }
        bucket.totalVolume += event.quantity;
        bucket.exchanges.add(event.exchange);
      });

      const heatmapData = Array.from(priceRanges.entries()).map(([price, data]) => ({
        price,
        longs: data.longs,
        shorts: data.shorts,
        totalVolume: data.totalVolume,
        netSide: data.longs > data.shorts ? 'long' : 'short',
        exchanges: Array.from(data.exchanges)
      })).sort((a, b) => a.price - b.price);

      // Calculate exchange breakdown
      const exchangeStats = {
        binance: recentEvents.filter(e => e.exchange === 'binance').length,
        bybit: recentEvents.filter(e => e.exchange === 'bybit').length
      };

      res.json({
        symbol,
        exchange,
        timestamp: Date.now(),
        events: recentEvents,
        heatmap: heatmapData,
        totalEvents: events.length,
        recentCount: recentEvents.length,
        exchangeStats
      });

    } catch (error: any) {
      console.error('Error fetching real-time liquidations:', error);
      res.status(500).json({
        error: 'Failed to fetch real-time liquidations',
        details: error.message
      });
    }
  });

  // Coinalyze historical liquidation data endpoint (FREE API)
  const coinalyzeCache = new Map<string, { data: any; timestamp: number }>();
  const COINALYZE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  app.get("/api/crypto/liquidations/coinalyze", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '4hour';
      
      // Convert symbol format: BTCUSDT -> BTCUSDT_PERP.A (Binance)
      const coinalyzeSymbol = `${symbol}_PERP.A`;
      
      // Map our intervals to Coinalyze intervals
      const intervalMap: Record<string, string> = {
        '4h': '4hour',
        '12h': '12hour',
        '24h': 'daily',
        '1d': 'daily'
      };
      const coinalyzeInterval = intervalMap[interval] || '4hour';
      
      // Cache key
      const cacheKey = `${symbol}-${interval}`;
      const cached = coinalyzeCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < COINALYZE_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        });
      }
      
      // Calculate time range (last 30 days for enough data points)
      const to = Math.floor(Date.now() / 1000);
      const from = to - (30 * 24 * 60 * 60); // 30 days ago
      
      // API key disabled - feature not available
      const apiKey = null; // process.env.COINALYZE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Coinalyze API temporarily disabled',
          message: 'This feature requires API configuration'
        });
      }
      
      const url = `https://api.coinalyze.net/v1/liquidation-history?symbols=${coinalyzeSymbol}&interval=${coinalyzeInterval}&from=${from}&to=${to}`;
      
      console.log(`📊 Fetching Coinalyze liquidations: ${coinalyzeSymbol}, interval: ${coinalyzeInterval}`);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'api_key': apiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Coinalyze API error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      console.log(`✅ Coinalyze data received: ${data[0]?.history?.length || 0} data points`);
      
      // Extract liquidation history
      const history = data[0]?.history || [];
      
      const result = {
        symbol,
        interval,
        source: 'coinalyze',
        timestamp: Date.now(),
        history: history.map((item: any) => ({
          time: item.t,
          longLiquidations: item.l || 0,
          shortLiquidations: item.s || 0,
          totalLiquidations: (item.l || 0) + (item.s || 0)
        })),
        dataPoints: history.length,
        cached: false
      };
      
      // Cache the result
      coinalyzeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Coinalyze liquidations:', error);
      res.status(500).json({
        error: 'Failed to fetch Coinalyze liquidations',
        details: error.message
      });
    }
  });

  // Liquidation Grid Data (30×30 grid for heatmap visualization)
  app.get("/api/crypto/liquidations/grid", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
      const binanceSymbol = symbol.replace('-', '');
      
      // Fetch 180 4-hour candles (30 days)
      const binanceUrl = `https://api.binance.us/api/v3/klines?symbol=${binanceSymbol}&interval=4h&limit=180`;
      const binanceResponse = await fetch(binanceUrl);
      
      if (!binanceResponse.ok) {
        throw new Error(`Binance API error: ${binanceResponse.status}`);
      }
      
      const binanceData = await binanceResponse.json();
      
      // Convert to price candles
      const priceCandles = binanceData.map((candle: any) => ({
        time: candle[0] / 1000, // Convert ms to seconds
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
      
      // Get min/max price for adaptive bands
      const prices = priceCandles.map((c: any) => c.close);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      
      // Create 30 price bands
      const NUM_PRICE_BANDS = 30;
      const priceBandHeight = priceRange / NUM_PRICE_BANDS;
      
      // Aggregate candles into 30 daily buckets (6 4-hour candles per day)
      const NUM_TIME_BUCKETS = 30;
      const candlesPerBucket = Math.floor(priceCandles.length / NUM_TIME_BUCKETS);
      
      // Fetch Coinalyze liquidation data - API disabled
      const coinalyzeSymbol = `${binanceSymbol}_PERP.A`;
      const to = Math.floor(Date.now() / 1000);
      const from = to - (30 * 24 * 60 * 60);
      const apiKey = null; // process.env.COINALYZE_API_KEY;
      
      let liquidations: any[] = [];
      if (apiKey) {
        const liqUrl = `https://api.coinalyze.net/v1/liquidation-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;
        const liqResponse = await fetch(liqUrl, {
          headers: { 'Accept': 'application/json', 'api_key': apiKey }
        });
        
        if (liqResponse.ok) {
          const liqData = await liqResponse.json();
          liquidations = liqData[0]?.history || [];
        }
      }
      
      // Create 30×30 grid
      const grid: number[][] = Array(NUM_PRICE_BANDS).fill(0).map(() => 
        Array(NUM_TIME_BUCKETS).fill(0)
      );
      
      // Map liquidations to grid cells
      liquidations.forEach((liq: any) => {
        const liqTime = liq.t;
        const totalLiq = (liq.l || 0) + (liq.s || 0);
        
        if (totalLiq <= 0) return;
        
        // Find closest price candle to get price at that time
        let closestCandle = priceCandles[0];
        let minDiff = Math.abs(priceCandles[0].time - liqTime);
        
        for (const candle of priceCandles) {
          const diff = Math.abs(candle.time - liqTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestCandle = candle;
          }
        }
        
        const priceAtTime = closestCandle.close;
        
        // Determine price band (0 = bottom, 29 = top)
        const priceBandIdx = Math.floor((priceAtTime - minPrice) / priceBandHeight);
        const validPriceBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, priceBandIdx));
        
        // Determine time bucket
        const candleIdx = priceCandles.findIndex((c: any) => c.time === closestCandle.time);
        const timeBucketIdx = Math.floor(candleIdx / candlesPerBucket);
        const validTimeBucket = Math.max(0, Math.min(NUM_TIME_BUCKETS - 1, timeBucketIdx));
        
        // Add to grid
        grid[validPriceBand][validTimeBucket] += totalLiq;
      });
      
      // Find max volume for color scaling
      let maxVolume = 0;
      grid.forEach(row => {
        row.forEach(val => {
          if (val > maxVolume) maxVolume = val;
        });
      });
      
      // Aggregate price data into 30 buckets
      const priceLine: Array<{time: number; price: number; high: number; low: number}> = [];
      for (let i = 0; i < NUM_TIME_BUCKETS; i++) {
        const startIdx = i * candlesPerBucket;
        const endIdx = Math.min(startIdx + candlesPerBucket, priceCandles.length);
        const bucketCandles = priceCandles.slice(startIdx, endIdx);
        
        if (bucketCandles.length > 0) {
          const avgTime = bucketCandles.reduce((sum: number, c: any) => sum + c.time, 0) / bucketCandles.length;
          const avgPrice = bucketCandles.reduce((sum: number, c: any) => sum + c.close, 0) / bucketCandles.length;
          const high = Math.max(...bucketCandles.map((c: any) => c.high));
          const low = Math.min(...bucketCandles.map((c: any) => c.low));
          
          priceLine.push({ time: avgTime, price: avgPrice, high, low });
        }
      }
      
      // Generate predicted liquidation column based on historical density
      // Strategy: Identify price bands with highest historical liquidation volume
      // and project them as likely future liquidation zones
      const predictedColumn: number[] = Array(NUM_PRICE_BANDS).fill(0);
      
      // Calculate total liquidation volume per price band from historical data
      const bandDensity: number[] = Array(NUM_PRICE_BANDS).fill(0);
      grid.forEach((row, priceIdx) => {
        const totalVolumeInBand = row.reduce((sum, val) => sum + val, 0);
        bandDensity[priceIdx] = totalVolumeInBand;
      });
      
      // Find top 5 price bands with highest liquidation density
      const bandIndices = bandDensity.map((_, idx) => idx);
      const topBands = bandIndices
        .sort((a, b) => bandDensity[b] - bandDensity[a])
        .slice(0, 8); // Top 8 bands
      
      // Also add zones near current price (high liquidation risk)
      const currentPriceNormalized = (priceCandles[priceCandles.length - 1].close - minPrice) / priceBandHeight;
      const currentBand = Math.floor(currentPriceNormalized);
      
      // Typical leverage levels: 10x, 25x, 50x, 100x
      const leverageLevels = [10, 25, 50, 100];
      const currentPrice = priceCandles[priceCandles.length - 1].close;
      
      leverageLevels.forEach(leverage => {
        // Long liquidation price: current * (1 - 1/leverage)
        const longLiqPrice = currentPrice * (1 - 1/leverage);
        const longBandIdx = Math.floor((longLiqPrice - minPrice) / priceBandHeight);
        const validLongBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, longBandIdx));
        
        // Short liquidation price: current * (1 + 1/leverage)
        const shortLiqPrice = currentPrice * (1 + 1/leverage);
        const shortBandIdx = Math.floor((shortLiqPrice - minPrice) / priceBandHeight);
        const validShortBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, shortBandIdx));
        
        // Weight by leverage (higher leverage = more volume)
        const weight = leverage * 50000;
        predictedColumn[validLongBand] += weight;
        predictedColumn[validShortBand] += weight;
      });
      
      // Add historical density to predicted zones
      topBands.forEach((bandIdx, rank) => {
        const weight = bandDensity[bandIdx] * 0.3; // 30% of historical volume
        predictedColumn[bandIdx] += weight;
      });
      
      console.log(`✅ Predicted liquidation zones: ${topBands.length} historical + ${leverageLevels.length * 2} leverage-based`)
      
      // Generate orderbook-based column (32nd column) using CoinGlass aggregated bid/ask data
      const orderbookColumn: number[] = Array(NUM_PRICE_BANDS).fill(0);
      
      try {
        // API disabled - feature not available
        const coinglassApiKey = null; // process.env.COINGLASS_API_KEY;
        if (coinglassApiKey) {
          const coinglassSymbol = symbol.replace('USDT', ''); // BTC, ETH, etc.
          const orderbookUrl = `https://open-api-v4.coinglass.com/api/futures/orderbook/aggregated-ask-bids-history?exchange_list=Binance&symbol=${coinglassSymbol}&interval=4h&range=2&limit=30`;
          
          console.log(`📊 Fetching CoinGlass orderbook for ${coinglassSymbol}...`);
          
          const orderbookResponse = await fetch(orderbookUrl, {
            headers: {
              'accept': 'application/json',
              'CG-API-KEY': coinglassApiKey
            }
          });
          
          if (orderbookResponse.ok) {
            const orderbookData = await orderbookResponse.json();
            
            if (orderbookData.code === '0' && orderbookData.data && orderbookData.data.length > 0) {
              console.log(`✅ CoinGlass orderbook data received: ${orderbookData.data.length} data points`);
              
              // Calculate average bid/ask levels and identify imbalances
              const orderbookHistory = orderbookData.data;
              const avgBids = orderbookHistory.reduce((sum: number, item: any) => sum + (item.aggregated_bids_usd || 0), 0) / orderbookHistory.length;
              const avgAsks = orderbookHistory.reduce((sum: number, item: any) => sum + (item.aggregated_asks_usd || 0), 0) / orderbookHistory.length;
              
              // Find significant bid/ask walls (above 2x average)
              const strongSupport: number[] = [];
              const strongResistance: number[] = [];
              
              orderbookHistory.forEach((item: any) => {
                const bidStrength = (item.aggregated_bids_usd || 0) / avgBids;
                const askStrength = (item.aggregated_asks_usd || 0) / avgAsks;
                
                // Strong support (bids > 1.2x average) suggests price floor
                if (bidStrength > 1.2) {
                  strongSupport.push(item.aggregated_bids_usd);
                }
                
                // Strong resistance (asks > 1.2x average) suggests price ceiling
                if (askStrength > 1.2) {
                  strongResistance.push(item.aggregated_asks_usd);
                }
              });
              
              // Map orderbook imbalances to price levels at those times
              orderbookHistory.forEach((item: any, idx: number) => {
                const bids = item.aggregated_bids_usd || 0;
                const asks = item.aggregated_asks_usd || 0;
                const timestamp = item.time / 1000; // Convert ms to seconds
                
                // Find the price at this time from our price candles
                let closestCandle = priceCandles[0];
                let minDiff = Math.abs(priceCandles[0].time - timestamp);
                
                for (const candle of priceCandles) {
                  const diff = Math.abs(candle.time - timestamp);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestCandle = candle;
                  }
                }
                
                const priceAtTime = closestCandle.close;
                
                // Calculate bid/ask imbalance ratio
                const total = bids + asks;
                if (total === 0) return;
                
                const bidRatio = bids / total; // > 0.5 = more buyers (support)
                const askRatio = asks / total; // > 0.5 = more sellers (resistance)
                
                // Significant imbalance threshold
                const imbalanceStrength = Math.abs(bidRatio - 0.5) * 2; // 0 to 1 scale
                
                if (imbalanceStrength > 0.1) { // 10% imbalance
                  // Map to price band
                  const priceBandIdx = Math.floor((priceAtTime - minPrice) / priceBandHeight);
                  const validBand = Math.max(0, Math.min(NUM_PRICE_BANDS - 1, priceBandIdx));
                  
                  // Weight by total volume and imbalance strength
                  const weight = total * imbalanceStrength;
                  orderbookColumn[validBand] += weight;
                  
                  // Also mark nearby bands (spread the signal)
                  for (let offset = -1; offset <= 1; offset++) {
                    const nearbyBand = validBand + offset;
                    if (nearbyBand >= 0 && nearbyBand < NUM_PRICE_BANDS && offset !== 0) {
                      orderbookColumn[nearbyBand] += weight * 0.3; // 30% to adjacent bands
                    }
                  }
                }
              });
              
              // Calculate total orderbook signal strength
              const totalOrderbookSignal = orderbookColumn.reduce((sum, val) => sum + val, 0);
              const nonZeroBands = orderbookColumn.filter(v => v > 0).length;
              console.log(`✅ Orderbook analysis: ${nonZeroBands} price bands with imbalance signals, total strength: ${totalOrderbookSignal.toFixed(0)}`);
            }
          }
        }
      } catch (error: any) {
        console.error('⚠️ Failed to fetch orderbook data, column 32 will be empty:', error.message);
      }
      
      res.json({
        symbol,
        grid,
        priceLine,
        predictedColumn,
        orderbookColumn,
        minPrice,
        maxPrice,
        maxVolume,
        numPriceBands: NUM_PRICE_BANDS,
        numTimeBuckets: NUM_TIME_BUCKETS,
        timestamp: Date.now()
      });
      
    } catch (error: any) {
      console.error('❌ Error generating liquidation grid:', error);
      res.status(500).json({
        error: 'Failed to generate liquidation grid',
        details: error.message
      });
    }
  });

  // CoinGlass liquidation history endpoint (Hobbyist tier: ≥4h intervals)
  const coinglassCache = new Map<string, { data: any; timestamp: number }>();
  const COINGLASS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

  app.get("/api/crypto/liquidations/coinglass-history", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '4h';
      const exchange = (req.query.exchange as string) || 'Binance';

      // Validate interval for Hobbyist tier
      const allowedIntervals = ['4h', '6h', '8h', '12h', '1d', '1w'];
      if (!allowedIntervals.includes(interval)) {
        return res.status(400).json({
          error: 'Invalid interval for Hobbyist tier',
          message: 'Hobbyist tier requires intervals ≥4h. Use: 4h, 6h, 8h, 12h, 1d, or 1w'
        });
      }

      const cacheKey = `${symbol}-${interval}-${exchange}`;
      const cached = coinglassCache.get(cacheKey);

      // Return cached data if still valid
      if (cached && (Date.now() - cached.timestamp) < COINGLASS_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000 / 60) // minutes
        });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API temporarily disabled',
          message: 'Liquidation history feature requires API configuration'
        });
      }

      const coinglassUrl = `https://open-api-v4.coinglass.com/api/futures/liquidation/history?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=1000`;
      
      const response = await fetch(coinglassUrl, {
        headers: {
          'accept': 'application/json',
          'CG-API-KEY': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`CoinGlass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.code !== '0') {
        throw new Error(`CoinGlass API returned error: ${data.msg}`);
      }

      const result = {
        symbol,
        interval,
        exchange,
        source: 'coinglass',
        timestamp: Date.now(),
        history: data.data || [],
        cached: false
      };

      // Cache the result
      coinglassCache.set(cacheKey, { data: result, timestamp: Date.now() });

      res.json(result);

    } catch (error: any) {
      console.error('Error fetching CoinGlass liquidation history:', error);
      res.status(500).json({
        error: 'Failed to fetch CoinGlass liquidation history',
        details: error.message
      });
    }
  });

  // CoinGlass Aggregated Orderbook Bid/Ask endpoint
  const orderbookCache = new Map<string, { data: any; timestamp: number }>();
  const ORDERBOOK_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  app.get("/api/crypto/orderbook/coinglass", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTC';
      const interval = (req.query.interval as string) || '4h';
      const exchange = (req.query.exchange as string) || 'Binance';
      const range = (req.query.range as string) || '1'; // ±1% depth
      const limit = parseInt(req.query.limit as string) || 30;

      const cacheKey = `${symbol}-${interval}-${exchange}-${range}`;
      const cached = orderbookCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < ORDERBOOK_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000 / 60)
        });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API temporarily disabled',
          message: 'Orderbook feature requires API configuration'
        });
      }

      const url = `https://open-api-v4.coinglass.com/api/futures/orderbook/aggregated-ask-bids-history?exchange_list=${exchange}&symbol=${symbol}&interval=${interval}&range=${range}&limit=${limit}`;
      
      console.log(`📊 Fetching CoinGlass orderbook: ${symbol}, interval: ${interval}, range: ±${range}%`);

      const response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'CG-API-KEY': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ CoinGlass orderbook API error: ${response.status}`, errorText);
        throw new Error(`CoinGlass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.code !== '0') {
        throw new Error(`CoinGlass API returned error: ${data.msg}`);
      }

      console.log(`✅ CoinGlass orderbook data received: ${data.data?.length || 0} data points`);

      const result = {
        symbol,
        interval,
        exchange,
        range,
        source: 'coinglass-orderbook',
        timestamp: Date.now(),
        history: data.data || [],
        cached: false
      };

      orderbookCache.set(cacheKey, { data: result, timestamp: Date.now() });

      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching CoinGlass orderbook:', error);
      res.status(500).json({
        error: 'Failed to fetch CoinGlass orderbook',
        details: error.message
      });
    }
  });

  // ========== PROFESSIONAL ORDERFLOW ENDPOINTS ==========
  // Coinalyze API Rate Limit: 40 calls/min
  // Coinglass API Rate Limit: 1200 calls/min

  // CVD endpoint - Calculate from Binance volume data
  // CVD (Cumulative Volume Delta) approximates buy/sell pressure based on price direction
  const cvdCache = new Map<string, { data: any; timestamp: number }>();
  const CVD_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

  app.get("/api/crypto/orderflow/cvd", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '15m';
      
      const cacheKey = `${symbol}-${interval}`;
      const cached = cvdCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < CVD_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        });
      }

      // Fetch recent candles from Binance
      const binanceUrl = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`;
      const response = await fetch(binanceUrl);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const klines = await response.json();
      
      // Calculate CVD: sum of (volume * direction)
      // Direction: +1 if close > open (bullish), -1 if close < open (bearish)
      let cumulativeDelta = 0;
      const history: Array<{timestamp: number, value: number}> = [];

      for (const candle of klines) {
        const [timestamp, open, high, low, close, volume] = candle;
        const direction = parseFloat(close) > parseFloat(open) ? 1 : -1;
        const volumeValue = parseFloat(volume);
        const delta = volumeValue * direction;
        cumulativeDelta += delta;
        
        history.push({
          timestamp: parseInt(timestamp),
          value: cumulativeDelta
        });
      }

      const result = {
        symbol,
        interval,
        source: 'binance-cvd-approximation',
        timestamp: Date.now(),
        current: history[history.length - 1] || { timestamp: Date.now(), value: 0 },
        history: history.slice(-10), // Keep last 10 points
        cached: false
      };

      cvdCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error calculating CVD:', error);
      res.status(500).json({
        error: 'Failed to calculate CVD',
        details: error.message
      });
    }
  });

  // Coinalyze Open Interest endpoint with rolling history buffer
  const oiCache = new Map<string, { data: any; timestamp: number; history: Array<{timestamp: number, value: number}> }>();
  const OI_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const OI_HISTORY_SIZE = 10; // Keep last 10 data points

  app.get("/api/crypto/orderflow/open-interest", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '1h';

      const coinalyzeSymbol = `${symbol}_PERP.A`;
      const cacheKey = `${symbol}-${interval}`;
      const cached = oiCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < OI_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINALYZE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Coinalyze API temporarily disabled',
          message: 'Open Interest feature requires API configuration'
        });
      }

      // Fetch historical data (last 7 days) for immediate deltas on page load
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60); // Last 7 days
      const historyUrl = `https://api.coinalyze.net/v1/open-interest-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

      console.log(`📊 Fetching Coinalyze Open Interest History: ${coinalyzeSymbol}`);

      const response = await fetch(historyUrl, {
        headers: {
          'Accept': 'application/json',
          'api_key': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Coinalyze OI API error: ${response.status}`, errorText);
        throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const historyData = data[0]?.history || [];
      
      // Convert history to normalized format {timestamp, value}
      // Coinalyze returns OHLC format: {t, o, h, l, c}
      const newHistory = historyData.slice(-OI_HISTORY_SIZE).map((point: any) => ({
        timestamp: (point.t || point.time || point.timestamp) * 1000, // Convert to ms
        value: point.c || point.v || point.oi || point.value || 0 // Use 'c' (close) for OHLC data
      }));
      
      // Get current value (last point in history)
      const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
      const currentRaw = historyData.length > 0 ? historyData[historyData.length - 1] : { value: currentValue };

      const result = {
        symbol,
        source: 'coinalyze-oi',
        timestamp: Date.now(),
        current: currentRaw,
        history: newHistory,
        cached: false
      };

      oiCache.set(cacheKey, { data: result, timestamp: Date.now(), history: newHistory });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Coinalyze Open Interest:', error);
      res.status(500).json({
        error: 'Failed to fetch Open Interest data',
        details: error.message
      });
    }
  });

  // Coinalyze Funding Rate endpoint with rolling history buffer
  const fundingCache = new Map<string, { data: any; timestamp: number; history: Array<{timestamp: number, value: number}> }>();
  const FUNDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const FUNDING_HISTORY_SIZE = 10; // Keep last 10 data points

  app.get("/api/crypto/orderflow/funding-rate", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';

      const coinalyzeSymbol = `${symbol}_PERP.A`;
      const cacheKey = symbol;
      const cached = fundingCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < FUNDING_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINALYZE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Coinalyze API temporarily disabled',
          message: 'Funding Rate feature requires API configuration'
        });
      }

      // Fetch historical data (last 7 days) for immediate deltas on page load
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60); // Last 7 days
      const historyUrl = `https://api.coinalyze.net/v1/funding-rate-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

      console.log(`📊 Fetching Coinalyze Funding Rate History: ${coinalyzeSymbol}`);

      const response = await fetch(historyUrl, {
        headers: {
          'Accept': 'application/json',
          'api_key': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Coinalyze Funding API error: ${response.status}`, errorText);
        throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const historyData = data[0]?.history || [];
      
      // Convert history to normalized format {timestamp, value}
      // Coinalyze returns OHLC format: {t, o, h, l, c}
      const newHistory = historyData.slice(-FUNDING_HISTORY_SIZE).map((point: any) => ({
        timestamp: (point.t || point.time || point.timestamp) * 1000, // Convert to ms
        value: point.c || point.v || point.fr || point.fundingRate || point.value || 0 // Use 'c' (close) for OHLC data
      }));
      
      // Get current value (last point in history)
      const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
      const currentRaw = historyData.length > 0 ? historyData[historyData.length - 1] : { value: currentValue };

      const result = {
        symbol,
        source: 'coinalyze-funding',
        timestamp: Date.now(),
        current: currentRaw,
        history: newHistory,
        cached: false
      };

      fundingCache.set(cacheKey, { data: result, timestamp: Date.now(), history: newHistory });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Coinalyze Funding Rate:', error);
      res.status(500).json({
        error: 'Failed to fetch Funding Rate data',
        details: error.message
      });
    }
  });

  // Coinalyze Long/Short Ratio endpoint
  const lsRatioCache = new Map<string, { data: any; timestamp: number }>();
  const LS_RATIO_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

  app.get("/api/crypto/orderflow/long-short-ratio", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '4h';

      const coinalyzeSymbol = `${symbol}_PERP.A`;
      const cacheKey = `${symbol}-${interval}`;
      const cached = lsRatioCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < LS_RATIO_CACHE_TTL) {
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000 / 60)
        });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINALYZE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Coinalyze API temporarily disabled',
          message: 'Long/Short Ratio feature requires API configuration'
        });
      }

      // Map our intervals to Coinalyze format
      const coinalyzeInterval = interval === '15m' ? '15min' : interval === '1h' ? '1hour' : interval === '4h' ? '4hour' : interval;
      const to = Math.floor(Date.now() / 1000);
      const from = to - (7 * 24 * 60 * 60); // Last 7 days

      const url = `https://api.coinalyze.net/v1/long-short-ratio-history?symbols=${coinalyzeSymbol}&interval=${coinalyzeInterval}&from=${from}&to=${to}`;

      console.log(`📊 Fetching Coinalyze Long/Short Ratio: ${coinalyzeSymbol}, interval: ${coinalyzeInterval}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'api_key': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Coinalyze L/S Ratio API error: ${response.status}`, errorText);
        throw new Error(`Coinalyze API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawHistory = data[0]?.history || [];

      // Coinalyze returns {t: timestamp, r: ratio, l: long%, s: short%}
      const normalizedHistory = rawHistory.map((item: any) => ({
        timestamp: item.t,
        ratio: item.r,
        longPercent: item.l,
        shortPercent: item.s
      }));

      const result = {
        symbol,
        interval,
        source: 'coinalyze-ls-ratio',
        timestamp: Date.now(),
        history: normalizedHistory,
        current: normalizedHistory[normalizedHistory.length - 1] || null,
        cached: false
      };

      lsRatioCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Coinalyze Long/Short Ratio:', error);
      res.status(500).json({
        error: 'Failed to fetch Long/Short Ratio data',
        details: error.message
      });
    }
  });

  // Combined Professional Orderflow Data endpoint (combines all metrics)
  app.get("/api/crypto/orderflow/professional", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '1h';

      console.log(`📊 Fetching combined professional orderflow data: ${symbol}, ${interval}`);

      // Fetch all data in parallel
      const [cvdData, oiData, fundingData, lsRatioData] = await Promise.allSettled([
        fetch(`http://localhost:5000/api/crypto/orderflow/cvd?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/funding-rate?symbol=${symbol}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=${interval}`).then(r => r.json())
      ]);

      const result = {
        symbol,
        interval,
        timestamp: Date.now(),
        cvd: cvdData.status === 'fulfilled' ? cvdData.value : { error: 'Failed to fetch CVD' },
        openInterest: oiData.status === 'fulfilled' ? oiData.value : { error: 'Failed to fetch OI' },
        fundingRate: fundingData.status === 'fulfilled' ? fundingData.value : { error: 'Failed to fetch Funding' },
        longShortRatio: lsRatioData.status === 'fulfilled' ? lsRatioData.value : { error: 'Failed to fetch L/S Ratio' }
      };

      console.log(`✅ Professional orderflow data fetched successfully`);
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching professional orderflow data:', error);
      res.status(500).json({
        error: 'Failed to fetch professional orderflow data',
        details: error.message
      });
    }
  });

  // Path parameter version of professional orderflow endpoint for frontend compatibility
  app.get("/api/crypto/orderflow/professional/:symbol/:interval", async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase() || 'BTCUSDT';
      const interval = req.params.interval || '1h';

      console.log(`📊 Fetching combined professional orderflow data (path params): ${symbol}, ${interval}`);

      // Fetch all data in parallel
      const [cvdData, oiData, fundingData, lsRatioData] = await Promise.allSettled([
        fetch(`http://localhost:5000/api/crypto/orderflow/cvd?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/open-interest?symbol=${symbol}&interval=${interval}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/funding-rate?symbol=${symbol}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/crypto/orderflow/long-short-ratio?symbol=${symbol}&interval=${interval}`).then(r => r.json())
      ]);

      const result = {
        symbol,
        interval,
        timestamp: Date.now(),
        cvd: cvdData.status === 'fulfilled' ? cvdData.value : { error: 'Failed to fetch CVD' },
        openInterest: oiData.status === 'fulfilled' ? oiData.value : { error: 'Failed to fetch OI' },
        fundingRate: fundingData.status === 'fulfilled' ? fundingData.value : { error: 'Failed to fetch Funding' },
        longShortRatio: lsRatioData.status === 'fulfilled' ? lsRatioData.value : { error: 'Failed to fetch L/S Ratio' }
      };

      console.log(`✅ Professional orderflow data fetched successfully (path params)`);
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching professional orderflow data (path params):', error);
      res.status(500).json({
        error: 'Failed to fetch professional orderflow data',
        details: error.message
      });
    }
  });

  // ========== END PROFESSIONAL ORDERFLOW ENDPOINTS ==========

  // Orderbook endpoint - DISABLED (geo-blocked from Replit servers)
  // Both Binance and Bybit REST APIs are geo-restricted
  // Returns empty data to prevent errors in frontend
  app.get("/api/crypto/orderbook/depth", async (req, res) => {
    const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
    
    console.log(`⚠️ Orderbook request for ${symbol} - API unavailable (geo-blocked)`);
    
    res.json({
      symbol,
      timestamp: Date.now(),
      bids: [],
      asks: [],
      totalBidWalls: 0,
      totalAskWalls: 0,
      note: 'Orderbook API unavailable due to geo-restrictions'
    });
  });

  // Crypto data API - fetch crypto data with custom Python indicators (public access)
  app.get("/api/crypto/data", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '3mo';
      const interval = (req.query.interval as string) || '1d';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Fetching crypto data: ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'crypto_indicators.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Data fetch failed',
          details: data.error 
        });
      }

      console.log(`✅ Successfully fetched crypto data: ${data.candlestick?.length || 0} candles`);
      res.json(data);

    } catch (error: any) {
      console.error('Error fetching crypto data:', error);
      res.status(500).json({ 
        error: 'Failed to fetch crypto data',
        details: error.message 
      });
    }
  });

  // Auto-EMA API - calculate optimal EMA length based on price reactivity (public access)
  app.get("/api/crypto/auto-ema", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Calculating auto-EMA: ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'auto_ema.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Auto-EMA calculation failed',
          details: data.error,
          traceback: data.traceback
        });
      }

      console.log(`✅ Auto-EMA calculated: Best length=${data.best_ema_length}, Score=${data.best_score}%, Bull=${data.bull_touches}, Bear=${data.bear_touches}`);
      res.json(data);

    } catch (error: any) {
      console.error('Error calculating auto-EMA:', error);
      res.status(500).json({ 
        error: 'Failed to calculate auto-EMA',
        details: error.message 
      });
    }
  });

  // Simple chart data API - returns OHLCV data from Yahoo Finance (public access)
  app.get("/api/crypto/chart", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1h', '4h', '12h', '1d', '3d', '1w', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Fetching chart data from Yahoo Finance: ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'chart_data.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Chart data fetch failed',
          details: data.error
        });
      }

      console.log(`✅ Chart data fetched from Yahoo Finance: ${data.count} candles`);
      res.json(data);

    } catch (error: any) {
      console.error('Chart data error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch chart data',
        details: error.message 
      });
    }
  });

  // Multi-EMA API - calculate optimal EMAs across 3 timeframe categories (public access)
  app.get("/api/crypto/multi-ema", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Calculating multi-EMA (CoinGecko): ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script - using CoinGecko API for better data
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'coingecko_ema.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Multi-EMA calculation failed',
          details: data.error,
          traceback: data.traceback
        });
      }

      console.log(`✅ Multi-EMA calculated (CoinGecko):`, {
        short: `${data.analysis.short.length} (${data.analysis.short.reactivity}%)`,
        medium: `${data.analysis.medium.length} (${data.analysis.medium.reactivity}%)`,
        long: `${data.analysis.long.length} (${data.analysis.long.reactivity}%)`,
        dataPoints: data.data.length
      });
      res.json(data);

    } catch (error: any) {
      console.error('Error calculating multi-EMA:', error);
      res.status(500).json({ 
        error: 'Failed to calculate multi-EMA',
        details: error.message 
      });
    }
  });

  // Market Structure API - detect swing points, FVGs, BOS/ChoCh (public access)
  app.get("/api/crypto/market-structure", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'];
      const ALLOWED_MODES = ['present', 'historical'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';
      const mode = (req.query.mode as string) || 'present';
      const minBosPercent = parseFloat(req.query.minBosPercent as string) || 1.0;
      const fvgFilter = req.query.fvgFilter !== 'false'; // Default true

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      if (!ALLOWED_MODES.includes(mode)) {
        return res.status(400).json({ 
          error: 'Invalid mode',
          message: `Mode must be one of: ${ALLOWED_MODES.join(', ')}`
        });
      }

      console.log(`🔍 Analyzing market structure: ${symbol}, period: ${period}, interval: ${interval}, mode: ${mode}`);

      // Path to Python script
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'market_structure.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval, mode, minBosPercent.toString(), fvgFilter.toString()],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Market structure analysis failed',
          details: data.error,
          traceback: data.traceback
        });
      }

      console.log(`✅ Market structure analyzed:`, {
        swingHighs: data.swing_highs.length,
        swingLows: data.swing_lows.length,
        structurePoints: data.market_structure.length,
        fvgs: data.fvgs.length,
        bosChoch: data.bos_choch.length
      });
      res.json(data);

    } catch (error: any) {
      console.error('Error analyzing market structure:', error);
      res.status(500).json({ 
        error: 'Failed to analyze market structure',
        details: error.message 
      });
    }
  });

  // Orderflow API - calculate footprint, VRVP, VWAP, CVD, and divergences (public access)
  app.get("/api/crypto/orderflow", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      const ALLOWED_PERIODS = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'];

      const symbol = (req.query.symbol as string) || 'XRP-USD';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Analyzing orderflow: ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script - using REAL Binance aggTrades data
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'binance_orderflow.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large datasets
      );

      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }

      // Parse JSON output from Python script
      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Python script error:', data.error);
        return res.status(400).json({ 
          error: 'Orderflow analysis failed',
          details: data.error,
          traceback: data.traceback
        });
      }

      console.log(`✅ Orderflow analyzed:`, {
        footprint: data.footprint.length,
        cvd: data.cvd.length,
        vrvpProfile: data.vrvp.profile.length,
        vwaps: {
          session: data.vwaps?.session?.length || 0,
          daily: data.vwaps?.daily?.length || 0,
          weekly: data.vwaps?.weekly?.length || 0,
          monthly: data.vwaps?.monthly?.length || 0
        },
        divergences: data.divergences.length
      });
      res.json(data);

    } catch (error: any) {
      console.error('Error analyzing orderflow:', error);
      res.status(500).json({ 
        error: 'Failed to analyze orderflow',
        details: error.message 
      });
    }
  });

  // Multi-Exchange Orderflow API - aggregates delta across multiple exchanges (public access)
  app.get("/api/crypto/multi-exchange-orderflow", async (req, res) => {
    try {
      // Input validation with allow-lists
      const ALLOWED_SYMBOLS = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'];
      const ALLOWED_PERIODS = ['1d', '3d', '1w', '2w', '1mo', '3mo', '6mo', '1y'];
      const ALLOWED_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

      const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
      const period = (req.query.period as string) || '1mo';
      const interval = (req.query.interval as string) || '15m';

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_PERIODS.includes(period)) {
        return res.status(400).json({ 
          error: 'Invalid period',
          message: `Period must be one of: ${ALLOWED_PERIODS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Analyzing multi-exchange orderflow: ${symbol}, period: ${period}, interval: ${interval}`);

      // Path to Python script
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'multi_exchange_orderflow.py');

      // Execute Python script with args array (prevents command injection)
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, symbol, period, interval],
        { 
          timeout: 60000,  // 60 second timeout (multiple exchanges take longer)
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      if (stderr) {
        console.log('Python script warnings:', stderr);
      }

      const data = JSON.parse(stdout);

      if (data.error) {
        console.error('Multi-exchange analysis error:', data.error);
        return res.status(400).json({ 
          error: 'Multi-exchange analysis failed',
          details: data.error,
          metadata: data.metadata
        });
      }

      console.log(`✅ Multi-exchange analysis complete:`, {
        footprint: data.footprint?.length || 0,
        cvd: data.cvd?.length || 0,
        divergences: data.divergences?.length || 0,
        successRate: data.metadata?.success_rate,
        avgResponseTime: data.metadata?.avg_response_time_ms
      });

      res.json(data);

    } catch (error: any) {
      console.error('Error analyzing multi-exchange orderflow:', error);
      res.status(500).json({ 
        error: 'Failed to analyze multi-exchange orderflow',
        details: error.message 
      });
    }
  });

  // Binance Orderflow API - fetch historical klines with Delta, CVD, and VWAP (public access)
  app.get("/api/crypto/orderflow-live", async (req, res) => {
    try {
      // Input validation
      const ALLOWED_SYMBOLS = ['XRPUSDT', 'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'];
      const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h'];
      
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'XRPUSDT';
      const interval = (req.query.interval as string) || '15m';
      const tableLimit = parseInt(req.query.limit as string) || 11;

      // Validate inputs
      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ 
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          message: `Interval must be one of: ${ALLOWED_INTERVALS.join(', ')}`
        });
      }

      console.log(`📊 Fetching Binance orderflow: ${symbol}, interval: ${interval}`);

      // Fetch historical klines from Binance Spot API (public data endpoint)
      const klinesUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`;
      const klinesResponse = await fetch(klinesUrl);
      
      if (!klinesResponse.ok) {
        const errorText = await klinesResponse.text();
        console.error(`Binance API error (${klinesResponse.status}):`, errorText);
        throw new Error(`Binance API error: ${klinesResponse.statusText} - ${errorText}`);
      }

      const klines = await klinesResponse.json();
      
      // Parse klines: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
      const candles = klines.map((kline: any[]) => {
        const totalVolume = parseFloat(kline[5]);
        const takerBuyVolume = parseFloat(kline[9]); // Taker buy base asset volume (buying pressure)
        const takerSellVolume = totalVolume - takerBuyVolume; // Remaining is selling pressure
        
        return {
          time: Math.floor(kline[0] / 1000), // Convert ms to seconds
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: totalVolume,
          buyVolume: takerBuyVolume,
          sellVolume: takerSellVolume,
          deltaVolume: takerBuyVolume - takerSellVolume, // Delta: buy - sell per bar
          trades: kline[8],
        };
      });

      // Calculate CVD (Cumulative Volume Delta) - running total of all deltas
      let cumulativeDelta = 0;
      const cvdData = candles.map((candle: any) => {
        cumulativeDelta += candle.deltaVolume;
        return {
          time: candle.time,
          cvd: cumulativeDelta,
        };
      });

      // Calculate VWAP across all candles
      let cumulativeVolume = 0;
      let cumulativePV = 0;
      const vwapData = candles.map((candle: any) => {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativePV += typicalPrice * candle.volume;
        cumulativeVolume += candle.volume;
        
        return {
          time: candle.time,
          vwap: cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typicalPrice,
        };
      });

      // Create orderflow table (last N bars with Delta and CVD)
      const lastNCandles = candles.slice(-tableLimit);
      const lastNCVD = cvdData.slice(-tableLimit);
      
      const orderflowTable = lastNCandles.map((candle: any, index: number) => ({
        bar: index === lastNCandles.length - 1 ? 'Current' : `-${lastNCandles.length - 1 - index}`,
        time: candle.time,
        open: candle.open.toFixed(4),
        high: candle.high.toFixed(4),
        low: candle.low.toFixed(4),
        close: candle.close.toFixed(4),
        volume: Math.round(candle.volume),
        buyVolume: Math.round(candle.buyVolume),
        sellVolume: Math.round(candle.sellVolume),
        deltaVolume: Math.round(candle.deltaVolume), // Per-bar delta (footprint)
        cvd: Math.round(lastNCVD[index].cvd), // Cumulative total
        trades: candle.trades,
      }));

      const response = {
        symbol,
        interval,
        source: 'Binance Spot API (data-api.binance.vision)',
        orderflowTable,
        cvd: cvdData,
        vwap: vwapData,
      };

      console.log(`✅ Orderflow data:`, {
        candles: candles.length,
        orderflowTable: orderflowTable.length,
        cvd: cvdData.length,
        vwap: vwapData.length,
      });

      res.json(response);

    } catch (error: any) {
      console.error('Error fetching orderflow:', error);
      res.status(500).json({ 
        error: 'Failed to fetch orderflow',
        details: error.message 
      });
    }
  });

  // CoinGlass Liquidation Map API - fetch perpetual futures liquidation levels (1h and 4h)
  app.get("/api/crypto/liquidation-map", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase() || 'BTCUSDT';
      const interval = (req.query.interval as string) || '1h';

      // Validate inputs
      const ALLOWED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT', 'SOLUSDT'];
      const ALLOWED_INTERVALS = ['1h', '4h'];

      if (!ALLOWED_SYMBOLS.includes(symbol)) {
        return res.status(400).json({
          error: 'Invalid symbol',
          message: `Symbol must be one of: ${ALLOWED_SYMBOLS.join(', ')}`
        });
      }

      if (!ALLOWED_INTERVALS.includes(interval)) {
        return res.status(400).json({
          error: 'Invalid interval',
          message: `Interval must be 1h or 4h for liquidation analysis`
        });
      }

      // Check cache first
      const cacheKey = `${symbol}_${interval}`;
      const cached = liquidationCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < LIQUIDATION_CACHE_TTL) {
        console.log(`✅ Liquidation data served from cache: ${cacheKey}`);
        return res.json({ ...cached.data, cached: true });
      }

      // API disabled - feature not available
      const apiKey = null; // process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API temporarily disabled',
          message: 'Liquidation map feature requires API configuration'
        });
      }

      console.log(`📊 Fetching liquidation map from CoinGlass: ${symbol}, interval: ${interval}`);

      // CoinGlass expects symbol without USDT suffix (e.g., BTC instead of BTCUSDT)
      const coinSymbol = symbol.replace('USDT', '');

      // Fetch liquidation map from CoinGlass API
      const liquidationUrl = `https://open-api-v4.coinglass.com/api/futures/liquidation/map?symbol=${coinSymbol}&interval=${interval}`;
      
      const liquidationResponse = await fetch(liquidationUrl, {
        headers: {
          'accept': 'application/json',
          'CG-API-KEY': apiKey
        }
      });

      if (!liquidationResponse.ok) {
        const errorText = await liquidationResponse.text();
        console.error(`CoinGlass API error (${liquidationResponse.status}):`, errorText);
        throw new Error(`CoinGlass API error: ${liquidationResponse.statusText}`);
      }

      const liquidationData = await liquidationResponse.json();

      // Check for API response errors
      if (liquidationData.code !== '0' && liquidationData.code !== 0) {
        console.error('CoinGlass API returned error:', liquidationData);
        return res.status(400).json({
          error: 'CoinGlass API error',
          message: liquidationData.msg || 'Unknown error from CoinGlass API'
        });
      }

      // Parse and format liquidation levels
      const levels: any[] = [];
      
      if (liquidationData.data && liquidationData.data.data) {
        // Data structure: { "48935": [[48935, 1579370.77, 25, null]], ... }
        Object.entries(liquidationData.data.data).forEach(([price, levelData]: [string, any]) => {
          if (Array.isArray(levelData) && levelData.length > 0) {
            levelData.forEach((level: any[]) => {
              if (level && level.length >= 3) {
                levels.push({
                  price: parseFloat(level[0]),
                  volume: parseFloat(level[1]),
                  leverage: level[2],
                  type: level[2] ? (level[2] >= 20 ? 'high' : 'medium') : 'low'
                });
              }
            });
          }
        });
      }

      // Sort levels by price (ascending)
      levels.sort((a, b) => a.price - b.price);

      const response = {
        symbol,
        interval,
        source: 'CoinGlass API',
        timestamp: Date.now(),
        levels,
        cached: false
      };

      // Cache the response
      liquidationCache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
        symbol,
        interval
      });

      console.log(`✅ Liquidation map data:`, {
        symbol,
        interval,
        levels: levels.length,
        priceRange: levels.length > 0 ? {
          min: levels[0].price,
          max: levels[levels.length - 1].price
        } : null
      });

      res.json(response);

    } catch (error: any) {
      console.error('Error fetching liquidation map:', error);
      res.status(500).json({
        error: 'Failed to fetch liquidation map',
        details: error.message
      });
    }
  });

  // Calculation endpoint - open access
  app.post("/api/calculate", async (req, res) => {
    try {
      const validatedRequest = calculationRequestSchema.parse(req.body);
      
      // Perform calculation with calculator type
      const result = CalculationService.performCalculation(validatedRequest, validatedRequest.calculatorType);
      
      // Create project
      const project = await storage.createProject(validatedRequest.project);
      
      // Create pipe configurations
      const pipeConfigurations = await Promise.all(
        result.processedPipes.map(pipe =>
          storage.createPipeConfiguration({
            projectId: project.id,
            nominalSize: pipe.nominalSize,
            length: pipe.length.toString(),
            fittingsQuantity: pipe.fittingsQuantity,
            internalDiameter: pipe.internalDiameter.toString(),
            volume: pipe.volume.toString(),
          })
        )
      );
      
      // Create meter configurations if they exist
      const meterConfigurations = result.processedMeters ? await Promise.all(
        result.processedMeters.map(meter =>
          storage.createMeterConfiguration({
            projectId: project.id,
            meterType: meter.meterType,
            quantity: meter.quantity,
            internalVolume: meter.internalVolume.toString(),
            cyclicVolume: meter.cyclicVolume.toString(),
            totalInternalVolume: meter.totalInternalVolume.toString(),
            totalCyclicVolume: meter.totalCyclicVolume.toString(),
          })
        )
      ) : [];
      
      // Create calculation record
      const calculation = await storage.createCalculation({
        projectId: project.id,
        ...result.calculation,
      });
      
      const response = {
        project,
        pipeConfigurations,
        meterConfigurations: meterConfigurations.length > 0 ? meterConfigurations : undefined,
        calculation,
        compliance: result.compliance,
      };
      
      // Debug logging for purge calculations
      if (validatedRequest.project.operationType === "Purge") {
        console.log("🔧 PURGE CALCULATION DEBUG:");
        console.log("- Operation Type:", validatedRequest.project.operationType);
        console.log("- Pipe Configs:", validatedRequest.pipeConfigurations);
        console.log("- Calculation Results:", {
          requiredPurgeVolume: calculation.requiredPurgeVolume,
          minimumFlowRate: calculation.minimumFlowRate,
          maximumPurgeTime: calculation.maximumPurgeTime
        });
      }
      
      res.json(response);
    } catch (error: any) {
      console.error("Calculation error:", error);
      res.status(400).json({ 
        message: error.message || "Invalid calculation data",
        details: error.errors || []
      });
    }
  });

  // Stripe removed - all features free
  app.post('/api/create-subscription', async (req: any, res) => {
    res.json({ message: "All features are now free - no subscription needed" });
  });

  app.get('/api/subscription-status', async (req: any, res) => {
    res.json({ tier: 'elite', status: 'active', message: "All features unlocked for free" });
  });

  app.post('/api/cancel-subscription', async (req: any, res) => {
    res.json({ message: "All features are free - nothing to cancel" });
  });

  app.post('/api/refresh-subscription', async (req: any, res) => {
    res.json({ tier: 'elite', status: 'active', message: "All features unlocked for free" });
  });

  app.post('/api/cleanup-customers', async (req: any, res) => {
    res.json({ message: "Stripe cleanup not needed - all features free" });
  });

  app.post('/api/stripe-webhook', async (req, res) => {
    res.status(200).json({ received: true, message: "Stripe disabled - all features free" });
  });

  // Company Branding API Routes (Professional tier only)
  app.get('/api/company-branding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.claims?.email;
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      let user = await storage.getUser(userId);
      
      // If not found by ID, try by email (for cross-provider compatibility)
      if (!user && userEmail) {
        user = await (storage as any).getUserByEmail(userEmail);
      }
      
      if (!user) {
        // Create user if doesn't exist
        user = await storage.upsertUser({
          id: userId,
          email: userEmail,
          subscriptionTier: 'professional',
        });
      }
      
      if (user?.subscriptionTier !== 'professional') {
        return res.status(403).json({ 
          message: "Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.",
          upgradeRequired: true,
          currentTier: user?.subscriptionTier || 'free',
          requiredTier: 'professional'
        });
      }

      // Use the user's actual ID from database
      const brandingUserId = user.id;
      const branding = await storage.getCompanyBranding(brandingUserId);
      
      // Add cache-busting headers
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(branding || {});
    } catch (error) {
      console.error("Error fetching company branding:", error);
      res.status(500).json({ message: "Failed to fetch company branding" });
    }
  });

  app.post('/api/company-branding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.claims?.email || req.user?.email;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      let user = await storage.getUser(userId);
      
      // If not found by ID, try by email (for cross-provider compatibility)
      if (!user && userEmail) {
        user = await (storage as any).getUserByEmail(userEmail);
      }
      
      if (!user) {
        // Create user if doesn't exist
        user = await storage.upsertUser({
          id: userId,
          email: userEmail,
          subscriptionTier: 'professional', // They have access, so they must be professional
        });
      }
      
      if (user?.subscriptionTier !== 'professional') {
        return res.status(403).json({ 
          message: "Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.",
          upgradeRequired: true,
          currentTier: user?.subscriptionTier || 'free',
          requiredTier: 'professional'
        });
      }

      // Use the user's actual ID from the database
      const brandingUserId = user.id;
      
      // Get existing branding to preserve logo URL and other uploaded assets
      const existingBranding = await storage.getCompanyBranding(brandingUserId);
      
      // Merge form data with existing branding (preserve uploaded assets)
      const brandingData = {
        userId: brandingUserId,  // Use the FOUND user's ID, not the session ID
        ...req.body,
        // Preserve uploaded assets if they exist and form doesn't provide them
        logoUrl: req.body.logoUrl || existingBranding?.logoUrl || null,
        engineerSignatureUrl: req.body.engineerSignatureUrl || existingBranding?.engineerSignatureUrl || null,
      };

      const branding = await storage.upsertCompanyBranding(brandingData);

      res.json(branding);
    } catch (error) {
      console.error("Error saving company branding:", error);
      res.status(500).json({ message: "Failed to save company branding" });
    }
  });

  // Get upload URL for logo
  app.post('/api/company-branding/upload-url', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.claims?.email || req.user?.email;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      let user = await storage.getUser(userId);
      
      // If not found by ID, try by email (for cross-provider compatibility)
      if (!user && userEmail) {
        user = await (storage as any).getUserByEmail(userEmail);
      }
      
      if (!user) {
        // Create user if doesn't exist  
        user = await storage.upsertUser({
          id: userId,
          email: userEmail,
          subscriptionTier: 'professional',
        });
      }
      
      if (user?.subscriptionTier !== 'professional') {
        return res.status(403).json({ 
          message: "Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.",
          upgradeRequired: true,
          currentTier: user?.subscriptionTier || 'free',
          requiredTier: 'professional'
        });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  app.post('/api/company-branding/logo', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.claims?.email || req.user?.email;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      let user = await storage.getUser(userId);
      
      // If not found by ID, try by email (for cross-provider compatibility)
      if (!user && userEmail) {
        user = await (storage as any).getUserByEmail(userEmail);
      }
      
      if (!user) {
        // Create user if doesn't exist  
        user = await storage.upsertUser({
          id: userId,
          email: userEmail,
          subscriptionTier: 'professional',
        });
      }
      
      if (user?.subscriptionTier !== 'professional') {
        return res.status(403).json({ 
          message: "Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.",
          upgradeRequired: true,
          currentTier: user?.subscriptionTier || 'free',
          requiredTier: 'professional'
        });
      }

      const { logoUrl } = req.body;
      
      if (!logoUrl) {
        return res.status(400).json({ message: "Logo URL is required" });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      
      // Normalize the logo URL to internal format
      const normalizedLogoUrl = objectStorageService.normalizeObjectEntityPath(logoUrl);
      
      // Use the actual user ID from database, not the session ID
      const brandingUserId = user.id;
      
      // Get current branding or create new using correct user ID
      let branding = await storage.getCompanyBranding(brandingUserId);
      if (!branding) {
        branding = await storage.upsertCompanyBranding({
          userId: brandingUserId,  // Use the correct user ID
          companyName: "Your Company", // Default name for new branding
          logoUrl: normalizedLogoUrl
        });
      } else {
        branding = await storage.upsertCompanyBranding({
          ...branding,
          userId: brandingUserId, // Use the correct user ID from database
          logoUrl: normalizedLogoUrl
        });
      }
      
      res.json({ logoUrl: branding.logoUrl });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Signature upload endpoint
  app.post('/api/upload/signature', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      // For now, we'll create a simple base64 storage
      // In production, you'd want to use the object storage service
      const multer = (await import('multer')).default;
      const upload = multer({ storage: multer.memoryStorage() });
      
      // Use upload middleware
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('Multer error:', err);
          return res.status(400).json({ message: 'File upload error' });
        }

        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }

        try {
          // Convert file to base64 data URL
          const base64 = req.file.buffer.toString('base64');
          const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
          
          // Return the data URL - in production you'd upload to object storage
          res.json({ url: dataUrl });
        } catch (error) {
          console.error('Error processing signature:', error);
          res.status(500).json({ message: 'Failed to process signature' });
        }
      });
    } catch (error) {
      console.error('Error in signature upload:', error);
      res.status(500).json({ message: 'Failed to upload signature' });
    }
  });

  app.delete('/api/company-branding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const userEmail = req.user?.claims?.email;
      if (!userId) {
        return res.status(401).json({ message: "User ID not found" });
      }

      let user = await storage.getUser(userId);
      
      // If not found by ID, try by email (for cross-provider compatibility)
      if (!user && userEmail) {
        user = await (storage as any).getUserByEmail(userEmail);
      }
      
      if (user?.subscriptionTier !== 'professional') {
        return res.status(403).json({ 
          message: "Professional subscription required for custom company branding. Upgrade to personalize reports with your logo and colors.",
          upgradeRequired: true,
          currentTier: user?.subscriptionTier || 'free',
          requiredTier: 'professional'
        });
      }

      const deleted = await storage.deleteCompanyBranding(userId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting company branding:", error);
      res.status(500).json({ message: "Failed to delete company branding" });
    }
  });

  // Serve uploaded logos from object storage
  app.get('/objects/logos/:logoId', async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving logo:", error);
      if (error instanceof Error && error.message === "Object not found") {
        return res.status(404).json({ error: "Logo not found" });
      }
      res.status(500).json({ error: "Error serving logo" });
    }
  });

  // Export API route for PDF generation
  app.post('/api/export', optionalAuth, checkSubscription, checkExportAccess, async (req: any, res) => {
    try {
      const { format, jobDetails, projectDetails, pipeConfigurations, meterConfiguration, completedTests, isMultipleTests } = req.body;
      
      if (format !== 'pdf') {
        return res.status(400).json({ message: 'Only PDF format is currently supported' });
      }

      // Convert the export data to the format expected by the PDF generator
      const operationType = isMultipleTests ? 'Combined Certificate' : 
                           Object.keys(completedTests)[0] === 'strength' ? 'Strength Test' :
                           Object.keys(completedTests)[0] === 'tightness' ? 'Tightness Test' : 'Purge';

      // Get the first test data for primary calculations
      const firstTestKey = Object.keys(completedTests)[0];
      const firstTest = completedTests[firstTestKey] as any;
      
      const calculationResult = {
        project: {
          // Map jobDetails fields to the expected project fields
          reference: jobDetails.jobNumber || 'Unknown',
          engineerName: jobDetails.engineerName || 'Unknown',
          installationType: projectDetails.installationType || 'Unknown',
          operationType: operationType,
          gasType: 'Natural Gas',
          // Include additional job details in custom fields
          jobNumber: jobDetails.jobNumber || 'Unknown',
          customerName: jobDetails.customerName || 'Unknown',
          location: jobDetails.location || 'Unknown',
          // Test-specific fields
          maxOperatingPressure: projectDetails.maxOperatingPressure || null,
          maxIncidentalPressure: projectDetails.maxIncidentalPressure || null,
          zoneType: projectDetails.zoneType || null,
          gaugeType: projectDetails.gaugeType || null,
          testMedium: projectDetails.testMedium || null,
          roomVolume: projectDetails.roomVolume || null,
          // Include pipe data for compatibility
          pipes: pipeConfigurations.map((pipe: any) => ({
            size: pipe.nominalSize,
            length: parseFloat(pipe.length) || 0,
            material: pipe.material || 'Steel'
          })),
          meterType: meterConfiguration?.meterType || null,
          gasMeterPurgeVolume: null
        },
        pipeConfigurations: pipeConfigurations.map((pipe: any) => {
          // Calculate volume server-side if not provided or is 0
          let pipeVolume = parseFloat(pipe.volume) || 0;
          
          if (pipeVolume === 0 && pipe.nominalSize && pipe.length) {
            // Use regulation table volume per 1m
            const pipeVolumeTableValues: Record<string, number> = {
              "15": 0.00024,  // 1/2"
              "20": 0.00046,  // 3/4"
              "25": 0.00064,  // 1"
              "32": 0.0011,   // 1 1/4"
              "40": 0.0015,   // 1 1/2"
              "50": 0.0024,   // 2"
              "65": 0.0038,   // 2 1/2"
              "80": 0.0054,   // 3"
              "100": 0.009,   // 4"
              "125": 0.014,   // 5"
              "150": 0.02,    // 6"
              "200": 0.035,   // 8"
              "250": 0.053,   // 10"
              "300": 0.074,   // 12"
            };
            
            // Extract numeric size from formats like "80mm" or "80"
            const sizeMatch = pipe.nominalSize.toString().match(/(\d+)/);
            if (sizeMatch) {
              const sizeKey = sizeMatch[1];
              const volumePer1m = pipeVolumeTableValues[sizeKey];
              if (volumePer1m) {
                const pipeLength = parseFloat(pipe.length) || 0;
                pipeVolume = volumePer1m * pipeLength * 1.1; // Add 10% for fittings
              }
            }
          }
          
          return {
            nominalSize: pipe.nominalSize,
            length: parseFloat(pipe.length) || 0,
            internalDiameter: parseFloat(pipe.internalDiameter) || 0,
            volume: pipeVolume,
            material: pipe.material || 'Steel',
            fittingsQuantity: pipe.fittingsQuantity || 0
          };
        }),
        meterConfigurations: meterConfiguration ? [{
          meterType: meterConfiguration.meterType,
          quantity: meterConfiguration.quantity || 1,
          internalVolume: meterConfiguration.internalVolume || 0,
          cyclicVolume: meterConfiguration.cyclicVolume || 0,
          totalInternalVolume: meterConfiguration.internalVolume || 0,
          totalCyclicVolume: meterConfiguration.cyclicVolume || 0
        }] : undefined,
        calculation: {
          totalSystemVolume: firstTest?.results?.calculation?.totalSystemVolume || '0',
          totalPipeVolume: firstTest?.results?.calculation?.totalPipeVolume || '0',
          totalFittingsVolume: firstTest?.results?.calculation?.totalFittingsVolume || '0',
          totalMeterVolume: firstTest?.results?.calculation?.totalMeterVolume || '0',
          testDuration: firstTest?.results?.calculation?.testDuration || '04:00',
          testDurationSeconds: firstTest?.results?.calculation?.testDurationSeconds || 240,
          testPressure: firstTest?.results?.calculation?.testPressure || projectDetails.maxOperatingPressure || 0,
          maxPressureDrop: firstTest?.results?.calculation?.maxPressureDrop || 0,
          maxAllowableDrop: firstTest?.results?.calculation?.maxPressureDrop || 0,
          actualPressureDrop: firstTest?.actualReadings?.actualPressureDrop || 0,
          testResult: firstTest?.testResult || 'PASS',
          isCompliant: firstTest?.testResult === 'PASS',
          // Include additional calculation fields
          requiredPurgeVolume: firstTest?.results?.calculation?.requiredPurgeVolume || '0',
          minimumFlowRate: firstTest?.results?.calculation?.minimumFlowRate || '0',
          maximumPurgeTime: firstTest?.results?.calculation?.maximumPurgeTime || '00:00',
          mplr: firstTest?.results?.calculation?.mplr || 0,
          // For combined tests, include all test data
          combinedTests: isMultipleTests ? completedTests : undefined
        },
        compliance: {
          isCompliant: firstTest?.testResult === 'PASS',
          standard: 'IGE/UP/1',
          notes: [],
          nextSteps: [],
          testResult: firstTest?.testResult || 'PASS',
          timestamp: new Date().toISOString()
        }
      };

      // Generate test results data for PDF
      const testResults = {
        actualPressureDrop: firstTest?.actualReadings?.actualPressureDrop?.toString() || '0',
        actualLeakageRate: firstTest?.actualReadings?.actualLeakageRate || 0,
        testResult: firstTest?.testResult || 'PASS',
        purgeFlowRate: firstTest?.actualReadings?.actualFlowRate?.toString() || null,
        purgeGasContent: firstTest?.actualReadings?.actualGasContent?.toString() || null,
        purgeResult: firstTest?.purgeResult || null,
        siteName: jobDetails.location || '',
        sectionIdentity: jobDetails.jobNumber || '',
        location: null,
        letByRise: firstTest?.letByRise || '0',
        strengthCompleted: completedTests.strength ? true : false,
        tightnessCompleted: completedTests.tightness ? true : false,
        purgeCompleted: completedTests.purge ? true : false
      };

      // Return formatted data for frontend PDF generation
      res.json({
        success: true,
        calculationResult,
        testResults
      });
      
    } catch (error: any) {
      console.error('Export error:', error);
      res.status(500).json({ message: 'Export failed', error: error.message });
    }
  });

  // PDF Generator endpoints - return HTML for browser printing
  app.post("/api/pdf/generate-commercial", isAuthenticated, checkSubscription, checkExportAccess, async (req: any, res) => {
    console.log('🔍 === PDF GENERATION DEBUG START ===');
    console.log('📝 Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('🍪 Session ID:', req.sessionID);
    console.log('👤 User object:', JSON.stringify(req.user, null, 2));
    console.log('🔐 Is authenticated:', req.isAuthenticated());
    console.log('📊 Request body size:', JSON.stringify(req.body).length, 'chars');
    
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      console.log('🆔 Extracted user ID:', userId);
      
      const companyBranding = await storage.getCompanyBranding(userId);
      console.log('🏢 Company branding loaded:', !!companyBranding);
      
      const testData = req.body;
      console.log('📋 Installation Type:', testData.installationType);
      console.log('📄 Full request body:', JSON.stringify(testData, null, 2));
      
      // Validate installation type - NO FALLBACK TO NEW
      if (!testData.installationType || (testData.installationType !== 'new' && testData.installationType !== 'existing')) {
        console.error('❌ Invalid or missing installationType:', testData.installationType);
        return res.status(400).json({ 
          error: 'Invalid installation type. Must be "new" or "existing"',
          received: testData.installationType 
        });
      }
      
      // Import the correct PDF generator based on installation type
      const isExisting = testData.installationType === 'existing';
      const pdfServiceImport = await import('./pdfService.js');
      const generatePDFFunction = isExisting 
        ? pdfServiceImport.generateCommercialExistingCertificateHTML
        : pdfServiceImport.generateCommercialNewCertificateHTML;
      
      console.log('🎯 Using PDF generator:', isExisting ? 'Commercial Existing' : 'Commercial New');
      
      // Generate HTML with actual data
      const html = generatePDFFunction(companyBranding, testData);
      
      // Add print script to automatically open print dialog
      const htmlWithPrint = html.replace('</body>', `
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>`);
      
      // Send HTML response
      res.setHeader('Content-Type', 'text/html');
      console.log('✅ PDF generation successful, sending HTML response');
      console.log('🔍 === PDF GENERATION DEBUG END ===');
      res.send(htmlWithPrint);
    } catch (error) {
      console.error('❌ Error generating commercial certificate:', error);
      console.log('🔍 === PDF GENERATION DEBUG END (ERROR) ===');
      res.status(500).json({ error: 'Failed to generate certificate' });
    }
  });

  app.post("/api/pdf/generate-industrial", isAuthenticated, checkSubscription, checkExportAccess, async (req: any, res) => {
    console.log('🔍 === INDUSTRIAL PDF GENERATION DEBUG START ===');
    console.log('📝 Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('🍪 Session ID:', req.sessionID);
    console.log('👤 User object:', JSON.stringify(req.user, null, 2));
    console.log('🔐 Is authenticated:', req.isAuthenticated());
    console.log('📊 Request body size:', JSON.stringify(req.body).length, 'chars');
    
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      console.log('🆔 Extracted user ID:', userId);
      
      const companyBranding = await storage.getCompanyBranding(userId);
      console.log('🏢 Company branding loaded:', !!companyBranding);
      
      const testData = req.body;
      console.log('📋 Installation Type:', testData.installationType);
      
      // Import the correct PDF generator based on installation type
      const isExisting = testData.installationType === 'existing';
      const pdfServiceImport = await import('./pdfService.js');
      const generatePDFFunction = isExisting 
        ? pdfServiceImport.generateIndustrialExistingCertificateHTML
        : pdfServiceImport.generateIndustrialNewCertificateHTML;
      
      console.log('🎯 Using PDF generator:', isExisting ? 'Industrial Existing' : 'Industrial New');
      
      // Generate HTML with actual data
      const html = generatePDFFunction(companyBranding, testData);
      
      // Add print script to automatically open print dialog
      const htmlWithPrint = html.replace('</body>', `
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>`);
      
      // Send HTML response
      res.setHeader('Content-Type', 'text/html');
      console.log('✅ Industrial PDF generation successful, sending HTML response');
      console.log('🔍 === INDUSTRIAL PDF GENERATION DEBUG END ===');
      res.send(htmlWithPrint);
    } catch (error) {
      console.error('❌ Error generating industrial certificate:', error);
      console.log('🔍 === INDUSTRIAL PDF GENERATION DEBUG END (ERROR) ===');
      res.status(500).json({ error: 'Failed to generate certificate' });
    }
  });

  // Feedback endpoints
  app.post("/api/feedback", async (req, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);
      
      // If user is authenticated, include their user ID
      if (req.user && (req.user.claims?.sub || req.user.id)) {
        feedbackData.userId = req.user.claims?.sub || req.user.id;
      }
      
      const feedback = await storage.createFeedback(feedbackData);
      res.json(feedback);
    } catch (error: any) {
      console.error('Error creating feedback:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/feedback", async (req, res) => {
    try {
      const feedbackList = await storage.listFeedback();
      res.json(feedbackList);
    } catch (error: any) {
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Market Analysis endpoint using xAI Grok (publicly accessible)
  app.post("/api/crypto/market-analysis", async (req, res) => {
    try {
      // Check if XAI API key is configured
      const apiKeyCheck = checkXaiApiKey();
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false 
        });
      }

      const { candles, bos, choch, vwap, symbol, timeframe } = req.body;

      if (!candles || !Array.isArray(candles) || candles.length === 0) {
        return res.status(400).json({ error: 'Invalid candle data' });
      }

      // Check cache first
      const now = Date.now();
      if (marketAnalysisCache && (now - marketAnalysisCache.timestamp) < CACHE_TTL) {
        console.log('📊 Returning cached market analysis');
        return res.json({
          analysis: marketAnalysisCache.analysis,
          cached: true,
          cacheAge: Math.round((now - marketAnalysisCache.timestamp) / 1000),
          estimatedCost: 0
        });
      }

      // Prepare concise market summary for Grok
      const recentCandles = candles.slice(-50); // Last 50 candles
      const currentPrice = recentCandles[recentCandles.length - 1].close;
      const priceChange24h = ((currentPrice - recentCandles[0].close) / recentCandles[0].close) * 100;
      
      // Count recent structure events (if provided - now optional to avoid circular dependencies)
      const recentBOS = bos?.filter((b: any) => b.breakTime > recentCandles[0].time).length || 0;
      const recentCHoCH = choch?.filter((c: any) => c.breakTime > recentCandles[0].time).length || 0;
      const liqSweeps = [...(bos || []), ...(choch || [])].filter((e: any) => e.isLiquidityGrab).length || 0;

      // Build analysis prompt
      const prompt = `You are a professional crypto market analyst. Analyze the current market conditions for ${symbol} (${timeframe} timeframe):

**Price Action:**
- Current: $${currentPrice.toFixed(4)}
- 24h Change: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(2)}%
- High: $${Math.max(...recentCandles.map((c: any) => c.high)).toFixed(4)}
- Low: $${Math.min(...recentCandles.map((c: any) => c.low)).toFixed(4)}

**Market Structure (recent ${timeframe} period):**
- BOS (Breaks of Structure): ${recentBOS}
- CHoCH (Change of Character): ${recentCHoCH}
- Liquidity Sweeps: ${liqSweeps}

**VWAP Position:**
- Price vs VWAP: ${vwap?.current ? (currentPrice > vwap.current ? 'Above' : 'Below') : 'N/A'}

Provide a brief, actionable market analysis (3-4 sentences) covering:
1. Current trend and momentum
2. Key support/resistance levels
3. Trading bias (bullish/bearish/neutral) with reasoning
4. Risk factors to watch

Be concise and direct.`;

      console.log('🤖 Calling xAI Grok for market analysis...');
      const startTime = Date.now();
      
      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are a professional cryptocurrency market analyst. Provide concise, actionable insights based on technical analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const analysis = response.choices[0].message.content || "Analysis unavailable";
      const duration = Date.now() - startTime;

      // Estimate cost (approximate: $2 per 1M input tokens, $10 per 1M output tokens for grok-2-1212)
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

      console.log(`✅ xAI analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);
      console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out`);

      // Update cache
      marketAnalysisCache = {
        analysis,
        timestamp: now,
        cost: estimatedCost
      };

      res.json({
        analysis,
        cached: false,
        cacheAge: 0,
        estimatedCost,
        tokens: {
          input: inputTokens,
          output: outputTokens
        }
      });
    } catch (error: any) {
      console.error('❌ Error generating market analysis:', error);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || 'Unknown error'
      });
    }
  });

  // Order Flow Alerts endpoint using xAI Grok (publicly accessible)
  app.post("/api/crypto/order-flow-alerts", async (req, res) => {
    try {
      // Check if XAI API key is configured
      const apiKeyCheck = checkXaiApiKey();
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false,
          alerts: [] // Return empty alerts array for graceful degradation
        });
      }

      const { 
        symbol, interval, currentPrice, cvd, cvdTrend, poc, vah, val, 
        bullishOBCount, bearishOBCount, bullFVGCount, bearFVGCount,
        buyImbalancesCount, sellImbalancesCount, absorptionCount,
        hiddenDivergenceCount, liquidityGrabCount, recentBars,
        bullishOB, bearishOB, bullFVG, bearFVG,
        buyImbalances, sellImbalances, absorption,
        hiddenDivergences, liquidityGrabs,
        orderflowData,
        cci = 0,
        adx = 0,
        plusDI = 0,
        minusDI = 0
      } = req.body;

      if (!symbol || !currentPrice || !recentBars) {
        return res.status(400).json({ error: 'Missing required data' });
      }

      // Prepare order flow data for Grok analysis
      const last50Bars = recentBars.slice(-50);
      const priceChange = ((currentPrice - last50Bars[0].close) / last50Bars[0].close) * 100;
      
      // Detect liquidity sweeps (equal highs/lows)
      const highs = last50Bars.map((b: any) => b.high);
      const lows = last50Bars.map((b: any) => b.low);
      const recentHigh = Math.max(...highs.slice(-10));
      const recentLow = Math.min(...lows.slice(-10));

      // Analyze professional orderflow data (OI, Funding, L/S Ratio) with defensive validation
      let orderflowAnalysis = '';
      if (orderflowData) {
        const openInterest = orderflowData?.openInterest ?? null;
        const fundingRate = orderflowData?.fundingRate ?? null;
        const longShortRatio = orderflowData?.longShortRatio ?? null;
        
        // Open Interest Analysis - defensive defaults
        let oiTrend = 'neutral';
        let oiDelta = 0;
        if (openInterest?.current && openInterest?.delta !== undefined) {
          oiDelta = openInterest.delta;
          oiTrend = openInterest.trend || 'neutral';
        }

        // Funding Rate Analysis - defensive defaults
        let fundingBias = 'neutral';
        let fundingValue = 0;
        if (fundingRate?.current && fundingRate?.rate !== undefined) {
          fundingValue = fundingRate.rate;
          fundingBias = fundingRate.bias || 'neutral';
        }

        // Long/Short Ratio Analysis - defensive defaults
        let lsRatio = 1.0;
        if (longShortRatio?.ratio !== undefined) {
          lsRatio = longShortRatio.ratio;
        }

        orderflowAnalysis = `\n**PROFESSIONAL ORDERFLOW DATA (Institutional-Grade):**
- Open Interest: ${oiTrend.toUpperCase()} (${oiDelta > 0 ? '+' : ''}${oiDelta.toFixed(2)}% delta)
- Funding Rate: ${fundingValue.toFixed(4)}% (${fundingBias.toUpperCase()} bias)
- Long/Short Ratio: ${lsRatio.toFixed(2)} (${lsRatio > 1.2 ? 'LONG-heavy' : lsRatio < 0.8 ? 'SHORT-heavy' : 'balanced'})

**INSTITUTIONAL ORDERFLOW CONFLUENCE (CRITICAL - Professional Edge):**
10. BULLISH orderflow: OI rising + Funding negative/neutral + L/S ratio < 1 (shorts crowded, long squeeze potential)
11. BEARISH orderflow: OI rising + Funding positive/extreme + L/S ratio > 1.5 (longs crowded, short squeeze potential)
12. CONTRARIAN long: Funding heavily negative + CVD rising (smart money accumulating while crowd shorts)
13. CONTRARIAN short: Funding heavily positive + CVD falling (smart money distributing while crowd longs)

These signals reveal INSTITUTIONAL positioning. When OI+Funding+CVD align in the same direction, the trade has professional-grade edge. This is what separates retail from institutional trading.`;
      }
      
      const prompt = `You are a professional Smart Money Concepts (SMC) / Order Flow trader analyzing advanced market structure for ${symbol} on ${interval} timeframe.

**Current Market Data:**
- Price: ${currentPrice.toFixed(4)}
- 50-bar price change: ${priceChange.toFixed(2)}%
- CVD (Cumulative Volume Delta): ${cvd.toFixed(0)} (${cvdTrend})
- POC (Point of Control): ${poc.toFixed(4)}
- VAH (Value Area High): ${vah.toFixed(4)}
- VAL (Value Area Low): ${val.toFixed(4)}
- Recent High: ${recentHigh.toFixed(4)}
- Recent Low: ${recentLow.toFixed(4)}
- CCI (Commodity Channel Index): ${cci.toFixed(2)} ${cci > 100 ? '(OVERBOUGHT)' : cci < -100 ? '(OVERSOLD)' : cci > 0 ? '(bullish zone)' : '(bearish zone)'}
- ADX (Trend Strength): ${adx.toFixed(2)} ${adx > 25 ? '(STRONG TREND)' : '(weak/ranging)'}
- +DI/-DI: ${plusDI.toFixed(2)}/${minusDI.toFixed(2)} ${plusDI > minusDI ? '(bullish momentum)' : '(bearish momentum)'}

**Advanced Order Flow Indicators Detected:**
- Bullish Order Blocks: ${bullishOBCount || 0}${bullishOB?.length ? ` (nearest at ${bullishOB[bullishOB.length - 1]?.price?.toFixed(4) || 'N/A'})` : ''}
- Bearish Order Blocks: ${bearishOBCount || 0}${bearishOB?.length ? ` (nearest at ${bearishOB[bearishOB.length - 1]?.price?.toFixed(4) || 'N/A'})` : ''}
- Bullish FVG (Fair Value Gaps): ${bullFVGCount || 0}${bullFVG?.length ? ` (nearest at ${bullFVG[bullFVG.length - 1]?.low?.toFixed(4) || 'N/A'}-${bullFVG[bullFVG.length - 1]?.high?.toFixed(4) || 'N/A'})` : ''}
- Bearish FVG: ${bearFVGCount || 0}${bearFVG?.length ? ` (nearest at ${bearFVG[bearFVG.length - 1]?.low?.toFixed(4) || 'N/A'}-${bearFVG[bearFVG.length - 1]?.high?.toFixed(4) || 'N/A'})` : ''}
- Buy Volume Imbalances: ${buyImbalancesCount || 0}${buyImbalances?.length ? ` (nearest at ${buyImbalances[buyImbalances.length - 1]?.price?.toFixed(4) || 'N/A'})` : ''}
- Sell Volume Imbalances: ${sellImbalancesCount || 0}${sellImbalances?.length ? ` (nearest at ${sellImbalances[sellImbalances.length - 1]?.price?.toFixed(4) || 'N/A'})` : ''}
- Absorption/Exhaustion Events: ${absorptionCount || 0}${absorption?.length ? ` (latest at ${absorption[absorption.length - 1]?.price?.toFixed(4) || 'N/A'}, ${absorption[absorption.length - 1]?.type || 'N/A'})` : ''}
- Hidden Divergences: ${hiddenDivergenceCount || 0}${hiddenDivergences?.length ? ` (latest: ${hiddenDivergences[hiddenDivergences.length - 1]?.type || 'N/A'})` : ''}
- Liquidity Grabs (Stop Hunts): ${liquidityGrabCount || 0}${liquidityGrabs?.length ? ` (latest: ${liquidityGrabs[liquidityGrabs.length - 1]?.type || 'N/A'} at ${liquidityGrabs[liquidityGrabs.length - 1]?.price?.toFixed(4) || 'N/A'})` : ''}
${orderflowAnalysis}

**LONG ENTRY CONFLUENCE SIGNALS (need 3+ for tradeable setup):**
1. Price mitigates bearish Order Block + bounces
2. Price mitigates bullish FVG + holds as support
3. Bullish hidden divergence (CVD rising while price makes lower lows)
4. CVD trending higher (bullish delta)
5. Price above POC/VAL + absorption at low volume node
6. Buy volume imbalance zone below current price (support)
7. Liquidity grab below equal lows + immediate bullish reversal
8. Price rejection from VAL with strong bullish candle
9. Bullish absorption event (large buy delta, weak price move up = accumulation)
14. CCI < -100 (oversold, reversal potential) or CCI crossing above 0 (bullish momentum)
15. ADX > 25 AND +DI > -DI (strong bullish trend confirmed)

**SHORT ENTRY CONFLUENCE SIGNALS (need 3+ for tradeable setup):**
1. Price mitigates bullish Order Block + rejects
2. Price mitigates bearish FVG + acts as resistance
3. Bearish hidden divergence (CVD falling while price makes higher highs)
4. CVD trending lower (bearish delta)
5. Price below POC/VAH + absorption at high volume node
6. Sell volume imbalance zone above current price (resistance)
7. Liquidity grab above equal highs + immediate bearish reversal
8. Price rejection from VAH with strong bearish candle
9. Bearish absorption event (large sell delta, weak price move down = distribution)
14. CCI > +100 (overbought, reversal potential) or CCI crossing below 0 (bearish momentum)
15. ADX > 25 AND -DI > +DI (strong bearish trend confirmed)

**GRADING SYSTEM (institutional-grade with professional orderflow and oscillators):**
- A+ Grade: 8+ confluence signals (institutional-grade setup with orderflow + oscillator alignment)
- A Grade: 7 confluence signals (excellent trade, very high probability)
- B Grade: 5-6 confluence signals (very good trade, strong edge)
- C Grade: 3-4 confluence signals (tradeable setup, minimum for entry)
- D Grade: 2 confluence signals (weak, watch only, avoid)
- E Grade: 1 or conflicting signals (do not trade)

**IMPORTANT:** Institutional orderflow signals (#10-13) are CRITICAL for professional-grade setups. Oscillator signals (#14-15 CCI/ADX) add technical confirmation. When OI+Funding+CVD+Oscillators align in the same direction AND 4+ other signals confirm, this is an A+ grade institutional trade - you're trading WITH the smart money using both institutional flow AND momentum/trend confirmation.

**YOUR TASK:**
Analyze the current order flow data INCLUDING professional orderflow metrics (OI, Funding, L/S Ratio) AND oscillator signals (CCI, ADX) and identify 1-3 high-probability trade setups ONLY IF there's genuine confluence worth trading. For each setup, count how many confluence signals align (including institutional orderflow and oscillators if applicable) and assign the appropriate grade. Return a JSON object with:
- grade: A+, A, B, C, D, or E
- direction: LONG or SHORT
- entry: specific entry price zone (e.g., "2.35-2.37")
- stopLoss: stop loss price (e.g., "2.30")
- targets: array of 2-3 take profit targets (e.g., ["2.42", "2.48", "2.55"])
- confluenceSignals: array of specific signals detected from the lists above (including institutional orderflow if detected)
- confluenceCount: exact number of confluence signals (1-15, with institutional orderflow and oscillator signals counting as critical signals)
- reasoning: brief explanation of why this setup has edge (1-2 sentences, mention institutional orderflow if applicable)

Return ONLY a JSON object in this exact format:
{
  "alerts": [
    {
      "grade": "A+",
      "direction": "LONG",
      "entry": "price range",
      "stopLoss": "price",
      "targets": ["TP1", "TP2", "TP3"],
      "confluenceSignals": ["signal1", "signal2", "signal3", ...],
      "confluenceCount": 7,
      "reasoning": "explanation"
    }
  ],
  "marketInsights": {
    "noTradesReason": "Why no C+ grade setups exist (if applicable)",
    "summary": "Brief market summary with key observations about current structure, CVD trend, orderflow signals, and what to watch for",
    "bias": "BULLISH/BEARISH/NEUTRAL with brief reasoning"
  }
}

If no trade setups meet at least C grade (3+ confluence), still provide marketInsights. Always include a market summary analyzing the current order flow, CVD, POC/VAH/VAL positioning, institutional orderflow metrics, and key price levels to watch. Focus on quality over quantity - only return setups with genuine confluence, not forced signals.`;

      console.log('🤖 Calling xAI Grok for order flow analysis...');
      const startTime = Date.now();
      
      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are a professional SMC/order flow trader. Return ONLY valid JSON, no additional text or markdown formatting."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent structured output
        max_tokens: 2000
      });

      const content = response.choices[0].message.content || "{}";
      const duration = Date.now() - startTime;

      // Parse JSON response
      let result;
      try {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        result = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('Failed to parse Grok response:', content);
        result = { alerts: [] };
      }

      // Estimate cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

      console.log(`✅ xAI order flow analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);
      console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out`);
      console.log(`🎯 Alerts generated: ${result.alerts?.length || 0}`);

      // Send push notifications for A+, A, B, C grade setups (filtered by user preferences)
      if (result.alerts && Array.isArray(result.alerts)) {
        for (const alert of result.alerts) {
          if (['A+', 'A', 'B', 'C'].includes(alert.grade)) {
            const gradeEmoji = alert.grade === 'A+' ? '🏆' : alert.grade === 'A' ? '⭐' : alert.grade === 'B' ? '✨' : '💎';
            const directionEmoji = alert.direction === 'LONG' ? '🟢' : '🔴';
            
            await sendPushNotification({
              title: `${gradeEmoji} ${alert.grade} Grade Trade Alert ${directionEmoji}`,
              body: `${alert.direction} ${symbol} @ ${alert.entry} | ${alert.confluenceCount} signals | ${alert.reasoning.substring(0, 80)}...`,
              icon: '/favicon.ico',
              url: '/cryptoai',
              symbol: symbol, // Pass symbol for filtering
              grade: alert.grade, // Pass grade for filtering
              tag: `trade-${symbol}-${Date.now()}`,
              alertData: {
                symbol,
                interval,
                ...alert
              }
            });
            
            console.log(`📬 Push notification sent for ${alert.grade} grade ${alert.direction} setup`);
          }
        }
      }

      res.json({
        ...result,
        estimatedCost,
        tokens: {
          input: inputTokens,
          output: outputTokens
        }
      });
    } catch (error: any) {
      console.error('❌ Error generating order flow alerts:', error);
      res.status(500).json({ 
        error: error.message,
        details: error.response?.data || 'Unknown error',
        alerts: []
      });
    }
  });

  // Push notification subscription endpoint (publicly accessible)
  app.post("/api/crypto/subscribe", async (req, res) => {
    try {
      const subscription = req.body;
      
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription object' });
      }

      const { db } = await import("./db");
      const { pushSubscriptions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      // Check if subscription already exists
      const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));

      if (existing.length > 0) {
        // Update last used timestamp
        await db.update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        console.log(`📬 Updated existing push subscription`);
      } else {
        // Insert new subscription
        await db.insert(pushSubscriptions).values({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userId: null, // TODO: Link to user if authenticated
        });
        console.log(`📬 New push subscription added`);
      }

      const totalCount = await db.select().from(pushSubscriptions);
      console.log(`📬 Total push subscriptions: ${totalCount.length}`);
      
      res.json({ success: true, message: 'Subscribed to push notifications' });
    } catch (error: any) {
      console.error('❌ Error subscribing to push notifications:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send push notification helper (used internally)
  async function sendPushNotification(payload: any) {
    const { db } = await import("./db");
    const { pushSubscriptions, cryptoSubscriptions } = await import("@shared/schema");
    const { inArray, eq } = await import("drizzle-orm");

    // Get all push subscriptions from database
    const allSubscriptions = await db.select().from(pushSubscriptions);

    if (allSubscriptions.length === 0) {
      console.log('📭 No push subscriptions to send to');
      return;
    }

    const webpush = await import('web-push');
    
    // VAPID keys disabled - push notifications not available
    const publicVapid = null; // process.env.PUBLIC_VAPID_KEY;
    const privateVapid = null; // process.env.PRIVATE_VAPID_KEY;
    
    if (!publicVapid || !privateVapid) {
      console.log('📭 Push notifications temporarily disabled - API configuration required');
      return;
    }
    
    webpush.default.setVapidDetails(
      'mailto:admin@cryptoc.app',
      publicVapid,
      privateVapid
    );

    // Filter subscriptions based on user preferences (if symbol and grade provided)
    let filteredSubscriptions = allSubscriptions;
    if (payload.symbol && payload.grade) {
      try {
        // Get all user preferences
        const allPrefs = await db.select().from(cryptoSubscriptions);
        
        // Filter to users who:
        // 1. Have this symbol in selectedTickers (or empty array = all)
        // 2. Have this grade in alertGrades (or empty array = all)
        const allowedUserIds = allPrefs
          .filter(pref => {
            const tickers = pref.selectedTickers || [];
            const grades = pref.alertGrades || [];
            const tickerMatch = tickers.length === 0 || tickers.includes(payload.symbol);
            const gradeMatch = grades.length === 0 || grades.includes(payload.grade);
            return tickerMatch && gradeMatch;
          })
          .map(pref => pref.userId);

        console.log(`🔔 Filtering notifications: ${allowedUserIds.length}/${allPrefs.length} users match preferences (${payload.symbol} / ${payload.grade})`);
        
        // Filter subscriptions to only those linked to allowed users
        if (allowedUserIds.length > 0) {
          filteredSubscriptions = allSubscriptions.filter(sub => 
            sub.userId === null || allowedUserIds.includes(sub.userId)
          );
        }
      } catch (error) {
        console.error('Error filtering subscriptions:', error);
        // Fall back to sending to all
        filteredSubscriptions = allSubscriptions;
      }
    }

    const notificationPayload = JSON.stringify(payload);
    
    console.log(`📬 Sending push to ${filteredSubscriptions.length} subscriptions...`);
    
    // Convert DB subscriptions to web-push format
    const webPushSubscriptions = filteredSubscriptions.map(sub => ({
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    }));

    const results = await Promise.allSettled(
      webPushSubscriptions.map(subscription =>
        webpush.default.sendNotification(subscription, notificationPayload)
      )
    );

    // Remove failed subscriptions (expired/invalid) from database
    const failedEndpoints: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const subscription = filteredSubscriptions[index];
        console.log(`❌ Push failed for subscription ${subscription.endpoint}:`, result.reason);
        failedEndpoints.push(subscription.endpoint);
      }
    });

    if (failedEndpoints.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, failedEndpoints));
      console.log(`🗑️ Removed ${failedEndpoints.length} failed subscriptions from database`);
    }

    console.log(`✅ Push sent successfully to ${results.filter(r => r.status === 'fulfilled').length} subscriptions`);
  }

  // === Crypto Subscription Endpoints ===
  
  // Get user's crypto subscription details (with tier and credits)
  app.get("/api/crypto/subscription", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const userEmail = (req as any).cryptoUser.email;

      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      await cryptoSubscriptionService.resetMonthlyCredits(userId);
      
      const stats = await cryptoSubscriptionService.getSubscriptionStats(userId);
      
      console.log(`📊 Subscription fetched for ${userEmail} (${userId}):`, {
        tier: subscription.tier,
        status: subscription.subscriptionStatus,
        aiCredits: subscription.aiCredits
      });
      
      res.json({
        ...subscription,
        stats
      });
    } catch (error: any) {
      console.error('Error fetching crypto subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get current user's subscription tier, credits, and stats (NO alert preferences - use /api/crypto/preferences for those)
  app.get("/api/crypto/my-subscription", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const userEmail = (req as any).cryptoUser.email;

      console.log(`🚨 CRYPTO SUBSCRIPTION ENDPOINT CALLED!`);
      console.log(`   📧 Email: ${userEmail}`);
      console.log(`   🆔 User ID: ${userId}`);
      console.log(`   🔍 Type of userId: ${typeof userId}`);

      await cryptoSubscriptionService.resetMonthlyCredits(userId);
      const stats = await cryptoSubscriptionService.getSubscriptionStats(userId);
      
      console.log(`🎯 STATS RETURNED:`, JSON.stringify(stats, null, 2));
      console.log(`   ⚠️ Tier in stats: ${stats.tier}`);
      
      // Return subscription stats only (tier, AI credits, renewal info)
      res.json(stats);
    } catch (error: any) {
      console.error('❌ Error fetching crypto subscription stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Market Review (Beginner+ tier)
  app.post("/api/crypto/ai-market-review", requireCryptoAuth, async (req, res) => {
    try {
      // Check if XAI API key is configured
      const apiKeyCheck = checkXaiApiKey();
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false 
        });
      }

      const userId = (req as any).cryptoUser.id;

      const hasAccess = await cryptoSubscriptionService.checkTierAccess(userId, 'beginner');
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Please upgrade to Beginner tier or higher to access AI Market Review',
          requiredTier: 'beginner'
        });
      }

      const { candles, indicators } = req.body;

      if (!candles || !indicators) {
        return res.status(400).json({ error: 'Missing required fields: candles, indicators' });
      }

      const prompt = `You are a professional crypto market analyst. Based on the following market data, provide a comprehensive market analysis summary.

Market Data:
- Total candles: ${candles.length}
- Latest price: ${candles[candles.length - 1]?.close || 'N/A'}
- Indicators: ${JSON.stringify(indicators, null, 2)}

Provide a clear, actionable market review covering:
1. Current market trend and momentum
2. Key support and resistance levels
3. Volume analysis
4. Overall market sentiment
5. Risk assessment

Keep the analysis concise but informative (200-300 words).`;

      const completion = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          { role: "system", content: "You are a professional crypto market analyst providing clear, actionable insights." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const analysis = completion.choices[0]?.message?.content || 'No analysis generated';

      res.json({ 
        analysis,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error generating market review:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Trade Ideas with grading (Intermediate+ tier)
  app.post("/api/crypto/ai-trade-ideas", requireCryptoAuth, async (req, res) => {
    try {
      // Check if XAI API key is configured
      const apiKeyCheck = checkXaiApiKey();
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false 
        });
      }

      const userId = (req as any).cryptoUser.id;

      const hasAccess = await cryptoSubscriptionService.checkTierAccess(userId, 'intermediate');
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Please upgrade to Intermediate tier or higher to access AI Trade Ideas',
          requiredTier: 'intermediate'
        });
      }

      const canUseCredit = await cryptoSubscriptionService.useAICredit(userId);
      if (!canUseCredit) {
        return res.status(403).json({ 
          error: 'No AI credits remaining',
          message: 'You have used all your AI credits for this month. Upgrade to Pro for unlimited credits.'
        });
      }

      const { candles, indicators, ticker } = req.body;

      if (!candles || !indicators || !ticker) {
        return res.status(400).json({ error: 'Missing required fields: candles, indicators, ticker' });
      }

      const latestCandle = candles[candles.length - 1];
      
      const prompt = `You are a professional crypto trader analyzing ${ticker}. Generate 2-3 high-quality trade setups based on the following data:

Current Price: ${latestCandle?.close || 'N/A'}
Market Data: ${candles.length} candles analyzed
Indicators: ${JSON.stringify(indicators, null, 2)}

For each trade setup, provide:
1. Grade (A+, A, B, C, D, or E) based on setup quality and probability
2. Direction (long or short)
3. Entry price (specific level)
4. Target price (profit target)
5. Stop loss (risk management level)
6. Reasoning (2-3 sentences explaining the setup)
7. Confidence (0-100)

Return ONLY valid JSON in this exact format:
{
  "setups": [
    {
      "grade": "A+",
      "direction": "long",
      "entry": 0.00,
      "target": 0.00,
      "stopLoss": 0.00,
      "reasoning": "explanation here",
      "confidence": 85
    }
  ]
}`;

      const completion = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          { role: "system", content: "You are a professional crypto trader. Return only valid JSON, no markdown." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 1000
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      
      let tradeIdeas;
      try {
        const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        tradeIdeas = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Failed to parse AI response:', responseText);
        tradeIdeas = {
          setups: [],
          error: 'Failed to generate trade ideas'
        };
      }

      const stats = await cryptoSubscriptionService.getSubscriptionStats(userId);

      res.json({ 
        ...tradeIdeas,
        remainingCredits: stats.aiCredits,
        hasUnlimitedCredits: stats.hasUnlimitedCredits,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error generating trade ideas:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe removed - all features free
  app.post("/api/crypto/subscribe-tier", async (req, res) => {
    res.json({ 
      message: 'All features are now free! No payment required.',
      tier: 'elite',
      freeAccess: true 
    });
  });

  app.post("/api/crypto/create-checkout", async (req, res) => {
    res.json({ 
      message: 'All features are now free! No payment required.',
      tier: 'elite',
      freeAccess: true 
    });
  });

  // Get crypto alert preferences
  app.get("/api/crypto/preferences", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      
      // Return alert preferences with safe defaults
      res.json({
        selectedTickers: subscription?.selectedTickers || [],
        alertGrades: subscription?.alertGrades || ['A+', 'A'],
        alertTimeframes: subscription?.alertTimeframes || ['15m', '1h', '4h'],
        alertTypes: subscription?.alertTypes || ['bos', 'choch', 'fvg', 'liquidation'],
        alertsEnabled: subscription?.alertsEnabled || false,
        pushSubscription: subscription?.pushSubscription || null,
        tier: subscription?.tier || 'free',
      });
    } catch (error: any) {
      console.error('Error fetching crypto preferences:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update crypto preferences (selected tickers, alert grades, timeframes, types, push subscription)
  app.post("/api/crypto/preferences", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { selectedTickers, alertGrades, alertTimeframes, alertTypes, alertsEnabled, pushSubscription } = req.body;

      // Get user subscription for tier-based validation
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const tier = subscription?.tier || 'free';

      // Tier-based limits with progressive feature unlocking
      const tierLimits = {
        free: { 
          maxTickers: 1, 
          allowedAlertTypes: ['bos', 'choch'],
          allowedGrades: ['A+', 'A', 'B'],
          allowedTimeframes: ['15m', '1h', '4h', '1d']
        },
        beginner: { 
          maxTickers: 3, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D'],
          allowedTimeframes: ['5m', '15m', '1h', '4h', '1d']
        },
        intermediate: { 
          maxTickers: 3, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        pro: { 
          maxTickers: 3, 
          allowedAlertTypes: [
            'bos', 'choch', 'fvg', 'liquidation', 
            'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx',
            'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross'
          ],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        elite: { 
          maxTickers: 3, 
          allowedAlertTypes: [
            // All alert types - Smart Money, Oscillators, Indicators, Volume, Price Action
            'bos', 'choch', 'fvg', 'liquidation',
            'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx',
            'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross',
            'volume_spike', 'volume_divergence', 'obv_divergence', 'cvd_spike',
            'engulfing', 'hammer_star'
          ],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
      };

      const limits = tierLimits[tier as keyof typeof tierLimits] || tierLimits.free;

      // Validate ticker count based on tier
      if (selectedTickers && selectedTickers.length > limits.maxTickers) {
        return res.status(403).json({ 
          error: `${tier} tier allows maximum ${limits.maxTickers} ticker(s)`,
          requiredTier: 'beginner'
        });
      }

      // Validate alert types based on tier
      if (alertTypes) {
        const invalidTypes = alertTypes.filter((type: string) => !limits.allowedAlertTypes.includes(type));
        if (invalidTypes.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support alert types: ${invalidTypes.join(', ')}`,
            requiredTier: 'beginner'
          });
        }
      }

      // Validate alert grades based on tier
      if (alertGrades) {
        const invalidGrades = alertGrades.filter((grade: string) => !limits.allowedGrades.includes(grade));
        if (invalidGrades.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support grades: ${invalidGrades.join(', ')}`,
            requiredTier: 'beginner'
          });
        }
      }

      // Validate timeframes based on tier
      if (alertTimeframes) {
        const invalidTimeframes = alertTimeframes.filter((tf: string) => !limits.allowedTimeframes.includes(tf));
        if (invalidTimeframes.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support timeframes: ${invalidTimeframes.join(', ')}`,
            requiredTier: 'beginner'
          });
        }
      }

      const { db } = await import("./db");
      const { cryptoSubscriptions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const updateData: any = { updatedAt: new Date() };
      if (selectedTickers !== undefined) updateData.selectedTickers = selectedTickers;
      if (alertGrades !== undefined) updateData.alertGrades = alertGrades;
      if (alertTimeframes !== undefined) updateData.alertTimeframes = alertTimeframes;
      if (alertTypes !== undefined) updateData.alertTypes = alertTypes;
      if (alertsEnabled !== undefined) updateData.alertsEnabled = alertsEnabled;
      if (pushSubscription !== undefined) updateData.pushSubscription = pushSubscription;

      const updated = await db.update(cryptoSubscriptions)
        .set(updateData)
        .where(eq(cryptoSubscriptions.userId, userId))
        .returning();

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating crypto preferences:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Tracked Trades API - Create/Track a trade
  app.post("/api/crypto/tracked-trades", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { symbol, direction, grade, entry, stopLoss, targets, confluenceSignals, reasoning } = req.body;

      if (!symbol || !direction || !grade || !entry || !stopLoss || !targets) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Check if this trade already exists (same user, symbol, direction, entry)
      const existingTrade = await db.select().from(trackedTrades)
        .where(and(
          eq(trackedTrades.userId, userId),
          eq(trackedTrades.symbol, symbol),
          eq(trackedTrades.direction, direction),
          eq(trackedTrades.entry, entry.toString())
        ))
        .limit(1);

      // If trade already exists, return it instead of creating duplicate
      if (existingTrade.length > 0) {
        console.log('🔁 Trade already tracked, returning existing:', existingTrade[0].id);
        return res.json(existingTrade[0]);
      }

      // Create new trade
      const newTrade = await db.insert(trackedTrades).values({
        userId,
        symbol,
        direction,
        grade,
        entry: entry.toString(),
        stopLoss: stopLoss.toString(),
        targets: targets.map((t: number) => t.toString()),
        confluenceSignals: confluenceSignals || [],
        reasoning: reasoning || null,
        status: "pending",
      }).returning();

      console.log('✅ New trade tracked:', newTrade[0].id);
      res.json(newTrade[0]);
    } catch (error: any) {
      console.error('Error creating tracked trade:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all tracked trades for user
  app.get("/api/crypto/tracked-trades", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");

      const trades = await db.select().from(trackedTrades)
        .where(eq(trackedTrades.userId, userId))
        .orderBy(desc(trackedTrades.createdAt));

      res.json(trades);
    } catch (error: any) {
      console.error('Error fetching tracked trades:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get tracked trades for specific symbol
  app.get("/api/crypto/tracked-trades/:symbol", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { symbol } = req.params;
      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, and, desc } = await import("drizzle-orm");

      const trades = await db.select().from(trackedTrades)
        .where(and(
          eq(trackedTrades.userId, userId),
          eq(trackedTrades.symbol, symbol)
        ))
        .orderBy(desc(trackedTrades.createdAt));

      res.json(trades);
    } catch (error: any) {
      console.error('Error fetching tracked trades:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update tracked trade status
  app.patch("/api/crypto/tracked-trades/:id", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { id } = req.params;
      const { status, entryHitAt, slHitAt, tpHitAt, tpHitLevel } = req.body;

      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const updateData: any = { updatedAt: new Date() };
      if (status) updateData.status = status;
      if (entryHitAt) updateData.entryHitAt = new Date(entryHitAt);
      if (slHitAt) updateData.slHitAt = new Date(slHitAt);
      if (tpHitAt) updateData.tpHitAt = new Date(tpHitAt);
      if (tpHitLevel) updateData.tpHitLevel = tpHitLevel;

      const updated = await db.update(trackedTrades)
        .set(updateData)
        .where(and(
          eq(trackedTrades.id, id),
          eq(trackedTrades.userId, userId)
        ))
        .returning();

      if (updated.length === 0) {
        return res.status(404).json({ error: "Trade not found" });
      }

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating tracked trade:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete/Cancel tracked trade
  app.delete("/api/crypto/tracked-trades/:id", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { id } = req.params;

      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      const deleted = await db.delete(trackedTrades)
        .where(and(
          eq(trackedTrades.id, id),
          eq(trackedTrades.userId, userId)
        ))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Trade not found" });
      }

      res.json({ success: true, trade: deleted[0] });
    } catch (error: any) {
      console.error('Error deleting tracked trade:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear all pending/active trades for a symbol (used when refreshing AI signals)
  app.delete("/api/crypto/tracked-trades/clear/:symbol", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { symbol } = req.params;

      const { db } = await import("./db");
      const { trackedTrades } = await import("@shared/schema");
      const { eq, and, or, inArray } = await import("drizzle-orm");

      // Delete all pending and entry_hit trades for this symbol
      const deleted = await db.delete(trackedTrades)
        .where(and(
          eq(trackedTrades.userId, userId),
          eq(trackedTrades.symbol, symbol),
          or(
            eq(trackedTrades.status, 'pending'),
            eq(trackedTrades.status, 'entry_hit')
          )
        ))
        .returning();

      console.log(`🧹 Cleared ${deleted.length} pending trades for ${symbol}`);
      res.json({ success: true, deletedCount: deleted.length, trades: deleted });
    } catch (error: any) {
      console.error('Error clearing tracked trades:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe webhook removed - all features free
  app.post('/api/crypto/stripe-webhook', async (req, res) => {
    res.status(200).json({ received: true, message: "Stripe disabled - all features free" });
  });

  // Binance API proxy endpoint for crypto chart data
  app.get("/api/binance/klines", async (req, res) => {
    try {
      const { symbol, interval, limit, endTime } = req.query;
      
      if (!symbol || !interval) {
        return res.status(400).json({ error: 'symbol and interval are required' });
      }

      let url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit || 1000}`;
      if (endTime) {
        url += `&endTime=${endTime}`;
      }
      console.log('📊 Fetching Binance data:', url);
      
      const response = await fetch(url);
      console.log('📊 Binance response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Binance API error:', errorText);
        throw new Error(`Binance API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Binance data received, array length:', data.length);
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching Binance data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== ELLIOTT WAVE ROUTES (OPEN ACCESS) ====================

  // Get wave labels for a user/symbol/timeframe
  app.get("/api/crypto/elliott-wave/labels", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe } = req.query;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'Symbol and timeframe are required' });
      }
      
      const { getWaveLabels } = await import("./services/elliottWaveService");
      const labels = await getWaveLabels(
        (req as any).cryptoUser.id,
        symbol as string,
        timeframe as string
      );
      
      res.json(labels);
    } catch (error: any) {
      console.error('Error fetching wave labels:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new wave label
  app.post("/api/crypto/elliott-wave/labels", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe, degree, patternType, points, isComplete, fibonacciMode, validationResult, metadata } = req.body;
      
      if (!symbol || !timeframe || !degree || !patternType || !points) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const { saveWaveLabel } = await import("./services/elliottWaveService");
      const label = await saveWaveLabel({
        userId: (req as any).cryptoUser.id,
        symbol,
        timeframe,
        degree,
        patternType,
        points,
        isComplete: isComplete ?? false,
        fibonacciMode: fibonacciMode ?? 'measured',
        validationResult,
        metadata,
      });
      
      res.json(label);
    } catch (error: any) {
      console.error('Error creating wave label:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update a wave label
  app.patch("/api/crypto/elliott-wave/labels/:id", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const { updateWaveLabel, getWaveLabels } = await import("./services/elliottWaveService");
      
      // First verify the label belongs to this user
      const { storage } = await import("./storage");
      const existingLabel = await storage.getElliottWaveLabel(id);
      
      if (!existingLabel) {
        return res.status(404).json({ error: 'Wave label not found' });
      }
      
      if (existingLabel.userId !== (req as any).cryptoUser.id) {
        return res.status(403).json({ error: 'Not authorized to update this label' });
      }
      
      const updated = await updateWaveLabel(id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating wave label:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a wave label
  app.delete("/api/crypto/elliott-wave/labels/:id", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { storage } = await import("./storage");
      const existingLabel = await storage.getElliottWaveLabel(id);
      
      if (!existingLabel) {
        return res.status(404).json({ error: 'Wave label not found' });
      }
      
      if (existingLabel.userId !== (req as any).cryptoUser.id) {
        return res.status(403).json({ error: 'Not authorized to delete this label' });
      }
      
      const { deleteWaveLabel } = await import("./services/elliottWaveService");
      await deleteWaveLabel(id);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting wave label:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear all labels for a symbol/timeframe
  app.delete("/api/crypto/elliott-wave/labels/:symbol/:timeframe", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      
      const { clearWaveLabels } = await import("./services/elliottWaveService");
      await clearWaveLabels((req as any).cryptoUser.id, symbol, timeframe);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error clearing wave labels:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-analyze for Elliott Wave patterns
  app.post("/api/crypto/elliott-wave/analyze", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { candles, startIndex, endIndex } = req.body;
      
      if (!candles || startIndex === undefined || endIndex === undefined) {
        return res.status(400).json({ error: 'Candles, startIndex, and endIndex are required' });
      }
      
      const { autoAnalyze } = await import("./services/elliottWaveService");
      const result = autoAnalyze(candles, startIndex, endIndex);
      
      res.json(result);
    } catch (error: any) {
      console.error('Error auto-analyzing wave:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DEBUG: Get exact prompt for Grok-4 testing (no API call)
  app.post("/api/crypto/elliott-wave/debug-prompt", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { candleData, symbol, timeframe, visibleRange } = req.body;
      
      // Parse visible range
      let range = { start: 0, end: 0, count: 0 };
      try {
        if (visibleRange) range = JSON.parse(visibleRange);
      } catch (e) { /* use defaults */ }

      const dataToAnalyze = candleData || 'No candle data provided.';
      const candleCount = range.count || (dataToAnalyze.match(/^\[\d+\]/gm) || []).length;
      
      const indexMatches = dataToAnalyze.match(/^\[(\d+)\]/gm) || [];
      const firstIdx = indexMatches[0]?.match(/\d+/)?.[0] || '0';
      const lastIdx = indexMatches[indexMatches.length - 1]?.match(/\d+/)?.[0] || String(candleCount - 1);
      
      const systemPrompt = "You are an Elliott Wave analyst. Return valid JSON only, no markdown.";
      
      const userPrompt = `Elliott Wave analysis for ${symbol || 'BTCUSDT'} ${timeframe || '1d'}.

DATA (${candleCount} candles, index ${firstIdx}-${lastIdx}):
${dataToAnalyze}

Return JSON:
{"patternType":"impulse|diagonal|zigzag|flat|triangle","direction":"bullish|bearish","confidence":0.0-1.0,"suggestedLabels":[{"label":"0","candleIndex":N,"price":N,"snapTo":"low|high"}],"analysis":"Brief explanation"}`;
      
      res.json({
        model: "grok-4",
        systemPrompt,
        userPrompt,
        candleCount,
        charCount: userPrompt.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI-powered Elliott Wave analysis using Grok
  app.post("/api/crypto/elliott-wave/ai-analyze", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { chartImage, candleData, symbol, timeframe, existingLabels, degreeContext, visibleRange } = req.body;
      
      // Accept chartImage, candleData, or existingLabels (which may contain candle data)
      if (!chartImage && !candleData && !existingLabels) {
        return res.status(400).json({ error: 'Either chart image or candle data is required' });
      }
      
      if (!process.env.XAI_API_KEY) {
        return res.status(503).json({ error: 'AI analysis service unavailable. Configuration required.' });
      }
      
      console.log(`🤖 Grok AI analyzing ${symbol} ${timeframe} chart (${candleData ? 'data mode' : 'image mode'})...`);
      if (degreeContext) console.log(`🤖 Degree context: ${degreeContext}`);
      if (visibleRange) console.log(`🤖 Visible range: ${visibleRange}`);
      
      const { analyzeChartWithGrok } = await import("./services/grokElliottWaveService");
      const analysis = await analyzeChartWithGrok(
        chartImage || null,
        symbol || 'BTCUSDT',
        timeframe || '1d',
        existingLabels,
        candleData,
        degreeContext,
        visibleRange
      );
      
      console.log(`✅ Grok analysis complete: ${analysis.patternType} pattern with ${(analysis.confidence * 100).toFixed(0)}% confidence`);
      
      res.json(analysis);
    } catch (error: any) {
      console.error('Error in AI wave analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Validate an Elliott Wave pattern
  app.post("/api/crypto/elliott-wave/validate", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { patternType, points, isLeading } = req.body;
      
      if (!patternType || !points) {
        return res.status(400).json({ error: 'Pattern type and points are required' });
      }
      
      const { validateImpulseWave, validateCorrectiveWave, validateTriangle, validateDiagonal } = await import("./services/elliottWaveService");
      
      let result;
      switch (patternType) {
        case 'impulse':
          result = validateImpulseWave(points);
          break;
        case 'correction':
        case 'zigzag':
        case 'flat':
          result = validateCorrectiveWave(points, patternType as 'correction' | 'zigzag' | 'flat');
          break;
        case 'triangle':
          result = validateTriangle(points);
          break;
        case 'diagonal':
          result = validateDiagonal(points);
          break;
        default:
          return res.status(400).json({ error: `Unsupported pattern type: ${patternType}` });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('Error validating wave pattern:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get wave degrees info (for UI)
  app.get("/api/crypto/elliott-wave/degrees", async (req, res) => {
    try {
      const { WAVE_DEGREES, CORRECTION_LABELS } = await import("./services/elliottWaveService");
      res.json({ degrees: WAVE_DEGREES, correctionLabels: CORRECTION_LABELS });
    } catch (error: any) {
      console.error('Error fetching wave degrees:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get extended historical data for Elliott Wave analysis
  app.get("/api/crypto/extended-history", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe, forceRefresh } = req.query;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'Symbol and timeframe are required' });
      }
      
      const { fetchExtendedHistory } = await import("./services/historicalDataService");
      const candles = await fetchExtendedHistory(
        symbol as string,
        timeframe as string,
        forceRefresh === 'true'
      );
      
      res.json({
        symbol,
        timeframe,
        candleCount: candles.length,
        startTime: candles.length > 0 ? candles[0].time : null,
        endTime: candles.length > 0 ? candles[candles.length - 1].time : null,
        candles,
      });
    } catch (error: any) {
      console.error('Error fetching extended history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get historical data stats
  app.get("/api/crypto/extended-history/stats", requireCryptoAuth, async (req, res) => {
    try {
      const { symbol, timeframe } = req.query;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'Symbol and timeframe are required' });
      }
      
      const { getHistoricalDataStats } = await import("./services/historicalDataService");
      const stats = await getHistoricalDataStats(symbol as string, timeframe as string);
      
      if (!stats) {
        return res.json({ cached: false });
      }
      
      res.json({
        cached: true,
        ...stats,
      });
    } catch (error: any) {
      console.error('Error fetching history stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== END ELLIOTT WAVE ROUTES ====================

  // Start price monitoring service for tracked trades
  const { priceMonitorService } = await import("./services/priceMonitorService");
  priceMonitorService.start();

  const httpServer = createServer(app);
  return httpServer;
}
