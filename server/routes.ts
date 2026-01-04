import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { execFile } from "child_process";

// Extend Express Request type to include custom properties
declare global {
  namespace Express {
    interface Request {
      user?: any;
      cryptoUser?: any;
    }
  }
}
import { promisify } from "util";
import path from "path";
import OpenAI from "openai";
import WebSocket from "ws";
import { storage } from "./storage";
import { CalculationService } from "./services/calculationService";
import { calculationRequestSchema, insertFeedbackSchema } from "@shared/schema";

const execFileAsync = promisify(execFile);

// XAI API configured to use Vercel secret
const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY // NOW USING THE SECRET
});

// Helper to check if XAI API key is configured
function checkXaiApiKey(): { configured: boolean; error?: string } {
  if (!process.env.XAI_API_KEY) {
    return {
      configured: false,
      error: "AI analysis requires XAI_API_KEY to be configured."
    };
  }
  return { configured: true };
}


// In-memory cache for market analysis (15 min TTL)
interface AnalysisCache {
  analysis: string;
  timestamp: number;
  cost: number;
}
let marketAnalysisCache: AnalysisCache | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ===== TECHNICAL INDICATOR CALCULATION FUNCTIONS =====
interface CandleBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

// RSI (14-period)
function calculateRSI(bars: CandleBar[], period: number = 14): number {
  if (bars.length < period + 1) return 50;
  const changes = bars.slice(1).map((b, i) => b.close - bars[i].close);
  const recentChanges = changes.slice(-period);
  let gains = 0, losses = 0;
  recentChanges.forEach(c => { if (c > 0) gains += c; else losses += Math.abs(c); });
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// MACD (12,26,9)
function calculateMACD(bars: CandleBar[]): { macd: number; signal: number; histogram: number; crossover: string; divergence: string } {
  const closes = bars.map(b => b.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdHistory: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    const e12 = calculateEMAAtIndex(closes, 12, i);
    const e26 = calculateEMAAtIndex(closes, 26, i);
    macdHistory.push(e12 - e26);
  }
  const signal = macdHistory.length >= 9 ? calculateEMA(macdHistory, 9) : macdLine;
  const histogram = macdLine - signal;
  
  // Detect crossover
  let crossover = 'none';
  if (macdHistory.length >= 2) {
    const prevMacd = macdHistory[macdHistory.length - 2];
    const prevSignal = macdHistory.length >= 10 ? calculateEMA(macdHistory.slice(0, -1), 9) : prevMacd;
    if (prevMacd < prevSignal && macdLine > signal) crossover = 'bullish';
    else if (prevMacd > prevSignal && macdLine < signal) crossover = 'bearish';
  }
  
  // Detect divergence (simplified)
  let divergence = 'none';
  if (bars.length >= 20) {
    const recent = bars.slice(-10);
    const prior = bars.slice(-20, -10);
    const recentHighPrice = Math.max(...recent.map(b => b.high));
    const priorHighPrice = Math.max(...prior.map(b => b.high));
    const recentLowPrice = Math.min(...recent.map(b => b.low));
    const priorLowPrice = Math.min(...prior.map(b => b.low));
    
    if (recentHighPrice > priorHighPrice && histogram < 0) divergence = 'hidden bullish';
    else if (recentLowPrice < priorLowPrice && histogram > 0) divergence = 'hidden bearish';
  }
  
  return { macd: macdLine, signal, histogram, crossover, divergence };
}

function calculateEMA(data: number[], period: number): number {
  if (data.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateEMAAtIndex(data: number[], period: number, endIndex: number): number {
  const slice = data.slice(0, endIndex + 1);
  return calculateEMA(slice, period);
}

// Stochastic (14,3,3)
function calculateStochastic(bars: CandleBar[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number; crossover: string } {
  if (bars.length < kPeriod) return { k: 50, d: 50, crossover: 'none' };
  
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const slice = bars.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map(b => b.high));
    const low = Math.min(...slice.map(b => b.low));
    const close = slice[slice.length - 1].close;
    const k = high === low ? 50 : ((close - low) / (high - low)) * 100;
    kValues.push(k);
  }
  
  const k = kValues[kValues.length - 1];
  const d = kValues.length >= dPeriod ? kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod : k;
  
  let crossover = 'none';
  if (kValues.length >= 2) {
    const prevK = kValues[kValues.length - 2];
    const prevD = kValues.length >= dPeriod + 1 ? kValues.slice(-dPeriod - 1, -1).reduce((a, b) => a + b, 0) / dPeriod : prevK;
    if (prevK < prevD && k > d) crossover = 'bullish';
    else if (prevK > prevD && k < d) crossover = 'bearish';
  }
  
  return { k, d, crossover };
}

// MFI (14-period Money Flow Index)
function calculateMFI(bars: CandleBar[], period: number = 14): { mfi: number; divergence: string } {
  if (bars.length < period + 1) return { mfi: 50, divergence: 'none' };
  
  let positiveFlow = 0, negativeFlow = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const prevTypicalPrice = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const rawMoneyFlow = typicalPrice * bars[i].volume;
    
    if (typicalPrice > prevTypicalPrice) positiveFlow += rawMoneyFlow;
    else if (typicalPrice < prevTypicalPrice) negativeFlow += rawMoneyFlow;
  }
  
  const mfi = negativeFlow === 0 ? 100 : 100 - (100 / (1 + positiveFlow / negativeFlow));
  
  // Simple divergence check
  let divergence = 'none';
  const recentClose = bars[bars.length - 1].close;
  const priorClose = bars[bars.length - period].close;
  if (recentClose > priorClose && mfi < 50) divergence = 'volume divergence';
  else if (recentClose < priorClose && mfi > 50) divergence = 'volume divergence';
  
  return { mfi, divergence };
}

// CMF (Chaikin Money Flow)
function calculateCMF(bars: CandleBar[], period: number = 20): { cmf: number; label: string } {
  if (bars.length < period) return { cmf: 0, label: 'neutral' };
  
  const recentBars = bars.slice(-period);
  let mfvSum = 0, volumeSum = 0;
  
  for (const bar of recentBars) {
    const mfm = bar.high === bar.low ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / (bar.high - bar.low);
    mfvSum += mfm * bar.volume;
    volumeSum += bar.volume;
  }
  
  const cmf = volumeSum === 0 ? 0 : mfvSum / volumeSum;
  const label = cmf > 0.1 ? 'accumulation' : cmf < -0.1 ? 'distribution' : 'neutral';
  
  return { cmf, label };
}

// ATR (14-period)
function calculateATR(bars: CandleBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  
  return trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Bollinger Bands (20,2)
function calculateBollingerBands(bars: CandleBar[], period: number = 20, stdDev: number = 2): { middle: number; upper: number; lower: number; bandwidth: number; squeeze: boolean } {
  if (bars.length < period) return { middle: 0, upper: 0, lower: 0, bandwidth: 0, squeeze: false };
  
  const closes = bars.slice(-period).map(b => b.close);
  const middle = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const bandwidth = (upper - lower) / middle;
  
  // Squeeze detection: bandwidth < 20-period average bandwidth * 0.5
  const squeeze = bandwidth < 0.02; // Simple threshold
  
  return { middle, upper, lower, bandwidth, squeeze };
}

// VWAP
function calculateVWAP(bars: CandleBar[]): { vwap: number; label: string } {
  if (bars.length === 0) return { vwap: 0, label: 'neutral' };
  
  let cumulativeTPV = 0, cumulativeVolume = 0;
  for (const bar of bars) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += tp * bar.volume;
    cumulativeVolume += bar.volume;
  }
  
  const vwap = cumulativeVolume === 0 ? bars[bars.length - 1].close : cumulativeTPV / cumulativeVolume;
  const currentPrice = bars[bars.length - 1].close;
  const label = currentPrice > vwap * 1.01 ? 'premium' : currentPrice < vwap * 0.99 ? 'discount' : 'neutral';
  
  return { vwap, label };
}

// OBV (On Balance Volume)
function calculateOBV(bars: CandleBar[]): { obv: number; divergence: string } {
  if (bars.length < 2) return { obv: 0, divergence: 'none' };
  
  let obv = 0;
  const obvHistory: number[] = [0];
  
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
    obvHistory.push(obv);
  }
  
  // Divergence detection
  let divergence = 'none';
  if (bars.length >= 20) {
    const recentPrice = bars.slice(-10);
    const priorPrice = bars.slice(-20, -10);
    const recentOBV = obvHistory.slice(-10);
    const priorOBV = obvHistory.slice(-20, -10);
    
    const priceUp = recentPrice[recentPrice.length - 1].close > priorPrice[priorPrice.length - 1].close;
    const obvUp = recentOBV[recentOBV.length - 1] > priorOBV[priorOBV.length - 1];
    
    if (priceUp && !obvUp) divergence = 'bearish';
    else if (!priceUp && obvUp) divergence = 'bullish';
  }
  
  return { obv, divergence };
}

// Swing Highs/Lows Detection
function detectSwingPoints(bars: CandleBar[], lookback: number = 5): { swingHighs: { price: number; bar: number }[]; swingLows: { price: number; bar: number }[] } {
  const swingHighs: { price: number; bar: number }[] = [];
  const swingLows: { price: number; bar: number }[] = [];
  
  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true, isLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (bars[i].high <= bars[i - j].high || bars[i].high <= bars[i + j].high) isHigh = false;
      if (bars[i].low >= bars[i - j].low || bars[i].low >= bars[i + j].low) isLow = false;
    }
    
    if (isHigh) swingHighs.push({ price: bars[i].high, bar: i - bars.length });
    if (isLow) swingLows.push({ price: bars[i].low, bar: i - bars.length });
  }
  
  return { swingHighs: swingHighs.slice(-5), swingLows: swingLows.slice(-5) };
}

// BOS/CHoCH Detection
function detectBOSCHoCH(bars: CandleBar[]): { bos: string; choch: string } {
  if (bars.length < 20) return { bos: 'none', choch: 'none' };
  
  const swings = detectSwingPoints(bars);
  const currentPrice = bars[bars.length - 1].close;
  
  let bos = 'none', choch = 'none';
  
  // Check for Break of Structure
  if (swings.swingHighs.length >= 2) {
    const lastHigh = swings.swingHighs[swings.swingHighs.length - 1].price;
    if (currentPrice > lastHigh) bos = 'bullish';
  }
  if (swings.swingLows.length >= 2) {
    const lastLow = swings.swingLows[swings.swingLows.length - 1].price;
    if (currentPrice < lastLow) bos = 'bearish';
  }
  
  // CHoCH: price breaks opposite direction after establishing a trend
  if (swings.swingHighs.length >= 2 && swings.swingLows.length >= 2) {
    const highs = swings.swingHighs.map(s => s.price);
    const lows = swings.swingLows.map(s => s.price);
    const wasUptrend = highs[highs.length - 1] > highs[highs.length - 2];
    const wasDowntrend = lows[lows.length - 1] < lows[lows.length - 2];
    
    if (wasUptrend && currentPrice < lows[lows.length - 1]) choch = 'bearish';
    if (wasDowntrend && currentPrice > highs[highs.length - 1]) choch = 'bullish';
  }
  
  return { bos, choch };
}

// Displacement Detection
function detectDisplacement(bars: CandleBar[]): { displacement: boolean; direction: string } {
  if (bars.length < 5) return { displacement: false, direction: 'none' };
  
  const recent = bars.slice(-3);
  const prior = bars.slice(-10, -3);
  
  const avgRange = prior.reduce((sum, b) => sum + (b.high - b.low), 0) / prior.length;
  const avgVolume = prior.reduce((sum, b) => sum + b.volume, 0) / prior.length;
  
  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range > avgRange * 2 && bar.volume > avgVolume * 1.5) {
      const direction = bar.close > bar.open ? 'bullish' : 'bearish';
      return { displacement: true, direction };
    }
  }
  
  return { displacement: false, direction: 'none' };
}

// ADX (Average Directional Index) for trend strength
function calculateADX(bars: CandleBar[], period: number = 14): number {
  if (bars.length < period * 2) return 25; // Default neutral
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevHigh = bars[i-1].high;
    const prevLow = bars[i-1].low;
    const prevClose = bars[i-1].close;
    
    // True Range
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  // Calculate smoothed values
  const smoothTR = tr.slice(-period).reduce((a, b) => a + b, 0);
  const smoothPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const smoothMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0);
  
  const plusDI = (smoothPlusDM / smoothTR) * 100;
  const minusDI = (smoothMinusDM / smoothTR) * 100;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  
  return isNaN(dx) ? 25 : dx;
}

// ===== END TECHNICAL INDICATOR FUNCTIONS =====

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
  
  // Check if we're in production (Vercel deployment or beartec.uk domain)
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || 
                       process.env.VERCEL === '1' ||
                       process.env.NODE_ENV === 'production';
  
  // Clerk authentication middleware for crypto routes
  const requireCryptoAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    // In development, allow open access
    if (!isProduction) {
      // Check if admin mode is requested via header
      const isAdminMode = req.headers['x-dev-admin-mode'] === 'true';
      req.cryptoUser = isAdminMode ? {
        id: 'user_36jmTprDUlzK89xlpNgGGtcH2KJ',
        email: 'beartec@beartec.uk',
        firstName: 'BearTec',
        lastName: 'Admin',
      } : {
        id: 'dev-open-access',
        email: 'dev@open.access',
        firstName: 'Dev',
        lastName: 'User',
      };
      return next();
    }
    
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7);
      
      // Verify the JWT token with Clerk
      const { createClerkClient, verifyToken } = await import('@clerk/backend');
      const secretKey = process.env.CLERK_SECRET_KEY;

      if (!secretKey) {
        console.error('CLERK_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const payload = await verifyToken(token, { secretKey });

      if (!payload?.sub) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user details from Clerk
      const clerk = createClerkClient({ secretKey });
      const user = await clerk.users.getUser(payload.sub);
      
      req.cryptoUser = {
        id: payload.sub,
        email: user.emailAddresses[0]?.emailAddress || '',
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
      };
      
      next();
    } catch (error: any) {
      console.error('Crypto auth error:', error.message);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
  
  // Pass-through middleware for calculator routes (kept for backward compatibility)
  const noAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      req.user = {
        id: 'open-access',
        email: 'user@open.access',
        firstName: 'Open',
        lastName: 'Access',
        claims: { sub: 'open-access' }
      };
    }
    next();
  };
  const isAuthenticated = noAuth;
  const optionalAuth = noAuth;
  const checkSubscription = noAuth;
  const checkExportAccess = noAuth;
  const requireEliteTier = requireCryptoAuth;
  
  console.log(`🔐 Auth mode: ${isProduction ? 'PRODUCTION (Clerk auth required)' : 'DEVELOPMENT (open access)'}`);
  
  
  // Import real subscription service
  const { cryptoSubscriptionService } = await import('./cryptoSubscriptionService');

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
      
      // Coinalyze API re-enabled
      const apiKey = process.env.COINALYZE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Coinalyze API not configured',
          message: 'COINALYZE_API_KEY environment variable required'
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
      
      // Fetch liquidation data - try Coinalyze first, fallback to CoinGlass
      const coinalyzeSymbol = `${binanceSymbol}_PERP.A`;
      const to = Math.floor(Date.now() / 1000);
      const from = to - (30 * 24 * 60 * 60);
      const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
      const coinglassApiKeyLiq = process.env.COINGLASS_API_KEY;
      
      let liquidations: any[] = [];
      let liquidationSource = 'none';
      
      // Try Coinalyze first
      if (coinalyzeApiKey) {
        try {
          const liqUrl = `https://api.coinalyze.net/v1/liquidation-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;
          const liqResponse = await fetch(liqUrl, {
            headers: { 'Accept': 'application/json', 'api_key': coinalyzeApiKey }
          });
          
          if (liqResponse.ok) {
            const liqData = await liqResponse.json();
            liquidations = liqData[0]?.history || [];
            if (liquidations.length > 0) {
              liquidationSource = 'coinalyze';
              console.log(`✅ Coinalyze liquidation data: ${liquidations.length} points`);
            }
          } else {
            console.log(`⚠️ Coinalyze API failed: ${liqResponse.status}, trying CoinGlass...`);
          }
        } catch (err) {
          console.log(`⚠️ Coinalyze error, trying CoinGlass...`);
        }
      }
      
      // Fallback to CoinGlass if Coinalyze failed or returned no data
      if (liquidations.length === 0 && coinglassApiKeyLiq) {
        try {
          const cgLiqUrl = `https://open-api-v4.coinglass.com/api/futures/liquidation/history?exchange=Binance&symbol=${binanceSymbol}&interval=4h&limit=180`;
          
          console.log(`📊 Fetching CoinGlass liquidation history for ${binanceSymbol}...`);
          
          const cgResponse = await fetch(cgLiqUrl, {
            headers: {
              'accept': 'application/json',
              'CG-API-KEY': coinglassApiKeyLiq
            }
          });
          
          if (cgResponse.ok) {
            const cgData = await cgResponse.json();
            if (cgData.code === '0' && cgData.data && cgData.data.length > 0) {
              liquidations = cgData.data.map((item: any) => ({
                t: item.time / 1000, // CoinGlass returns ms, convert to seconds
                l: parseFloat(item.long_liquidation_usd) || 0,
                s: parseFloat(item.short_liquidation_usd) || 0
              }));
              liquidationSource = 'coinglass';
              console.log(`✅ CoinGlass liquidation fallback: ${liquidations.length} points`);
            }
          }
        } catch (err) {
          console.log(`⚠️ CoinGlass liquidation fallback failed`);
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
      const _currentBand = Math.floor(currentPriceNormalized);
      
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
      topBands.forEach((bandIdx, _rank) => {
        const weight = bandDensity[bandIdx] * 0.3; // 30% of historical volume
        predictedColumn[bandIdx] += weight;
      });
      
      console.log(`✅ Predicted liquidation zones: ${topBands.length} historical + ${leverageLevels.length * 2} leverage-based`)
      
      // Generate orderbook-based column (32nd column) using CoinGlass aggregated bid/ask data
      const orderbookColumn: number[] = Array(NUM_PRICE_BANDS).fill(0);
      
      try {
        // CoinGlass API re-enabled
        const coinglassApiKey = process.env.COINGLASS_API_KEY;
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
              orderbookHistory.forEach((item: any, _idx: number) => {
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
                const _askRatio = asks / total; // > 0.5 = more sellers (resistance)
                
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

      // CoinGlass API re-enabled
      const apiKey = process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API not configured',
          message: 'COINGLASS_API_KEY environment variable required'
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
      // CoinGlass API re-enabled
      const apiKey = process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API not configured',
          message: 'COINGLASS_API_KEY environment variable required'
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
        const [timestamp, open, _high, _low, close, volume] = candle;
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

      const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
      const coinglassApiKey = process.env.COINGLASS_API_KEY;
      
      let historyData: any[] = [];
      let dataSource = 'none';

      // Try Coinalyze first
      if (coinalyzeApiKey) {
        try {
          const to = Math.floor(Date.now() / 1000);
          const from = to - (7 * 24 * 60 * 60); // Last 7 days
          const historyUrl = `https://api.coinalyze.net/v1/open-interest-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

          console.log(`📊 Fetching Coinalyze Open Interest History: ${coinalyzeSymbol}`);

          const response = await fetch(historyUrl, {
            headers: {
              'Accept': 'application/json',
              'api_key': coinalyzeApiKey
            }
          });

          if (response.ok) {
            const data = await response.json();
            historyData = data[0]?.history || [];
            if (historyData.length > 0) {
              dataSource = 'coinalyze-oi';
              console.log(`✅ Coinalyze OI data: ${historyData.length} points`);
            }
          } else {
            console.log(`⚠️ Coinalyze OI API failed: ${response.status}, trying CoinGlass...`);
          }
        } catch (err) {
          console.log(`⚠️ Coinalyze OI error, trying CoinGlass...`);
        }
      }

      // Fallback to CoinGlass if Coinalyze failed or returned no data
      if (historyData.length === 0 && coinglassApiKey) {
        try {
          // Hobbyist plan requires interval >= 4h, use 4h format (not h4)
          const cgInterval = '4h';
          const cgUrl = `https://open-api-v4.coinglass.com/api/futures/open-interest/history?exchange=Binance&symbol=${symbol}&interval=${cgInterval}&limit=42`;
          
          console.log(`📊 Fetching CoinGlass OI history for ${symbol}...`);
          
          const cgResponse = await fetch(cgUrl, {
            headers: {
              'accept': 'application/json',
              'CG-API-KEY': coinglassApiKey
            }
          });
          
          if (cgResponse.ok) {
            const cgData = await cgResponse.json();
            console.log(`📊 CoinGlass OI response: code=${cgData.code}, data count=${cgData.data?.length || 0}`);
            if (cgData.code === '0' && cgData.data && cgData.data.length > 0) {
              historyData = cgData.data.map((item: any) => ({
                t: (item.time || item.t) / 1000, // Convert ms to seconds
                o: parseFloat(item.open) || 0,
                h: parseFloat(item.high) || 0,
                l: parseFloat(item.low) || 0,
                c: parseFloat(item.close) || 0
              }));
              dataSource = 'coinglass-oi';
              console.log(`✅ CoinGlass OI fallback: ${historyData.length} points`);
            } else if (cgData.code !== '0') {
              console.log(`⚠️ CoinGlass OI error code: ${cgData.code}, msg: ${cgData.msg}`);
            }
          } else {
            const errText = await cgResponse.text();
            console.log(`⚠️ CoinGlass OI failed: ${cgResponse.status} - ${errText.substring(0, 200)}`);
          }
        } catch (err) {
          console.log(`⚠️ CoinGlass OI fallback failed`);
        }
      }

      // If no data from either source, return empty placeholder data
      if (historyData.length === 0) {
        console.log('⚠️ No OI data available from any source, returning placeholder');
        const placeholderResult = {
          symbol,
          source: 'unavailable',
          timestamp: Date.now(),
          current: { value: 0 },
          history: [],
          cached: false,
          message: 'Open Interest data temporarily unavailable'
        };
        return res.json(placeholderResult);
      }
      
      // Convert history to normalized format {timestamp, value}
      const newHistory = historyData.slice(-OI_HISTORY_SIZE).map((point: any) => ({
        timestamp: (point.t || point.time || point.timestamp) * 1000,
        value: point.c || point.v || point.oi || point.value || 0
      }));
      
      const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
      const currentRaw = historyData.length > 0 ? historyData[historyData.length - 1] : { value: currentValue };

      const result = {
        symbol,
        source: dataSource,
        timestamp: Date.now(),
        current: currentRaw,
        history: newHistory,
        cached: false
      };

      oiCache.set(cacheKey, { data: result, timestamp: Date.now(), history: newHistory });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Open Interest:', error);
      res.status(500).json({
        error: 'Failed to fetch Open Interest data',
        details: error.message
      });
    }
  });

  // Funding Rate endpoint with CoinGlass fallback
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

      const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
      const coinglassApiKey = process.env.COINGLASS_API_KEY;
      
      let historyData: any[] = [];
      let dataSource = 'none';

      // Try Coinalyze first
      if (coinalyzeApiKey) {
        try {
          const to = Math.floor(Date.now() / 1000);
          const from = to - (7 * 24 * 60 * 60); // Last 7 days
          const historyUrl = `https://api.coinalyze.net/v1/funding-rate-history?symbols=${coinalyzeSymbol}&interval=4hour&from=${from}&to=${to}`;

          console.log(`📊 Fetching Coinalyze Funding Rate History: ${coinalyzeSymbol}`);

          const response = await fetch(historyUrl, {
            headers: {
              'Accept': 'application/json',
              'api_key': coinalyzeApiKey
            }
          });

          if (response.ok) {
            const data = await response.json();
            historyData = data[0]?.history || [];
            if (historyData.length > 0) {
              dataSource = 'coinalyze-funding';
              console.log(`✅ Coinalyze Funding data: ${historyData.length} points`);
            }
          } else {
            console.log(`⚠️ Coinalyze Funding API failed: ${response.status}, trying CoinGlass...`);
          }
        } catch (err) {
          console.log(`⚠️ Coinalyze Funding error, trying CoinGlass...`);
        }
      }

      // Fallback to CoinGlass if Coinalyze failed or returned no data
      if (historyData.length === 0 && coinglassApiKey) {
        try {
          // CoinGlass exchange-list endpoint - symbol without USDT suffix
          const baseSymbol = symbol.replace('USDT', '');
          const cgUrl = `https://open-api-v4.coinglass.com/api/futures/funding-rate/exchange-list?symbol=${baseSymbol}`;
          
          console.log(`📊 Fetching CoinGlass Funding Rate for ${baseSymbol}...`);
          
          const cgResponse = await fetch(cgUrl, {
            headers: {
              'accept': 'application/json',
              'CG-API-KEY': coinglassApiKey
            }
          });
          
          if (cgResponse.ok) {
            const cgData = await cgResponse.json();
            console.log(`📊 CoinGlass Funding response: code=${cgData.code}, symbols=${cgData.data?.length || 0}`);
            if (cgData.code === '0' && cgData.data && cgData.data.length > 0) {
              // Response structure: data[0].stablecoin_margin_list contains exchanges
              const symbolData = cgData.data.find((s: any) => s.symbol === baseSymbol) || cgData.data[0];
              const marginList = symbolData?.stablecoin_margin_list || [];
              
              // Find Binance funding rate from stablecoin margin list
              const binanceData = marginList.find((ex: any) => ex.exchange === 'Binance');
              const exchangeData = binanceData || marginList[0];
              
              if (exchangeData) {
                const fundingRate = exchangeData.funding_rate || 0;
                const fundingTime = exchangeData.next_funding_time || Date.now();
                
                // Create synthetic history with current value
                historyData = [{
                  t: fundingTime / 1000,
                  c: fundingRate
                }, {
                  t: (fundingTime - 8 * 60 * 60 * 1000) / 1000, // 8 hours ago
                  c: fundingRate
                }];
                dataSource = 'coinglass-funding';
                console.log(`✅ CoinGlass Funding fallback: rate=${fundingRate}, source=${exchangeData.exchange}`);
              }
            } else if (cgData.code !== '0') {
              console.log(`⚠️ CoinGlass Funding error code: ${cgData.code}, msg: ${cgData.msg}`);
            }
          } else {
            const errText = await cgResponse.text();
            console.log(`⚠️ CoinGlass Funding failed: ${cgResponse.status} - ${errText.substring(0, 200)}`);
          }
        } catch (err) {
          console.log(`⚠️ CoinGlass Funding fallback failed`);
        }
      }

      // If no data from either source, return placeholder with default funding rate
      if (historyData.length === 0) {
        console.log('⚠️ No Funding data available from any source, returning placeholder');
        const placeholderResult = {
          symbol,
          source: 'unavailable',
          timestamp: Date.now(),
          current: { value: 0.01 }, // Default neutral funding rate
          history: [{ timestamp: Date.now(), value: 0.01 }],
          cached: false,
          message: 'Funding Rate data temporarily unavailable'
        };
        return res.json(placeholderResult);
      }
      
      // Convert history to normalized format {timestamp, value}
      const newHistory = historyData.slice(-FUNDING_HISTORY_SIZE).map((point: any) => ({
        timestamp: (point.t || point.time || point.timestamp) * 1000, // Convert to ms
        value: point.c || point.v || point.fr || point.fundingRate || point.value || 0
      }));
      
      // Get current value (last point in history)
      const currentValue = newHistory.length > 0 ? newHistory[newHistory.length - 1].value : 0;
      const currentRaw = historyData.length > 0 ? historyData[historyData.length - 1] : { value: currentValue };

      const result = {
        symbol,
        source: dataSource,
        timestamp: Date.now(),
        current: currentRaw,
        history: newHistory,
        cached: false
      };

      fundingCache.set(cacheKey, { data: result, timestamp: Date.now(), history: newHistory });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Funding Rate:', error);
      res.status(500).json({
        error: 'Failed to fetch Funding Rate data',
        details: error.message
      });
    }
  });

  // Long/Short Ratio endpoint with CoinGlass fallback
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

      const coinalyzeApiKey = process.env.COINALYZE_API_KEY;
      const coinglassApiKey = process.env.COINGLASS_API_KEY;
      
      let normalizedHistory: any[] = [];
      let dataSource = 'none';

      // Try Coinalyze first
      if (coinalyzeApiKey) {
        try {
          const coinalyzeInterval = interval === '15m' ? '15min' : interval === '1h' ? '1hour' : interval === '4h' ? '4hour' : interval;
          const to = Math.floor(Date.now() / 1000);
          const from = to - (7 * 24 * 60 * 60); // Last 7 days

          const url = `https://api.coinalyze.net/v1/long-short-ratio-history?symbols=${coinalyzeSymbol}&interval=${coinalyzeInterval}&from=${from}&to=${to}`;

          console.log(`📊 Fetching Coinalyze Long/Short Ratio: ${coinalyzeSymbol}, interval: ${coinalyzeInterval}`);

          const response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'api_key': coinalyzeApiKey
            }
          });

          if (response.ok) {
            const data = await response.json();
            const rawHistory = data[0]?.history || [];
            if (rawHistory.length > 0) {
              normalizedHistory = rawHistory.map((item: any) => ({
                timestamp: item.t * 1000,
                ratio: item.r,
                longPercent: item.l,
                shortPercent: item.s
              }));
              dataSource = 'coinalyze-ls-ratio';
              console.log(`✅ Coinalyze L/S Ratio data: ${normalizedHistory.length} points`);
            }
          } else {
            console.log(`⚠️ Coinalyze L/S Ratio API failed: ${response.status}, trying CoinGlass...`);
          }
        } catch (err) {
          console.log(`⚠️ Coinalyze L/S Ratio error, trying CoinGlass...`);
        }
      }

      // Fallback to CoinGlass global L/S account ratio history (requires exchange parameter)
      if (normalizedHistory.length === 0 && coinglassApiKey) {
        try {
          // CoinGlass global-long-short-account-ratio/history endpoint
          // Hobbyist plan: interval >= 4h required
          // Use full symbol format like OI endpoint (BTCUSDT not BTC)
          const cgLsUrl = `https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?exchange=Binance&symbol=${symbol}&interval=4h&limit=42`;
          
          console.log(`📊 Fetching CoinGlass Global L/S Ratio: ${cgLsUrl}`);
          
          const cgResponse = await fetch(cgLsUrl, {
            headers: {
              'accept': 'application/json',
              'CG-API-KEY': coinglassApiKey
            }
          });
          
          if (cgResponse.ok) {
            const cgData = await cgResponse.json();
            console.log(`📊 CoinGlass Global L/S response: code=${cgData.code}, msg=${cgData.msg}, data count=${cgData.data?.length || 0}`);
            if (cgData.data && cgData.data.length > 0) console.log(`📊 Sample L/S item:`, JSON.stringify(cgData.data[0]));
            if (cgData.code === '0' && cgData.data && cgData.data.length > 0) {
              // Response fields per docs: global_account_long_percent, global_account_short_percent, global_account_long_short_ratio
              normalizedHistory = cgData.data.map((item: any) => ({
                timestamp: item.time,
                ratio: parseFloat(item.global_account_long_short_ratio || item.longShortRatio || '1'),
                longPercent: parseFloat(item.global_account_long_percent || item.longAccount || '50'),
                shortPercent: parseFloat(item.global_account_short_percent || item.shortAccount || '50')
              }));
              dataSource = 'coinglass-global-ls-ratio';
              console.log(`✅ CoinGlass Global L/S Ratio: ${normalizedHistory.length} points, latest ratio: ${normalizedHistory[normalizedHistory.length - 1]?.ratio}`);
            } else if (cgData.code !== '0') {
              console.log(`⚠️ CoinGlass Global L/S Ratio error: code=${cgData.code}, msg=${cgData.msg}`);
            }
          } else {
            const errText = await cgResponse.text();
            console.log(`⚠️ CoinGlass Global L/S Ratio HTTP failed: ${cgResponse.status} - ${errText.substring(0, 300)}`);
          }
        } catch (err: any) {
          console.log(`⚠️ CoinGlass Global L/S Ratio exception: ${err.message}`);
        }
      }

      // If no data from either source, return placeholder
      if (normalizedHistory.length === 0) {
        console.log('⚠️ No L/S Ratio data available from any source, returning placeholder');
        const placeholderResult = {
          symbol,
          interval,
          source: 'unavailable',
          timestamp: Date.now(),
          history: [],
          current: { ratio: 1.0, longPercent: 50, shortPercent: 50 },
          cached: false,
          message: 'Long/Short Ratio data temporarily unavailable'
        };
        return res.json(placeholderResult);
      }

      const result = {
        symbol,
        interval,
        source: dataSource,
        timestamp: Date.now(),
        history: normalizedHistory,
        current: normalizedHistory[normalizedHistory.length - 1] || null,
        cached: false
      };

      lsRatioCache.set(cacheKey, { data: result, timestamp: Date.now() });
      res.json(result);

    } catch (error: any) {
      console.error('❌ Error fetching Long/Short Ratio:', error);
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

      // CoinGlass API re-enabled
      const apiKey = process.env.COINGLASS_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'CoinGlass API not configured',
          message: 'COINGLASS_API_KEY environment variable required'
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
        Object.entries(liquidationData.data.data).forEach(([_price, levelData]: [string, any]) => {
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
  app.post('/api/create-subscription', async (_req: any, res) => {
    res.json({ message: "All features are now free - no subscription needed" });
  });

  app.get('/api/subscription-status', async (_req: any, res) => {
    res.json({ tier: 'elite', status: 'active', message: "All features unlocked for free" });
  });

  app.post('/api/cancel-subscription', async (_req: any, res) => {
    res.json({ message: "All features are free - nothing to cancel" });
  });

  app.post('/api/refresh-subscription', async (_req: any, res) => {
    res.json({ tier: 'elite', status: 'active', message: "All features unlocked for free" });
  });

  app.post('/api/cleanup-customers', async (_req: any, res) => {
    res.json({ message: "Stripe cleanup not needed - all features free" });
  });

  app.post('/api/stripe-webhook', async (_req, res) => {
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
      const { ObjectStorageService, ObjectNotFoundError: _ObjectNotFoundError } = await import('./objectStorage');
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

  app.get("/api/feedback", async (_req, res) => {
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
        model: "grok-3",
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

  // Multi-Timeframe Analysis endpoint (15m, 1h, 4h in one call)
  app.post("/api/crypto/order-flow-alerts-multi-tf", requireCryptoAuth, async (req, res) => {
    console.log('📥 Multi-TF Order flow alerts endpoint called');
    try {
      const apiKeyCheck = checkXaiApiKey();
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false 
        });
      }

      const userId = (req as any).cryptoUser.id;
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const tier = subscription.tier;

      // Multi-TF is Elite only
      if (tier !== 'elite') {
        return res.status(403).json({ 
          error: 'Elite subscription required',
          message: 'Multi-Timeframe Analysis is an Elite-only feature. Please upgrade to Elite tier.',
          requireUpgrade: true
        });
      }

      // Use 2 credits for multi-TF (more comprehensive analysis)
      const creditResult = await cryptoSubscriptionService.useAICredit(userId);
      if (!creditResult.success) {
        return res.status(403).json({ 
          error: 'No AI credits remaining',
          message: 'You have used all your monthly AI credits.',
          creditsRemaining: 0
        });
      }

      const { symbol, timeframes = ['5m', '15m', '1h', '4h'] } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }

      console.log(`📊 Multi-TF Analysis for ${symbol}: ${timeframes.join(', ')}`);

      // Fetch data for all timeframes in parallel
      const fetchBarsForTF = async (tf: string) => {
        const url = `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=500`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${tf} data`);
        const data = await response.json();
        return data.map((k: any) => ({
          time: k[0] / 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      };

      const [bars5m, bars15m, bars1h, bars4h] = await Promise.all([
        fetchBarsForTF('5m'),
        fetchBarsForTF('15m'),
        fetchBarsForTF('1h'),
        fetchBarsForTF('4h')
      ]);

      // Helper to compute indicators for a given bars array
      const computeIndicators = (bars: any[]) => {
        const currentPrice = bars[bars.length - 1].close;
        const rsi = calculateRSI(bars, 14);
        const macd = calculateMACD(bars);
        const stoch = calculateStochastic(bars, 14, 3);
        const atr = calculateATR(bars, 14);
        const adx = calculateADX(bars);
        const bb = calculateBollingerBands(bars, 20, 2);
        const vwapCalc = calculateVWAP(bars);
        const obv = calculateOBV(bars);
        const boschoch = detectBOSCHoCH(bars);
        
        // Recent swing points
        const swings = bars.slice(-50).map((b, i, arr) => {
          const isHigh = i > 1 && i < arr.length - 2 && b.high > arr[i-1].high && b.high > arr[i-2].high && b.high > arr[i+1].high && b.high > arr[i+2].high;
          const isLow = i > 1 && i < arr.length - 2 && b.low < arr[i-1].low && b.low < arr[i-2].low && b.low < arr[i+1].low && b.low < arr[i+2].low;
          return { time: b.time, high: isHigh ? b.high : null, low: isLow ? b.low : null };
        }).filter(s => s.high || s.low);

        const recentHigh = Math.max(...bars.slice(-20).map(b => b.high));
        const recentLow = Math.min(...bars.slice(-20).map(b => b.low));

        return {
          currentPrice,
          rsi: rsi.toFixed(2),
          macd: { histogram: macd.histogram.toFixed(4), crossover: macd.crossover },
          stoch: { k: stoch.k.toFixed(2), d: stoch.d.toFixed(2), crossover: stoch.crossover },
          atr: atr.toFixed(6),
          adx: adx.toFixed(2),
          bb: { middle: bb.middle.toFixed(4), squeeze: bb.squeeze, bandwidth: (bb.bandwidth * 100).toFixed(2) },
          vwap: vwapCalc.vwap.toFixed(4),
          obv: (obv.obv / 1000000).toFixed(2) + 'M',
          bos: boschoch.bos,
          choch: boschoch.choch,
          recentHigh: recentHigh.toFixed(4),
          recentLow: recentLow.toFixed(4),
          swings: swings.slice(-5)
        };
      };

      const data5m = computeIndicators(bars5m);
      const data15m = computeIndicators(bars15m);
      const data1h = computeIndicators(bars1h);
      const data4h = computeIndicators(bars4h);

      // Build multi-TF prompt for Grok
      const prompt = `Symbol: ${symbol} | Multi-Timeframe Analysis (5m, 15m, 1h, 4h)
You are analyzing this asset across 4 timeframes to find trades with cross-timeframe confluence.

**5-Minute Data (Scalp/Entry timing, 15min-1h trades):**
- Price: $${data5m.currentPrice}, RSI: ${data5m.rsi}, MACD Histogram: ${data5m.macd.histogram}${data5m.macd.crossover !== 'none' ? ` (${data5m.macd.crossover})` : ''}
- Stochastic: %K ${data5m.stoch.k}, %D ${data5m.stoch.d}${data5m.stoch.crossover !== 'none' ? ` (${data5m.stoch.crossover})` : ''}
- ADX: ${data5m.adx}, ATR: ${data5m.atr}, BB Squeeze: ${data5m.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data5m.vwap}, OBV: ${data5m.obv}
- Structure: ${data5m.bos} BOS, ${data5m.choch} CHoCH
- Range: High $${data5m.recentHigh}, Low $${data5m.recentLow}

**15-Minute Data (Short-term, 1-4h trades):**
- Price: $${data15m.currentPrice}, RSI: ${data15m.rsi}, MACD Histogram: ${data15m.macd.histogram}${data15m.macd.crossover !== 'none' ? ` (${data15m.macd.crossover})` : ''}
- Stochastic: %K ${data15m.stoch.k}, %D ${data15m.stoch.d}${data15m.stoch.crossover !== 'none' ? ` (${data15m.stoch.crossover})` : ''}
- ADX: ${data15m.adx}, ATR: ${data15m.atr}, BB Squeeze: ${data15m.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data15m.vwap}, OBV: ${data15m.obv}
- Structure: ${data15m.bos} BOS, ${data15m.choch} CHoCH
- Range: High $${data15m.recentHigh}, Low $${data15m.recentLow}

**1-Hour Data (Medium-term, 4h-1d trades):**
- Price: $${data1h.currentPrice}, RSI: ${data1h.rsi}, MACD Histogram: ${data1h.macd.histogram}${data1h.macd.crossover !== 'none' ? ` (${data1h.macd.crossover})` : ''}
- Stochastic: %K ${data1h.stoch.k}, %D ${data1h.stoch.d}${data1h.stoch.crossover !== 'none' ? ` (${data1h.stoch.crossover})` : ''}
- ADX: ${data1h.adx}, ATR: ${data1h.atr}, BB Squeeze: ${data1h.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data1h.vwap}, OBV: ${data1h.obv}
- Structure: ${data1h.bos} BOS, ${data1h.choch} CHoCH
- Range: High $${data1h.recentHigh}, Low $${data1h.recentLow}

**4-Hour Data (Long-term, 1-3d trades):**
- Price: $${data4h.currentPrice}, RSI: ${data4h.rsi}, MACD Histogram: ${data4h.macd.histogram}${data4h.macd.crossover !== 'none' ? ` (${data4h.macd.crossover})` : ''}
- Stochastic: %K ${data4h.stoch.k}, %D ${data4h.stoch.d}${data4h.stoch.crossover !== 'none' ? ` (${data4h.stoch.crossover})` : ''}
- ADX: ${data4h.adx}, ATR: ${data4h.atr}, BB Squeeze: ${data4h.bb.squeeze ? 'YES' : 'No'}
- VWAP: $${data4h.vwap}, OBV: ${data4h.obv}
- Structure: ${data4h.bos} BOS, ${data4h.choch} CHoCH
- Range: High $${data4h.recentHigh}, Low $${data4h.recentLow}

**Your Task:**
1. Provide a 2-sentence summary for EACH timeframe's bias and key observation.
2. Provide a 2-sentence overall cross-TF summary with alignment assessment.
3. Identify 1-3 best trades that have CROSS-TIMEFRAME CONFLUENCE (higher TF sets bias, lower TF for timing).
4. Grade each trade A+ to C based on confluence strength.

Respond with ONLY valid JSON in this exact format:
{
  "multiTFInsights": {
    "5m": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "15m": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "1h": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "4h": { "summary": "2 sentences", "bias": "BULLISH/BEARISH/NEUTRAL", "keyLevels": ["$X", "$Y"] },
    "overallSummary": "2 sentences on cross-TF alignment and dominant trend"
  },
  "bestTrades": [
    {
      "grade": "A+/A/B/C",
      "primaryTF": "15m/1h/4h",
      "direction": "LONG/SHORT",
      "entry": "price",
      "stopLoss": "price",
      "targets": ["TP1", "TP2"],
      "confluenceSignals": ["4-6 signals with TF prefix, e.g., '4h bullish bias + 1h RSI oversold + 15m stoch crossover'"],
      "reasoning": "1 sentence explaining cross-TF logic"
    }
  ]
}`;

      console.log('🤖 Calling xAI Grok for multi-TF analysis...');
      const startTime = Date.now();

      const response = await xai.chat.completions.create({
        model: "grok-3",
        messages: [
          {
            role: "system",
            content: "You are a professional crypto trader expert in multi-timeframe analysis. Higher timeframes set the bias, lower timeframes provide entry timing. Always respond with valid JSON only."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });

      const duration = Date.now() - startTime;
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

      console.log(`✅ Multi-TF analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);
      console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out`);

      let parsedResult;
      try {
        let content = response.choices[0].message.content || '{}';
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsedResult = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse Grok response:', parseError);
        parsedResult = { multiTFInsights: null, bestTrades: [] };
      }

      // Save Multi-TF analysis to cache
      try {
        await cryptoSubscriptionService.saveCachedMultiTFAnalysis(
          userId,
          symbol,
          parsedResult.multiTFInsights,
          parsedResult.bestTrades || [],
          parsedResult.confluence || ''
        );
        console.log('💾 Multi-TF analysis cached for', symbol);
      } catch (cacheError) {
        console.error('Failed to cache multi-TF analysis:', cacheError);
      }

      res.json({
        success: true,
        multiTFInsights: parsedResult.multiTFInsights,
        bestTrades: parsedResult.bestTrades || [],
        cost: estimatedCost,
        tokens: { input: inputTokens, output: outputTokens },
        creditsRemaining: creditResult.remaining
      });

    } catch (error: any) {
      console.error('❌ Multi-TF analysis error:', error);
      res.status(500).json({ 
        error: error.message,
        success: false
      });
    }
  });

  // Order Flow Alerts endpoint using xAI Grok (publicly accessible)
  app.post("/api/crypto/order-flow-alerts", requireCryptoAuth, async (req, res) => {
    console.log('📥 Order flow alerts endpoint called');
    try {
      // Check if XAI API key is configured
      const apiKeyCheck = checkXaiApiKey();
      console.log('🔑 XAI API key check:', apiKeyCheck);
      if (!apiKeyCheck.configured) {
        return res.status(503).json({ 
          error: apiKeyCheck.error,
          available: false,
          alerts: [] // Return empty alerts array for graceful degradation
        });
      }

      const userId = (req as any).cryptoUser.id;
      console.log('👤 User ID:', userId);

      // Check tier access and apply appropriate limits
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const tier = subscription.tier;
      
      // Track usage status for response
      let usageStatus = { used: 0, limit: 0, remainingToday: 0, creditsRemaining: subscription.aiCredits || 0 };
      
      // Free/Beginner tiers cannot use AI
      if (tier === 'free' || tier === 'beginner') {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Please upgrade to Intermediate tier or higher to access AI Trade Analysis',
          requiredTier: 'intermediate',
          alerts: []
        });
      }

      // All tiers use monthly credits now
      const creditResult = await cryptoSubscriptionService.useAICredit(userId);
      if (!creditResult.success) {
        return res.status(403).json({ 
          error: 'No AI credits remaining',
          message: 'You have used all your monthly AI credits. Credits reset monthly.',
          creditsRemaining: 0,
          creditsLimit: creditResult.limit,
          alerts: []
        });
      }
      usageStatus.creditsRemaining = creditResult.remaining;

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

      // ===== CALCULATE ALL INDICATORS FROM BAR DATA =====
      const bars = recentBars.slice(-100) as CandleBar[];
      const lastBar = bars[bars.length - 1];
      const priceChange = ((currentPrice - bars[0].close) / bars[0].close) * 100;
      
      // Swing points
      const swings = detectSwingPoints(bars);
      const swingHighsStr = swings.swingHighs.slice(-3).map(s => `$${s.price.toFixed(4)} (bar ${s.bar})`).join(', ') || 'none';
      const swingLowsStr = swings.swingLows.slice(-3).map(s => `$${s.price.toFixed(4)} (bar ${s.bar})`).join(', ') || 'none';
      
      // Oscillators & Momentum
      const rsi = calculateRSI(bars, 14);
      const rsiLabel = rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : rsi > 50 ? 'bullish zone' : 'bearish zone';
      
      const macd = calculateMACD(bars);
      const macdMomentum = macd.histogram > 0 ? 'bullish' : 'bearish';
      
      const stoch = calculateStochastic(bars, 14, 3);
      const stochLabel = stoch.k > 80 ? 'overbought' : stoch.k < 20 ? 'oversold' : 'neutral';
      
      const mfi = calculateMFI(bars, 14);
      const mfiLabel = mfi.mfi > 80 ? 'overbought' : mfi.mfi < 20 ? 'oversold' : 'neutral';
      
      const cmf = calculateCMF(bars, 20);
      
      // Trend & Volatility
      const atr = calculateATR(bars, 14);
      const bb = calculateBollingerBands(bars, 20, 2);
      const vwapCalc = calculateVWAP(bars);
      
      // Volume & Order Flow
      const obv = calculateOBV(bars);
      
      // SMC/ICT Structure
      const boschoch = detectBOSCHoCH(bars);
      const displacement = detectDisplacement(bars);
      
      // Recent high/low
      const recentHigh = Math.max(...bars.slice(-10).map(b => b.high));
      const recentLow = Math.min(...bars.slice(-10).map(b => b.low));

      // Analyze professional orderflow data (OI, Funding, L/S Ratio)
      let oiTrend = 'N/A', oiDelta = 0, fundingValue = 0, fundingBias = 'neutral', lsRatio = 1.0;
      if (orderflowData) {
        // OI: compute delta/trend from history array
        if (orderflowData.openInterest?.history?.length > 1) {
          const oiHistory = orderflowData.openInterest.history;
          const latestOI = oiHistory[oiHistory.length - 1]?.value || 0;
          const prevOI = oiHistory[Math.max(0, oiHistory.length - 6)]?.value || latestOI; // Compare to ~24h ago
          if (prevOI > 0) {
            oiDelta = ((latestOI - prevOI) / prevOI) * 100;
            oiTrend = oiDelta > 0.5 ? 'rising' : oiDelta < -0.5 ? 'falling' : 'neutral';
          }
        }
        // Funding: extract from history or current
        if (orderflowData.fundingRate?.history?.length > 0) {
          const fundHistory = orderflowData.fundingRate.history;
          fundingValue = fundHistory[fundHistory.length - 1]?.value || 0;
          fundingBias = fundingValue > 0.01 ? 'bullish (longs pay)' : fundingValue < -0.01 ? 'bearish (shorts pay)' : 'neutral';
        }
        // L/S Ratio: extract from current object
        if (orderflowData.longShortRatio?.current?.ratio !== undefined) {
          lsRatio = orderflowData.longShortRatio.current.ratio;
        } else if (orderflowData.longShortRatio?.history?.length > 0) {
          const lsHistory = orderflowData.longShortRatio.history;
          lsRatio = lsHistory[lsHistory.length - 1]?.ratio || 1.0;
        }
      }
      
      // Calculate expected trade duration based on timeframe
      const timeframeDurations: Record<string, string> = {
        '1m': '15-60 minutes',
        '5m': '1-4 hours',
        '15m': '4-12 hours',
        '1h': '1-3 days',
        '4h': '3-10 days',
        '1d': '1-4 weeks',
        '1w': '1-3 months',
        '1M': '3-12 months'
      };
      const expectedDuration = timeframeDurations[interval] || '1-7 days';
      
      // ===== BUILD REFINED PROMPT =====
      const prompt = `Symbol: ${symbol} | Timeframe: ${interval} | Duration: ${expectedDuration}
SL/TP: Use 1-2x ATR for SL; targets at 1:1 to 1:3 R/R aligned with key levels.

**Current Market Data:**
- Price: $${currentPrice.toFixed(4)}
- OHLC (last bar): O $${lastBar.open.toFixed(4)}, H $${lastBar.high.toFixed(4)}, L $${lastBar.low.toFixed(4)}, C $${lastBar.close.toFixed(4)}
- 50-bar Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%
- Swing Highs: ${swingHighsStr}
- Swing Lows: ${swingLowsStr}
- Volume Profile: POC $${poc.toFixed(4)}, VAH $${vah.toFixed(4)}, VAL $${val.toFixed(4)}
- CVD: ${cvd.toFixed(0)} (${cvdTrend})
- OBV: ${(obv.obv / 1000000).toFixed(2)}M${obv.divergence !== 'none' ? ` (${obv.divergence} divergence)` : ''}

**Oscillators & Momentum:**
- RSI (14): ${rsi.toFixed(2)} (${rsiLabel})
- MACD (12,26,9): Histogram ${macd.histogram.toFixed(6)}, ${macdMomentum} momentum${macd.crossover !== 'none' ? `, ${macd.crossover} crossover` : ''}${macd.divergence !== 'none' ? `, ${macd.divergence} divergence` : ''}
- CCI (20): ${cci.toFixed(2)} ${cci > 100 ? '(OVERBOUGHT)' : cci < -100 ? '(OVERSOLD)' : '(neutral)'}
- Stochastic (14,3,3): %K ${stoch.k.toFixed(2)}, %D ${stoch.d.toFixed(2)} (${stochLabel})${stoch.crossover !== 'none' ? `, ${stoch.crossover} crossover` : ''}
- MFI (14): ${mfi.mfi.toFixed(2)} (${mfiLabel})${mfi.divergence !== 'none' ? `, ${mfi.divergence}` : ''}
- CMF: ${cmf.cmf > 0 ? '+' : ''}${cmf.cmf.toFixed(3)} (${cmf.label})

**Trend & Volatility:**
- ADX (14): ${adx.toFixed(2)} (${adx > 25 ? 'STRONG TREND' : adx < 20 ? 'weak' : 'moderate'})
- +DI/-DI: ${plusDI.toFixed(2)}/${minusDI.toFixed(2)} (${plusDI > minusDI ? 'bullish' : 'bearish'} momentum)
- ATR (14): ${atr.toFixed(6)}
- Bollinger (20,2): Middle $${bb.middle.toFixed(4)}${bb.squeeze ? ', SQUEEZE' : ''}, Bandwidth ${(bb.bandwidth * 100).toFixed(2)}%
- VWAP: $${vwapCalc.vwap.toFixed(4)} (price in ${vwapCalc.label})

**Order Flow & SMC/ICT:**
- Bullish OBs: ${bullishOBCount || 0}${bullishOB?.length ? ` (nearest $${bullishOB[bullishOB.length - 1]?.price?.toFixed(4)})` : ''}
- Bearish OBs: ${bearishOBCount || 0}${bearishOB?.length ? ` (nearest $${bearishOB[bearishOB.length - 1]?.price?.toFixed(4)})` : ''}
- Bullish FVGs: ${bullFVGCount || 0}${bullFVG?.length ? ` ($${bullFVG[bullFVG.length - 1]?.low?.toFixed(4)}-$${bullFVG[bullFVG.length - 1]?.high?.toFixed(4)})` : ''}
- Bearish FVGs: ${bearFVGCount || 0}${bearFVG?.length ? ` ($${bearFVG[bearFVG.length - 1]?.low?.toFixed(4)}-$${bearFVG[bearFVG.length - 1]?.high?.toFixed(4)})` : ''}
- Absorption: ${absorptionCount || 0}${absorption?.length ? ` (${absorption[absorption.length - 1]?.type} at $${absorption[absorption.length - 1]?.price?.toFixed(4)})` : ''}
- Volume Imbalances: Buy ${buyImbalancesCount || 0}, Sell ${sellImbalancesCount || 0}
- BOS: ${boschoch.bos} | CHoCH: ${boschoch.choch}
- Displacement: ${displacement.displacement ? `YES (${displacement.direction})` : 'none'}
- Liquidity Grabs: ${liquidityGrabCount || 0}${liquidityGrabs?.length ? ` (${liquidityGrabs[liquidityGrabs.length - 1]?.type} at $${liquidityGrabs[liquidityGrabs.length - 1]?.price?.toFixed(4)})` : ''}

**Institutional Sentiment:**
- Open Interest: ${oiTrend !== 'N/A' ? `${oiTrend.toUpperCase()} (${oiDelta > 0 ? '+' : ''}${oiDelta.toFixed(2)}% delta)` : 'N/A'}
- Funding Rate: ${fundingValue.toFixed(4)}% (${fundingBias})
- Long/Short Ratio: ${lsRatio.toFixed(2)} (${lsRatio > 1.2 ? 'longs dominant' : lsRatio < 0.8 ? 'shorts dominant' : 'balanced'})

**TASK:**
Find 1-3 trades with min 4 confluence factors, R/R ≥0.75. Grade: A+ (8+), A (7), B (5-6), C (3-4), D (2), E (1).
Use ATR for SL sizing. List 4-6 confluence signals per trade. Be concise.

**JSON Output:**
{
  "marketInsights": {
    "summary": "Exactly 2 sentences: bias + key setup.",
    "bias": "BULLISH|BEARISH|NEUTRAL",
    "keyLevels": ["POC: $X", "VAL: $Y", "Swing High: $Z"]
  },
  "alerts": [
    {
      "grade": "A+|A|B|C|D|E",
      "direction": "LONG|SHORT",
      "entry": 1.2345,
      "stopLoss": 1.2300,
      "targets": [1.2400, 1.2500],
      "confluenceSignals": ["Bullish FVG at $1.23", "RSI oversold bounce", "CVD rising", "OB support"],
      "confluenceCount": 6,
      "reasoning": "Exactly 1 sentence explaining the trade."
    }
  ]
}`;

      console.log('🤖 Calling xAI Grok for order flow analysis...');
      const startTime = Date.now();
      
      const response = await xai.chat.completions.create({
        model: "grok-3",
        messages: [
          {
            role: "system",
            content: "You are a professional crypto trader specializing in SMC/ICT, technical analysis, order flow, and institutional sentiment. Return ONLY valid JSON. summary=2 sentences, reasoning=1 sentence per trade. No data dumps. Be concise."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
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

      // Post-processing: Filter and deduplicate trades
      if (result.alerts && Array.isArray(result.alerts) && result.alerts.length > 0) {
        const originalCount = result.alerts.length;
        
        // 1. Calculate R/R and filter out trades with R/R <= 0.75
        result.alerts = result.alerts.filter((alert: any) => {
          // Parse entry - handle range format (e.g., "1.9875-1.9901")
          const entryStr = String(alert.entry || '0');
          const entryParts = entryStr.split('-').map((s: string) => parseFloat(s.trim()));
          const entry = entryParts.length > 1 ? (entryParts[0] + entryParts[1]) / 2 : entryParts[0];
          
          const stopLoss = parseFloat(String(alert.stopLoss || '0'));
          const firstTarget = parseFloat(String(alert.targets?.[0] || '0'));
          
          if (!entry || !stopLoss || !firstTarget || isNaN(entry) || isNaN(stopLoss) || isNaN(firstTarget)) {
            console.log(`⚠️ Filtering trade: invalid prices (entry=${entry}, sl=${stopLoss}, tp=${firstTarget})`);
            return false;
          }
          
          const risk = alert.direction === 'LONG' ? entry - stopLoss : stopLoss - entry;
          const reward = alert.direction === 'LONG' ? firstTarget - entry : entry - firstTarget;
          const rrRatio = risk > 0 ? reward / risk : 0;
          
          // Attach calculated R/R to the alert for frontend display
          alert.calculatedRR = rrRatio;
          
          if (rrRatio < 0.75) {
            console.log(`⚠️ Filtering trade: R/R too low (${rrRatio.toFixed(2)}:1)`);
            return false;
          }
          return true;
        });
        
        // 2. Deduplicate similar trades (same direction, entries within 1%)
        if (result.alerts.length > 1) {
          const dedupedAlerts: any[] = [];
          for (const alert of result.alerts) {
            const entryStr = String(alert.entry || '0');
            const entryParts = entryStr.split('-').map((s: string) => parseFloat(s.trim()));
            const entry = entryParts.length > 1 ? (entryParts[0] + entryParts[1]) / 2 : entryParts[0];
            
            // Check if similar trade already exists
            const similar = dedupedAlerts.find((existing: any) => {
              if (existing.direction !== alert.direction) return false;
              const existingEntryStr = String(existing.entry || '0');
              const existingEntryParts = existingEntryStr.split('-').map((s: string) => parseFloat(s.trim()));
              const existingEntry = existingEntryParts.length > 1 ? (existingEntryParts[0] + existingEntryParts[1]) / 2 : existingEntryParts[0];
              const priceDiff = Math.abs(entry - existingEntry) / existingEntry;
              return priceDiff < 0.01; // Within 1%
            });
            
            if (similar) {
              // Keep the higher grade / higher R/R trade
              const gradeOrder = ['A+', 'A', 'B', 'C', 'D', 'E'];
              const alertGradeIdx = gradeOrder.indexOf(alert.grade);
              const similarGradeIdx = gradeOrder.indexOf(similar.grade);
              if (alertGradeIdx < similarGradeIdx || (alertGradeIdx === similarGradeIdx && (alert.calculatedRR || 0) > (similar.calculatedRR || 0))) {
                // Replace with better trade
                const idx = dedupedAlerts.indexOf(similar);
                dedupedAlerts[idx] = alert;
                console.log(`🔄 Replacing duplicate trade with higher quality version`);
              } else {
                console.log(`⚠️ Filtering duplicate trade (same direction, similar entry)`);
              }
            } else {
              dedupedAlerts.push(alert);
            }
          }
          result.alerts = dedupedAlerts;
        }
        
        const filteredCount = originalCount - result.alerts.length;
        if (filteredCount > 0) {
          console.log(`🔍 Filtered ${filteredCount} trades (low R/R or duplicates)`);
        }
        
        // 3. If all trades were filtered, set noTradesReason
        if (result.alerts.length === 0 && originalCount > 0) {
          result.marketInsights = result.marketInsights || {};
          result.marketInsights.noTradesReason = result.marketInsights.noTradesReason || 
            `${originalCount} potential setup(s) were identified but filtered out due to insufficient Risk/Reward ratio (below 0.75:1) or being duplicate entries. Wait for better market conditions with clearer structure.`;
        }
      }

      // Estimate cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const estimatedCost = (inputTokens / 1_000_000 * 2) + (outputTokens / 1_000_000 * 10);

      console.log(`✅ xAI order flow analysis complete (${duration}ms, ~$${estimatedCost.toFixed(6)})`);
      console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out`);
      console.log(`🎯 Alerts generated: ${result.alerts?.length || 0}`);

      // Build indicatorData object for caching
      const indicatorDataForCache = {
        // Market Data
        price: currentPrice,
        lastBar: { open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close },
        priceChange,
        swingHighs: swings.swingHighs.slice(-3),
        swingLows: swings.swingLows.slice(-3),
        volumeProfile: { poc, vah, val },
        cvd: { value: cvd, trend: cvdTrend },
        obv: { value: obv.obv, divergence: obv.divergence },
        // Oscillators & Momentum
        rsi: { value: rsi, label: rsiLabel },
        macd: { histogram: macd.histogram, crossover: macd.crossover, divergence: macd.divergence, momentum: macdMomentum },
        cci: { value: cci, label: cci > 100 ? 'OVERBOUGHT' : cci < -100 ? 'OVERSOLD' : 'neutral' },
        stochastic: { k: stoch.k, d: stoch.d, crossover: stoch.crossover, label: stochLabel },
        mfi: { value: mfi.mfi, label: mfiLabel, divergence: mfi.divergence },
        cmf: { value: cmf.cmf, label: cmf.label },
        // Trend & Volatility
        adx: { value: adx, label: adx > 25 ? 'STRONG TREND' : adx < 20 ? 'weak' : 'moderate' },
        diPlusMinus: { plusDI, minusDI, momentum: plusDI > minusDI ? 'bullish' : 'bearish' },
        atr: { value: atr },
        bollingerBands: { middle: bb.middle, upper: bb.upper, lower: bb.lower, bandwidth: bb.bandwidth, squeeze: bb.squeeze },
        vwap: { value: vwapCalc.vwap, label: vwapCalc.label },
        // SMC/ICT Structure
        bos: boschoch.bos,
        choch: boschoch.choch,
        displacement: { active: displacement.displacement, direction: displacement.direction },
        // Orderflow Counts
        orderBlocks: { bullish: bullishOBCount || 0, bearish: bearishOBCount || 0 },
        fvgs: { bullish: bullFVGCount || 0, bearish: bearFVGCount || 0 },
        imbalances: { buy: buyImbalancesCount || 0, sell: sellImbalancesCount || 0 },
        absorption: absorptionCount || 0,
        liquidityGrabs: liquidityGrabCount || 0,
        // Institutional
        openInterest: { trend: oiTrend, delta: oiDelta },
        fundingRate: { value: fundingValue, bias: fundingBias },
        longShortRatio: { value: lsRatio, label: lsRatio > 1.2 ? 'longs dominant' : lsRatio < 0.8 ? 'shorts dominant' : 'balanced' }
      };

      // Save analysis to cache for later retrieval
      try {
        await cryptoSubscriptionService.saveAiAnalysis(
          userId,
          symbol,
          interval,
          result.alerts || [],
          result.marketInsights || null,
          indicatorDataForCache
        );
        console.log(`💾 AI analysis cached for ${symbol}/${interval}`);
      } catch (cacheError) {
        console.error('Failed to cache AI analysis:', cacheError);
      }

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
        },
        tier,
        dailyUsed: usageStatus.used,
        dailyLimit: usageStatus.limit,
        remainingToday: usageStatus.remainingToday,
        creditsRemaining: usageStatus.creditsRemaining,
        indicatorData: indicatorDataForCache
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
    const { inArray, eq: _eq } = await import("drizzle-orm");

    // Get all push subscriptions from database
    const allSubscriptions = await db.select().from(pushSubscriptions);

    if (allSubscriptions.length === 0) {
      console.log('📭 No push subscriptions to send to');
      return;
    }

    const webpush = await import('web-push');
    
    // VAPID keys re-enabled for push notifications
    const publicVapid = process.env.VAPID_PUBLIC_KEY;
    const privateVapid = process.env.VAPID_PRIVATE_KEY;
    
    if (!publicVapid || !privateVapid) {
      console.log('📭 Push notifications require VAPID keys - VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
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

  // === Test Push Notification Endpoint ===
  app.post("/api/crypto/test-push", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      console.log(`🧪 Sending test push notification for crypto user: ${userId}`);
      
      // Get user's subscription to check for pushSubscription in cryptoSubscriptions table
      const userSubscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const pushSubData = userSubscription?.pushSubscription;
      
      if (!pushSubData) {
        console.log(`❌ No push subscription found for crypto user ${userId}`);
        return res.status(400).json({ 
          error: 'No push subscription found. Please enable notifications first.',
          message: 'Click the bell icon and allow notifications, then try again.' 
        });
      }
      
      // Parse the subscription if it's a string
      const subscriptions = [{ 
        id: 'crypto-sub', 
        subscription: typeof pushSubData === 'string' ? pushSubData : JSON.stringify(pushSubData) 
      }];
      
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      
      if (!publicKey || !privateKey) {
        console.log("❌ VAPID keys not configured (VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)");
        return res.status(500).json({ error: 'Push notifications not configured on server' });
      }
      
      webpush.default.setVapidDetails('mailto:support@beartec.uk', publicKey, privateKey);
      
      const payload = JSON.stringify({
        title: '🔔 Test Notification',
        body: 'Push notifications are working! Your price alerts are active.',
        tag: 'test-push',
        icon: '/icon.png',
        badge: '/badge.png',
      });
      
      let successCount = 0;
      let failCount = 0;
      
      for (const sub of subscriptions) {
        try {
          const parsedSub = typeof sub.subscription === 'string' 
            ? JSON.parse(sub.subscription) 
            : sub.subscription;
          
          await webpush.default.sendNotification(parsedSub, payload);
          successCount++;
          console.log(`✅ Test push sent to subscription ${sub.id}`);
        } catch (error: any) {
          failCount++;
          console.error(`❌ Failed to send test push to subscription ${sub.id}:`, error.message);
        }
      }
      
      res.json({ 
        success: successCount > 0, 
        message: `Test notification sent to ${successCount} device(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        subscriptionsFound: subscriptions.length,
        successCount,
        failCount
      });
    } catch (error: any) {
      console.error('❌ Error sending test notification:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // === Crypto Bootstrap Endpoint ===
  
  // Bootstrap user account on first login - creates free tier subscription if not exists
  app.post("/api/crypto/bootstrap", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const userEmail = (req as any).cryptoUser.email;

      console.log(`🚀 Bootstrapping user: ${userEmail} (${userId})`);

      // getUserSubscription auto-creates a free tier subscription if user doesn't exist
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId, userEmail);
      
      console.log(`✅ User bootstrapped: ${userEmail} - tier: ${subscription.tier}`);
      return res.json({ 
        success: true, 
        message: 'Account ready',
        tier: subscription.tier,
        userId: userId
      });
    } catch (error: any) {
      console.error('❌ Error bootstrapping user:', error);
      res.status(500).json({ error: error.message });
    }
  });

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

  // Get current user's subscription tier, credits, stats, and capabilities
  app.get("/api/crypto/my-subscription", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const userEmail = (req as any).cryptoUser.email;

      console.log(`📊 Subscription check for ${userEmail} (${userId})`);

      // ADMIN OVERRIDE: beartec@beartec.uk is always elite without Stripe check
      if (userEmail === 'beartec@beartec.uk') {
        return res.json({
          tier: 'elite',
          status: 'active',
          hasElliottAddon: true,
          canUseElliott: true,
          canUseAI: true,
          hasUnlimitedAI: true,
          aiCredits: 999999,
          isAdmin: true,
          monthlyUsage: {
            aiCredits: 0,
            aiLimit: 999999,
            elliottCredits: 0,
            elliottLimit: 999999,
          }
        });
      }

      await cryptoSubscriptionService.resetMonthlyCredits(userId);
      await cryptoSubscriptionService.resetElliottMonthlyCredits(userId);
      const stats = await cryptoSubscriptionService.getSubscriptionStats(userId);
      const capabilities = await cryptoSubscriptionService.getCapabilities(userId);
      const monthlyUsage = await cryptoSubscriptionService.getMonthlyUsageStatus(userId);
      
      res.json({ ...stats, ...capabilities, monthlyUsage });
    } catch (error: any) {
      console.error('❌ Error fetching crypto subscription stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get cached AI analysis (without using credits)
  app.get("/api/crypto/ai-analysis/cached", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { symbol, interval } = req.query;

      if (!symbol || !interval) {
        return res.status(400).json({ error: 'Missing required query params: symbol, interval' });
      }

      const cached = await cryptoSubscriptionService.getCachedAnalysis(
        userId,
        symbol as string,
        interval as string
      );

      res.json({ cached });
    } catch (error: any) {
      console.error('Error fetching cached AI analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get cached Multi-TF analysis (without using credits)
  app.get("/api/crypto/ai-analysis/cached-multi-tf", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { symbol } = req.query;

      if (!symbol) {
        return res.status(400).json({ error: 'Missing required query param: symbol' });
      }

      const cached = await cryptoSubscriptionService.getCachedMultiTFAnalysis(
        userId,
        symbol as string
      );

      res.json({ cached });
    } catch (error: any) {
      console.error('Error fetching cached Multi-TF analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Market Review (Intermediate+ tier)
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

      const hasAccess = await cryptoSubscriptionService.checkTierAccess(userId, 'intermediate');
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Please upgrade to Intermediate tier or higher to access AI Market Review',
          requiredTier: 'intermediate'
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
        model: "grok-3",
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

      // Check tier access and apply appropriate limits
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const tier = subscription.tier;
      
      // Free/Beginner tiers cannot use AI
      if (tier === 'free' || tier === 'beginner') {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Please upgrade to Intermediate tier or higher to access AI Trade Ideas',
          requiredTier: 'intermediate'
        });
      }

      // All tiers use monthly credits now
      const creditResult = await cryptoSubscriptionService.useAICredit(userId);
      if (!creditResult.success) {
        return res.status(403).json({ 
          error: 'No AI credits remaining',
          message: 'You have used all your monthly AI credits. Credits reset monthly.',
          creditsRemaining: 0,
          creditsLimit: creditResult.limit
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
        model: "grok-3",
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

      res.json({ 
        ...tradeIdeas,
        creditsRemaining: creditResult.remaining,
        creditsLimit: creditResult.limit,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error generating trade ideas:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe checkout endpoint for local development
  app.post("/api/crypto/checkout", async (req, res) => {
    try {
      // Verify authentication from Clerk token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7);
      let userId: string;
      let email: string;

      try {
        // Verify the JWT token with Clerk
        const { createClerkClient, verifyToken } = await import('@clerk/backend');
        const secretKey = process.env.CLERK_SECRET_KEY;

        if (!secretKey) {
          return res.status(500).json({ error: 'Server configuration error' });
        }

        const payload = await verifyToken(token, {
          secretKey,
        });

        if (!payload?.sub) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        // Get user details from Clerk
        const clerk = createClerkClient({ secretKey });
        const user = await clerk.users.getUser(payload.sub);
        userId = payload.sub;
        email = user.emailAddresses[0]?.emailAddress || '';
      } catch (authError: any) {
        console.error('Auth verification failed:', authError);
        return res.status(401).json({ error: 'Authentication failed' });
      }

      const { tier, type, action } = req.body;

      // Import stripe functions dynamically
      const { 
        createTierCheckoutSession, 
        createElliottAddonCheckoutSession, 
        cancelElliottAddon,
        createPortalSession 
      } = await import('./stripeCheckout');

      const baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      const successUrl = `${baseUrl}/cryptosubscribe?success=true`;
      const cancelUrl = `${baseUrl}/cryptosubscribe?canceled=true`;

      if (type === 'base_tier' && tier) {
        const result = await createTierCheckoutSession(userId, email, tier, successUrl, cancelUrl);
        if (result.error) {
          return res.status(400).json({ error: result.error });
        }
        return res.json({ url: result.url });
      }

      if (type === 'elliott_addon') {
        const result = await createElliottAddonCheckoutSession(userId, email, successUrl, cancelUrl);
        if (result.error) {
          return res.status(400).json({ error: result.error });
        }
        return res.json({ url: result.url, added: !result.url });
      }

      if (type === 'cancel_elliott' || action === 'cancel_elliott') {
        const result = await cancelElliottAddon(userId);
        if (!result.success) {
          return res.status(400).json({ error: result.error });
        }
        return res.json({ success: true, message: 'Elliott Wave add-on canceled' });
      }

      if (type === 'portal') {
        const result = await createPortalSession(userId, email, successUrl);
        if (result.error) {
          return res.status(400).json({ error: result.error });
        }
        return res.json({ url: result.url });
      }

      return res.status(400).json({ error: 'Invalid checkout type' });
    } catch (error: any) {
      console.error('Checkout error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get all active alerts for the user
  app.get("/api/crypto/active-alerts", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { db } = await import("./db");
      const { chartDrawings, trackedTrades } = await import("@shared/schema");
      const { eq, and, sql, inArray } = await import("drizzle-orm");

      // Get H-Line alerts
      const hLineAlerts = await db.execute(sql`
        SELECT id, symbol, coordinates, style, created_at
        FROM chart_drawings 
        WHERE user_id = ${userId}
        AND drawing_type = 'horizontal' 
        AND (style->>'alertActive')::boolean = true 
        AND ((style->>'alertTriggered')::boolean IS NULL OR (style->>'alertTriggered')::boolean = false)
        ORDER BY created_at DESC
      `);

      // Get Elliott Wave projection alerts (if table exists)
      let elliottAlerts: any[] = [];
      try {
        const result = await db.execute(sql`
          SELECT id, symbol, price, level_label, wave_type, created_at
          FROM saved_projection_lines 
          WHERE user_id = ${userId}
          AND alert_enabled = true 
          AND alert_triggered = false
          ORDER BY created_at DESC
        `);
        elliottAlerts = result.rows || [];
      } catch (e) {
        // Table might not exist
      }

      // Get AI tracked trades
      let aiTrades: any[] = [];
      try {
        const result = await db.execute(sql`
          SELECT id, symbol, direction, entry, stop_loss, targets, status, created_at
          FROM tracked_trades 
          WHERE user_id = ${userId}
          AND status IN ('pending', 'entry_hit')
          ORDER BY created_at DESC
        `);
        aiTrades = result.rows || [];
      } catch (e) {
        // Table might not exist
      }

      res.json({
        hLineAlerts: (hLineAlerts.rows || []).map((a: any) => ({
          id: a.id,
          type: 'hline',
          symbol: a.symbol,
          price: a.coordinates?.points?.[0]?.price,
          label: a.style?.label || 'H-Line',
          createdAt: a.created_at,
        })),
        elliottAlerts: elliottAlerts.map((a: any) => ({
          id: a.id,
          type: 'elliott',
          symbol: a.symbol,
          price: a.price,
          label: a.level_label,
          waveType: a.wave_type,
          createdAt: a.created_at,
        })),
        aiTrades: aiTrades.map((t: any) => ({
          id: t.id,
          type: 'ai_trade',
          symbol: t.symbol,
          direction: t.direction,
          entry: t.entry,
          stopLoss: t.stop_loss,
          targets: t.targets,
          status: t.status,
          createdAt: t.created_at,
        })),
      });
    } catch (error: any) {
      console.error('Error fetching active alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete/deactivate an alert
  app.delete("/api/crypto/active-alerts", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { alertType, alertId } = req.body;
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      if (!alertType || !alertId) {
        return res.status(400).json({ error: 'Missing alertType or alertId' });
      }

      if (alertType === 'hline') {
        await db.execute(sql`
          UPDATE chart_drawings 
          SET style = style || '{"alertActive": false}'::jsonb
          WHERE id = ${alertId} AND user_id = ${userId}
        `);
      } else if (alertType === 'elliott') {
        await db.execute(sql`
          UPDATE saved_projection_lines 
          SET alert_enabled = false
          WHERE id = ${alertId} AND user_id = ${userId}
        `);
      } else if (alertType === 'ai_trade') {
        await db.execute(sql`
          UPDATE tracked_trades 
          SET status = 'cancelled'
          WHERE id = ${alertId} AND user_id = ${userId}
        `);
      } else {
        return res.status(400).json({ error: 'Invalid alertType' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error removing alert:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get VAPID public key for push notifications
  app.get("/api/crypto/vapid-key", async (req, res) => {
    try {
      const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.PUBLIC_VAPID_KEY;
      
      if (!publicKey) {
        console.error('VAPID public key not configured');
        return res.status(500).json({ error: 'VAPID key not configured' });
      }

      res.json({ publicKey });
    } catch (error: any) {
      console.error('Error fetching VAPID key:', error);
      res.status(500).json({ error: error.message });
    }
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
        hlineAlertsEnabled: subscription?.hlineAlertsEnabled ?? true,
        elliottAlertsEnabled: subscription?.elliottAlertsEnabled ?? true,
        aiTradeAlertsEnabled: subscription?.aiTradeAlertsEnabled ?? true,
        indicatorAlertsEnabled: subscription?.indicatorAlertsEnabled ?? true,
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
      const { 
        selectedTickers, alertGrades, alertTimeframes, alertTypes, alertsEnabled, pushSubscription,
        hlineAlertsEnabled, elliottAlertsEnabled, aiTradeAlertsEnabled, indicatorAlertsEnabled 
      } = req.body;

      // Get user subscription for tier-based validation
      const subscription = await cryptoSubscriptionService.getUserSubscription(userId);
      const tier = subscription?.tier || 'free';

      // Tier-based limits with progressive feature unlocking
      const tierLimits = {
        free: { 
          maxTickers: 0, 
          allowedAlertTypes: [],
          allowedGrades: [],
          allowedTimeframes: []
        },
        intermediate: { 
          maxTickers: 3, 
          allowedAlertTypes: ['bos', 'choch', 'fvg', 'liquidation', 'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx'],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        pro: { 
          maxTickers: 4, 
          allowedAlertTypes: [
            'bos', 'choch', 'fvg', 'liquidation', 
            'rsi_divergence', 'rsi_overbought', 'macd_crossover', 'stoch_cross', 'cci', 'adx',
            'ema_cross', 'sma_alignment', 'bb_squeeze', 'vwap_cross'
          ],
          allowedGrades: ['A+', 'A', 'B', 'C', 'D', 'E'],
          allowedTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d']
        },
        elite: { 
          maxTickers: 5, 
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
          requiredTier: 'intermediate'
        });
      }

      // Validate alert types based on tier
      if (alertTypes) {
        const invalidTypes = alertTypes.filter((type: string) => !limits.allowedAlertTypes.includes(type));
        if (invalidTypes.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support alert types: ${invalidTypes.join(', ')}`,
            requiredTier: 'intermediate'
          });
        }
      }

      // Validate alert grades based on tier
      if (alertGrades) {
        const invalidGrades = alertGrades.filter((grade: string) => !limits.allowedGrades.includes(grade));
        if (invalidGrades.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support grades: ${invalidGrades.join(', ')}`,
            requiredTier: 'intermediate'
          });
        }
      }

      // Validate timeframes based on tier
      if (alertTimeframes) {
        const invalidTimeframes = alertTimeframes.filter((tf: string) => !limits.allowedTimeframes.includes(tf));
        if (invalidTimeframes.length > 0) {
          return res.status(403).json({ 
            error: `${tier} tier does not support timeframes: ${invalidTimeframes.join(', ')}`,
            requiredTier: 'intermediate'
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
      if (hlineAlertsEnabled !== undefined) updateData.hlineAlertsEnabled = hlineAlertsEnabled;
      if (elliottAlertsEnabled !== undefined) updateData.elliottAlertsEnabled = elliottAlertsEnabled;
      if (aiTradeAlertsEnabled !== undefined) updateData.aiTradeAlertsEnabled = aiTradeAlertsEnabled;
      if (indicatorAlertsEnabled !== undefined) updateData.indicatorAlertsEnabled = indicatorAlertsEnabled;

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

  // Update SMS notification settings
  app.post("/api/crypto/sms-settings", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;
      const { phoneNumber, smsAlertsEnabled } = req.body;

      const { db } = await import("./db");
      const { cryptoUsers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const updateData: any = { updatedAt: new Date() };
      
      // Validate phone number format (basic validation)
      if (phoneNumber !== undefined) {
        if (phoneNumber && !phoneNumber.match(/^\+[1-9]\d{6,14}$/)) {
          return res.status(400).json({ 
            error: "Phone number must be in international format (e.g., +447712345678)" 
          });
        }
        updateData.phoneNumber = phoneNumber || null;
      }
      
      if (smsAlertsEnabled !== undefined) {
        updateData.smsAlertsEnabled = smsAlertsEnabled;
      }

      const updated = await db.update(cryptoUsers)
        .set(updateData)
        .where(eq(cryptoUsers.id, userId))
        .returning();

      res.json({
        phoneNumber: updated[0]?.phoneNumber,
        smsAlertsEnabled: updated[0]?.smsAlertsEnabled
      });
    } catch (error: any) {
      console.error('Error updating SMS settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get SMS notification settings
  app.get("/api/crypto/sms-settings", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;

      const { db } = await import("./db");
      const { cryptoUsers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const users = await db.select({
        phoneNumber: cryptoUsers.phoneNumber,
        smsAlertsEnabled: cryptoUsers.smsAlertsEnabled
      })
        .from(cryptoUsers)
        .where(eq(cryptoUsers.id, userId))
        .limit(1);

      if (users.length === 0) {
        return res.json({ phoneNumber: null, smsAlertsEnabled: false });
      }

      res.json(users[0]);
    } catch (error: any) {
      console.error('Error fetching SMS settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test SMS notification
  app.post("/api/crypto/sms-test", requireCryptoAuth, async (req, res) => {
    try {
      const userId = (req as any).cryptoUser.id;

      const { db } = await import("./db");
      const { cryptoUsers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const users = await db.select()
        .from(cryptoUsers)
        .where(eq(cryptoUsers.id, userId))
        .limit(1);

      if (users.length === 0 || !users[0].phoneNumber) {
        return res.status(400).json({ error: "No phone number configured" });
      }

      // Import and use SMS service
      const { testSMSConnection } = await import("./services/smsService");
      const success = await testSMSConnection(users[0].phoneNumber);

      if (success) {
        res.json({ success: true, message: "Test SMS sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send test SMS" });
      }
    } catch (error: any) {
      console.error('Error sending test SMS:', error);
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

  // Get current prices for multiple symbols (for tracked trades)
  app.post("/api/crypto/current-prices", requireCryptoAuth, async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "symbols array required" });
      }
      
      const prices: Record<string, number> = {};
      
      // Fetch current prices for each unique symbol
      const uniqueSymbols = [...new Set(symbols)];
      await Promise.all(uniqueSymbols.map(async (sym: string) => {
        try {
          const response = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${sym}`);
          if (response.ok) {
            const data = await response.json();
            prices[sym] = parseFloat(data.price);
          }
        } catch (err) {
          console.log(`Failed to fetch price for ${sym}:`, err);
        }
      }));
      
      res.json({ prices });
    } catch (error: any) {
      console.error('Error fetching current prices:', error);
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

      // In development mode, delete by ID only (open access)
      // In production, verify user owns the trade
      const whereClause = !isProduction 
        ? eq(trackedTrades.id, id)
        : and(eq(trackedTrades.id, id), eq(trackedTrades.userId, userId));

      const deleted = await db.delete(trackedTrades)
        .where(whereClause)
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Trade not found" });
      }

      console.log(`🗑️ Deleted tracked trade: ${id}`);
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
      const { eq, and, or, inArray: _inArray } = await import("drizzle-orm");

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
  app.post('/api/crypto/stripe-webhook', async (_req, res) => {
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

  // Binance exchange info - get all available USDT trading pairs
  let cachedSymbols: { value: string; label: string }[] | null = null;
  let symbolsCacheTime = 0;
  const SYMBOLS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  app.get("/api/binance/exchange-info", async (_req, res) => {
    try {
      const now = Date.now();
      
      if (cachedSymbols && (now - symbolsCacheTime) < SYMBOLS_CACHE_TTL) {
        return res.json(cachedSymbols);
      }

      console.log('📊 Fetching Binance exchange info...');
      
      // Try binance.us first (more reliable from Replit), fall back to binance.com
      let response;
      try {
        response = await fetch('https://api.binance.us/api/v3/exchangeInfo');
        if (!response.ok) throw new Error('binance.us failed');
      } catch {
        response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      }
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const usdtPairs = data.symbols
        .filter((s: any) => 
          s.quoteAsset === 'USDT' && 
          s.status === 'TRADING' &&
          s.isSpotTradingAllowed
        )
        .map((s: any) => ({
          value: s.symbol,
          label: `${s.baseAsset}/USDT`
        }))
        .sort((a: any, b: any) => a.label.localeCompare(b.label));
      
      cachedSymbols = usdtPairs;
      symbolsCacheTime = now;
      
      console.log(`✅ Found ${usdtPairs.length} USDT trading pairs`);
      
      res.json(usdtPairs);
    } catch (error: any) {
      console.error('Error fetching exchange info:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== ELLIOTT WAVE ROUTES (OPEN ACCESS) ====================

  // Get wave labels for a user/symbol/timeframe (or all timeframes with allTimeframes=true)
  app.get("/api/crypto/elliott-wave/labels", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe, allTimeframes } = req.query;
      
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }
      
      // If allTimeframes=true, fetch all labels for this symbol across ALL timeframes
      if (allTimeframes === 'true') {
        const { db } = await import("./db");
        const { elliottWaveLabels } = await import("@shared/schema");
        const { eq, and, asc } = await import("drizzle-orm");
        
        const labels = await db
          .select()
          .from(elliottWaveLabels)
          .where(
            and(
              eq(elliottWaveLabels.userId, (req as any).cryptoUser.id),
              eq(elliottWaveLabels.symbol, symbol as string)
            )
          )
          .orderBy(asc(elliottWaveLabels.createdAt));
        
        return res.json(labels);
      }
      
      // Standard query: require timeframe
      if (!timeframe) {
        return res.status(400).json({ error: 'Timeframe is required (or use allTimeframes=true)' });
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
      
      const { updateWaveLabel, getWaveLabels: _getWaveLabels } = await import("./services/elliottWaveService");
      
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

  // === Saved Projection Lines API ===
  
  // Get all saved projection lines for a symbol
  app.get("/api/crypto/projection-lines", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol } = req.query;
      const userId = (req as any).cryptoUser.id;
      
      const { db } = await import("./db");
      const { savedProjectionLines } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      let query = db.select().from(savedProjectionLines).where(eq(savedProjectionLines.userId, userId));
      
      if (symbol) {
        query = db.select().from(savedProjectionLines).where(
          and(eq(savedProjectionLines.userId, userId), eq(savedProjectionLines.symbol, symbol as string))
        );
      }
      
      const lines = await query;
      res.json(lines);
    } catch (error: any) {
      console.error('Error getting projection lines:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Save a projection line
  app.post("/api/crypto/projection-lines", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { symbol, timeframe, structureId, levelLabel, price, color, waveType, alertEnabled } = req.body;
      const userId = (req as any).cryptoUser.id;
      
      if (!symbol || !timeframe || !structureId || !levelLabel || price === undefined || !waveType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const { db } = await import("./db");
      const { savedProjectionLines } = await import("@shared/schema");
      
      const [newLine] = await db.insert(savedProjectionLines).values({
        userId,
        symbol,
        timeframe,
        structureId,
        levelLabel,
        price,
        color: color || (waveType === 'impulse' ? '#00CED1' : '#FBBF24'),
        waveType,
        alertEnabled: alertEnabled || false,
      }).returning();
      
      res.json(newLine);
    } catch (error: any) {
      console.error('Error saving projection line:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Toggle alert for a projection line
  app.patch("/api/crypto/projection-lines/:id/alert", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { id } = req.params;
      const { alertEnabled } = req.body;
      const userId = (req as any).cryptoUser.id;
      
      const { db } = await import("./db");
      const { savedProjectionLines } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const [updated] = await db.update(savedProjectionLines)
        .set({ alertEnabled })
        .where(and(eq(savedProjectionLines.id, id), eq(savedProjectionLines.userId, userId)))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: 'Projection line not found' });
      }
      
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating projection line:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete a projection line
  app.delete("/api/crypto/projection-lines/:id", requireCryptoAuth, requireEliteTier, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).cryptoUser.id;
      
      const { db } = await import("./db");
      const { savedProjectionLines } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const [deleted] = await db.delete(savedProjectionLines)
        .where(and(eq(savedProjectionLines.id, id), eq(savedProjectionLines.userId, userId)))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: 'Projection line not found' });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting projection line:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Chart Drawings API ============
  
  // Get chart drawings for a user/symbol/timeframe
  app.get("/api/crypto/chart-drawings", requireCryptoAuth, async (req, res) => {
    try {
      const { symbol, timeframe } = req.query;
      const userId = (req as any).cryptoUser.id;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'symbol and timeframe required' });
      }
      
      const { db } = await import("./db");
      const { chartDrawings } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const drawings = await db.select()
        .from(chartDrawings)
        .where(and(
          eq(chartDrawings.userId, userId),
          eq(chartDrawings.symbol, symbol as string),
          eq(chartDrawings.timeframe, timeframe as string)
        ));
      
      res.json(drawings);
    } catch (error: any) {
      console.error('Error fetching chart drawings:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Save a chart drawing
  app.post("/api/crypto/chart-drawings", requireCryptoAuth, async (req, res) => {
    try {
      const { symbol, timeframe, drawingType, coordinates, style, isLocked } = req.body;
      const userId = (req as any).cryptoUser.id;
      
      if (!symbol || !timeframe || !drawingType || !coordinates) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const { db } = await import("./db");
      const { chartDrawings } = await import("@shared/schema");
      
      const [drawing] = await db.insert(chartDrawings)
        .values({
          userId,
          symbol,
          timeframe,
          drawingType,
          coordinates,
          style: style || { color: '#3b82f6', lineWidth: 2 },
          isLocked: isLocked || false,
        })
        .returning();
      
      res.status(201).json(drawing);
    } catch (error: any) {
      console.error('Error saving chart drawing:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete a single chart drawing
  app.delete("/api/crypto/chart-drawings/:id", requireCryptoAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).cryptoUser.id;
      
      const { db } = await import("./db");
      const { chartDrawings } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const [deleted] = await db.delete(chartDrawings)
        .where(and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId)))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: 'Drawing not found' });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting chart drawing:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Update a chart drawing (for settings changes or point moves)
  app.patch("/api/crypto/chart-drawings/:id", requireCryptoAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { style, coordinates } = req.body;
      const userId = (req as any).cryptoUser.id;
      
      const { db } = await import("./db");
      const { chartDrawings } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // First get the existing drawing to merge styles
      const [existing] = await db.select()
        .from(chartDrawings)
        .where(and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId)));
      
      if (!existing) {
        return res.status(404).json({ error: 'Drawing not found' });
      }
      
      // Build update object
      const updates: Record<string, any> = {};
      
      // Merge the new style with existing style if provided
      if (style) {
        updates.style = { ...(existing.style as object || {}), ...style };
      }
      
      // Update coordinates if provided (for moving points)
      if (coordinates) {
        updates.coordinates = coordinates;
      }
      
      const [updated] = await db.update(chartDrawings)
        .set(updates)
        .where(and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId)))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating chart drawing:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Clear all drawings for a user/symbol/timeframe
  app.delete("/api/crypto/chart-drawings", requireCryptoAuth, async (req, res) => {
    try {
      const { symbol, timeframe } = req.query;
      const userId = (req as any).cryptoUser.id;
      
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: 'symbol and timeframe required' });
      }
      
      const { db } = await import("./db");
      const { chartDrawings } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      await db.delete(chartDrawings)
        .where(and(
          eq(chartDrawings.userId, userId),
          eq(chartDrawings.symbol, symbol as string),
          eq(chartDrawings.timeframe, timeframe as string)
        ));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error clearing chart drawings:', error);
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
      const { patternType, points, isLeading: _isLeading } = req.body;
      
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
  // Requires elite tier OR Elliott Wave add-on
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

  // ==================== FEEDBACK BOARD ROUTES ====================
  const ADMIN_EMAIL = 'beartec@beartec.uk';

  // Get all feedback posts (public)
  app.get("/api/crypto/feedback-board", async (req, res) => {
    try {
      const posts = await storage.listFeedbackBoard();
      
      // For each post, get its replies
      const postsWithReplies = await Promise.all(
        posts.map(async (post) => {
          const replies = await storage.getFeedbackBoardReplies(post.id);
          return { ...post, replies };
        })
      );
      
      res.json(postsWithReplies);
    } catch (error: any) {
      console.error('Error fetching feedback board:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new feedback post (anyone can post)
  app.post("/api/crypto/feedback-board", async (req, res) => {
    try {
      console.log('[Feedback] POST request received:', JSON.stringify(req.body));
      const { content, userEmail, userName } = req.body;
      
      if (!content || content.trim().length === 0) {
        console.log('[Feedback] Validation failed: content is empty');
        return res.status(400).json({ error: 'Content is required' });
      }
      
      console.log('[Feedback] Creating post for user:', userEmail);
      const post = await storage.createFeedbackBoard({
        content: content.trim(),
        userEmail: userEmail || null,
        userName: userName || null,
      });
      
      console.log('[Feedback] Post created successfully:', post.id);
      res.json(post);
    } catch (error: any) {
      console.error('[Feedback] Error creating feedback post:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a feedback post (admin only)
  app.delete("/api/crypto/feedback-board/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const success = await storage.deleteFeedbackBoard(id);
      res.json({ success });
    } catch (error: any) {
      console.error('Error deleting feedback post:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reply to a feedback post (admin only)
  app.post("/api/crypto/feedback-board/:id/replies", async (req, res) => {
    try {
      const { id } = req.params;
      const { content, responderEmail, responderName } = req.body;
      
      // Only admin can reply
      if (responderEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Only admin can reply to feedback' });
      }
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      const reply = await storage.createFeedbackBoardReply({
        feedbackId: id,
        content: content.trim(),
        responderEmail: responderEmail,
        responderName: responderName || 'BearTec',
        isAdminReply: true,
      });
      
      res.json(reply);
    } catch (error: any) {
      console.error('Error creating reply:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a reply (admin only)
  app.delete("/api/crypto/feedback-board/replies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      
      if (email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const success = await storage.deleteFeedbackBoardReply(id);
      res.json({ success });
    } catch (error: any) {
      console.error('Error deleting reply:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== END FEEDBACK BOARD ROUTES ====================

  // ==================== WAVE STACK AI ANALYSIS (SANDBOX) ====================
  
  // AI-powered Wave Stack analysis - sends wave data (not image) to Grok for interpretation
  // Admin only (beartec@beartec.uk)
  app.post("/api/crypto/elliott-wave/analyze-stack", requireCryptoAuth, async (req, res) => {
    try {
      const { waveEntries, symbol, pivots, scopedWave, priorWaveContext } = req.body;
      const userEmail = (req as any).cryptoUser?.email?.toLowerCase() || '';
      
      // Admin only access
      if (userEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'This feature is in sandbox mode - admin access only' });
      }
      
      if (!waveEntries || !Array.isArray(waveEntries) || waveEntries.length === 0) {
        return res.status(400).json({ error: 'Wave entries array is required' });
      }
      
      if (!process.env.XAI_API_KEY) {
        return res.status(503).json({ error: 'AI analysis service unavailable. Configuration required.' });
      }
      
      const pivotCount = pivots?.length || 0;
      const analysisMode = scopedWave ? `SCOPED: ${scopedWave.degree} ${scopedWave.label}` : 'FULL STACK';
      console.log(`🤖 Grok Wave Analysis [${analysisMode}]: ${waveEntries.length} entries, ${pivotCount} pivots for ${symbol}...`);
      
      // Calculate Fibonacci ratios and rule checks for each wave
      const waveDataFormatted = waveEntries.map((entry: any, idx: number) => {
        const priceMove = Math.abs(entry.endPrice - entry.startPrice);
        const percentMove = ((entry.endPrice - entry.startPrice) / entry.startPrice * 100);
        
        return {
          index: idx + 1,
          degree: entry.degree,
          patternType: entry.patternType,
          waveCount: entry.waveCount,
          direction: entry.direction,
          startTime: new Date(entry.startTime * 1000).toISOString(),
          endTime: new Date(entry.endTime * 1000).toISOString(),
          startPrice: parseFloat(entry.startPrice?.toFixed(8)),
          endPrice: parseFloat(entry.endPrice?.toFixed(8)),
          priceMove: parseFloat(priceMove.toFixed(8)),
          percentChange: parseFloat(percentMove.toFixed(2)),
          durationHours: Math.round((entry.endTime - entry.startTime) / 3600),
        };
      });
      
      // Group waves by degree for easier analysis
      const wavesByDegree: Record<string, any[]> = {};
      waveDataFormatted.forEach(w => {
        if (!wavesByDegree[w.degree]) wavesByDegree[w.degree] = [];
        wavesByDegree[w.degree].push(w);
      });
      
      // Format pivot data: PH = pivot high (date, high price), PL = pivot low (date, low price)
      const pivotHighs = (pivots || [])
        .filter((p: any) => p.type === 'H')
        .map((p: any) => `PH ${new Date(p.time * 1000).toISOString().slice(0, 16)} @ ${p.price?.toFixed(6)}`);
      const pivotLows = (pivots || [])
        .filter((p: any) => p.type === 'L')
        .map((p: any) => `PL ${new Date(p.time * 1000).toISOString().slice(0, 16)} @ ${p.price?.toFixed(6)}`);
      
      // Build hierarchical structure with stable uiIndex for cross-referencing
      const degreeOrder = ['Grand Super Cycle', 'Super Cycle', 'Cycle', 'Primary', 'Intermediate', 'Minor', 'Minute', 'Minuette', 'Sub-Minuette'];
      
      // Add uiIndex (1-based, matching frontend table) and parent links
      const wavesWithIndex = waveDataFormatted.map((wave: any, idx: number) => {
        const waveDegreeIdx = degreeOrder.indexOf(wave.degree);
        let parentIndex: number | null = null;
        
        for (let i = idx - 1; i >= 0; i--) {
          const candidateParent = waveDataFormatted[i];
          const parentDegreeIdx = degreeOrder.indexOf(candidateParent.degree);
          if (parentDegreeIdx < waveDegreeIdx) {
            const parentStart = new Date(candidateParent.startTime).getTime();
            const parentEnd = new Date(candidateParent.endTime).getTime();
            const waveStart = new Date(wave.startTime).getTime();
            const waveEnd = new Date(wave.endTime).getTime();
            if (waveStart >= parentStart && waveEnd <= parentEnd) {
              parentIndex = i + 1; // 1-based index
              break;
            }
          }
        }
        return { 
          uiIndex: idx + 1, // 1-based index matching frontend table
          parentIndex,
          degree: wave.degree,
          userLabel: wave.patternType, // User's label (impulse, correction, etc)
          waveCount: wave.waveCount,
          direction: wave.direction,
          startPrice: wave.startPrice,
          endPrice: wave.endPrice,
          percentChange: wave.percentChange,
          durationHours: wave.durationHours,
          startTime: wave.startTime,
          endTime: wave.endTime,
        };
      });
      
      // Create pivot summary with price levels
      // If pivots were passed from frontend, use adaptive reprocessing if too many/few
      let processedPivots = pivots || [];
      let pivotLookback = 5;
      
      // If we have raw candle data in the pivots, we could reprocess
      // For now, just use what was passed but log the count
      console.log(`📊 Stack analysis received ${processedPivots.length} pivots from frontend`);
      
      // Find price extremes for anchoring
      const stackPriceHigh = processedPivots.length > 0 ? Math.max(...processedPivots.map((p: any) => p.price || 0)) : 0;
      const stackPriceLow = processedPivots.length > 0 ? Math.min(...processedPivots.map((p: any) => p.price || Infinity)) : 0;
      
      const pivotSummary = processedPivots.map((p: any, i: number) => ({
        seq: i + 1,
        type: p.type,
        price: parseFloat(p.price?.toFixed(6)),
        date: new Date(p.time * 1000).toISOString().slice(0, 16),
      }));
      
      console.log(`📊 Stack analysis: ${pivotSummary.length} pivots (price range: $${stackPriceLow.toFixed(4)} - $${stackPriceHigh.toFixed(4)})`);
      
      // Determine if scoped analysis has no sub-waves (only 1 entry = the parent wave)
      const hasNoSubWaves = scopedWave && waveEntries.length === 1;
      
      // Build context sections based on analysis mode
      const scopedWaveSection = scopedWave ? `
=== SCOPED ANALYSIS MODE ===
You are analyzing a SPECIFIC wave segment: ${scopedWave.degree} ${scopedWave.label}
Price range: ${scopedWave.startPrice} → ${scopedWave.endPrice}
${hasNoSubWaves ? `
**NO SUB-WAVES EXIST YET** - Your MAIN task is to suggest sub-wave structure based on the pivot points!

For this wave, analyze the pivots and propose:
1. If it looks like an impulse: suggest 5 sub-waves (Minor 1-2-3-4-5 or Minute i-ii-iii-iv-v)
2. If it looks corrective: suggest 3 sub-waves (A-B-C or W-X-Y)

Include in "suggestedSubWaves" array with specific:
- Price levels for each sub-wave (from pivot data)
- The degree level (one lower than ${scopedWave.degree})
- Whether each is motive or corrective
` : 'Focus on validating existing SUB-WAVES within this structure.'}
${priorWaveContext ? `
PRIOR WAVE CONTEXT (the wave before this one):
- Degree: ${priorWaveContext.degree}
- Type: ${priorWaveContext.type} (${priorWaveContext.waveCount}-wave, ${priorWaveContext.direction})
- Price: ${priorWaveContext.startPrice} → ${priorWaveContext.endPrice} (${priorWaveContext.priceChange}%)

Use this to determine:
- If prior was motive (5-wave up), this should be corrective (ABC/WXY down)
- Check retracement depth: should be 38.2%-78.6% of prior wave
- Consider if this is simple (ABC) or complex (WXY, WXYXZ) based on depth/time
` : ''}` : '';

      const prompt = `You are an Elliott Wave analyst. Your job is to analyze PRICE POINTS and determine the best wave structure, then compare to the user's labels.

IMPORTANT: Focus on PRICE RELATIONSHIPS and STRUCTURE, not label terminology. "Impulse" inside a correction is the C-wave - that's valid! Don't flag terminology.
${scopedWaveSection}

=== STEP 1: ANALYZE PIVOT POINTS ===
Review these swing highs (H) and lows (L) to understand the price structure:
${JSON.stringify(pivotSummary, null, 2)}

=== STEP 2: USER'S WAVE STACK ===
Each wave has a uiIndex (for reference), parentIndex (which higher wave contains it), and user's label.
${JSON.stringify(wavesWithIndex, null, 2)}

=== YOUR ANALYSIS PROCESS ===
A) FIRST: Look at the raw price points (startPrice, endPrice, pivots) and determine what wave structure BEST FITS the data
B) THEN: Map your analysis to the uiIndex numbers so results can be cross-referenced
C) COMPARE: Your best-fit structure vs user's labels - note where they align and where they differ
D) REPORT: Focus on PRICE RELATIONSHIP issues (Fib ratios, overlaps, rule violations), not terminology
${scopedWave ? `E) SUGGEST sub-wave structure if none exists, or validate existing sub-waves` : ''}

=== ELLIOTT WAVE RULES TO CHECK ===
Within each degree level:
- Wave 2 cannot retrace >100% of Wave 1
- Wave 3 cannot be shortest (of 1, 3, 5)
- Wave 4 cannot overlap Wave 1 territory (except diagonals)
- Common retracements: W2 = 50-78.6% of W1, W4 = 23.6-50% of W3
- Common extensions: W3 = 1.618x W1, W5 = W1 or 0.618x W1-3

=== RESPOND IN THIS JSON FORMAT ===
{
  "synopsis": "2-3 sentence summary of your analysis",
  
  "aiBestFit": [
    { "uiIndex": 1, "degree": "Intermediate", "suggestedLabel": "1 (motive)", "direction": "up", "reasoning": "Clear 5-wave impulse structure" },
    { "uiIndex": 2, "degree": "Intermediate", "suggestedLabel": "2 (corrective)", "direction": "down", "reasoning": "61.8% retracement of wave 1" }
  ],
  
  "comparison": [
    { "uiIndex": 1, "userLabel": "impulse 1/A", "aiLabel": "1 (motive)", "match": true, "note": "Agree on structure" },
    { "uiIndex": 3, "userLabel": "impulse W", "aiLabel": "W of WXY", "match": true, "note": "Terminology differs but structure is correct - W is a 3-wave move inside correction" }
  ],
  
  "priceIssues": [
    { "uiIndex": 5, "issue": "Wave retraces 85% - deep for typical W4", "severity": "MODERATE", "suggestion": "Could be part of complex correction" }
  ],
  
  "fibonacciAnalysis": [
    { "uiIndex": 2, "relationship": "W2/W1", "value": "61.8%", "isValid": true },
    { "uiIndex": 4, "relationship": "W4/W3", "value": "38.2%", "isValid": true }
  ],
  
  "recommendationsTable": [
    { "uiIndex": 1, "degree": "Intermediate", "label": "1/A", "direction": "up", "startPrice": 0.50, "endPrice": 2.90, "status": "OK" },
    { "uiIndex": 2, "degree": "Intermediate", "label": "2/B", "direction": "down", "startPrice": 2.90, "endPrice": 1.80, "status": "OK" },
    { "uiIndex": 5, "degree": "Minor", "label": "Y", "direction": "down", "startPrice": 2.50, "endPrice": 2.10, "status": "REVIEW", "reason": "Deep retracement" }
  ],
  
  "suggestedSubWaves": [
    { "label": "1", "degree": "Minor", "type": "motive", "direction": "up", "startPrice": 0.46, "endPrice": 1.20, "startDate": "2024-11-01", "endDate": "2024-11-15", "reasoning": "First impulsive move from the low" },
    { "label": "2", "degree": "Minor", "type": "corrective", "direction": "down", "startPrice": 1.20, "endPrice": 0.85, "startDate": "2024-11-15", "endDate": "2024-11-22", "reasoning": "50% retracement of wave 1" }
  ],
  
  "prediction": {
    "nextWave": "Intermediate 3 up",
    "targets": ["3.50", "4.20"],
    "confidence": 70
  }
}

CRITICAL: Use the uiIndex numbers from the data. These match the user's table so they can cross-reference your findings.`;

      const OpenAI = (await import('openai')).default;
      const xaiClient = new OpenAI({
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY,
        timeout: 120000,
      });
      
      console.log(`🤖 Calling xAI API with grok-3-beta model...`);
      const response = await xaiClient.chat.completions.create({
        model: 'grok-3-beta',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4500,
        temperature: 0.1,
      });
      console.log(`✅ xAI API response received`);
      
      const content = response.choices?.[0]?.message?.content || '';
      console.log(`✅ Grok Wave Stack analysis complete`);
      
      // Try to parse JSON from response with fallback extraction
      let analysis;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
          console.log(`📊 Stack analysis parsed synopsis: "${analysis.synopsis?.slice(0, 100) || 'MISSING'}..."`);
        } else {
          analysis = { raw: content, parseError: 'Could not extract JSON from response' };
          console.log(`⚠️ Stack analysis: No JSON found in response`);
        }
      } catch (parseErr) {
        console.log(`⚠️ Stack analysis JSON parse failed: ${parseErr}`);
        // Try to extract key fields manually from malformed JSON
        const synopsisMatch = content.match(/"synopsis"\s*:\s*"([^"]+)"/);
        // Look for recommendationsTable (the actual field name in the response format)
        const tableMatch = content.match(/"recommendationsTable"\s*:\s*\[([\s\S]*?)\]/);
        // Also try aiBestFit as alternative
        const aiBestFitMatch = content.match(/"aiBestFit"\s*:\s*\[([\s\S]*?)\]/);
        
        if (synopsisMatch) {
          console.log(`📊 Extracted synopsis from malformed JSON: "${synopsisMatch[1].slice(0, 80)}..."`);
          analysis = {
            synopsis: synopsisMatch[1],
            recommendationsTable: [],
            aiBestFit: [],
            parseError: 'Partial extraction from malformed response'
          };
          
          // Try to extract recommendationsTable entries
          const dataMatch = tableMatch || aiBestFitMatch;
          if (dataMatch) {
            try {
              // Find all individual entry objects (simple flat objects)
              const entries = dataMatch[1].match(/\{[^{}]+\}/g);
              if (entries) {
                const parsed = entries.map(e => {
                  try { return JSON.parse(e); } catch { return null; }
                }).filter(Boolean);
                if (tableMatch) {
                  analysis.recommendationsTable = parsed;
                  console.log(`📊 Extracted ${parsed.length} recommendations table entries`);
                } else {
                  analysis.aiBestFit = parsed;
                  console.log(`📊 Extracted ${parsed.length} aiBestFit entries`);
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not extract table data`);
            }
          }
        } else {
          analysis = { raw: content, parseError: 'JSON parse failed, no synopsis found' };
        }
      }
      
      res.json({
        success: true,
        waveCount: waveEntries.length,
        symbol,
        analysis,
        rawResponse: content,
      });
    } catch (error: any) {
      console.error('Error in Wave Stack AI analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== END WAVE STACK AI ANALYSIS ====================

  // ==================== CHART DATA ANALYSIS (RAW PATTERN DETECTION) ====================
  app.post('/api/crypto/elliott-wave/analyze-chart', requireCryptoAuth, async (req: any, res) => {
    try {
      const { symbol, timeframe, pivots, priceRange } = req.body;
      const userEmail = req.cryptoUser?.email?.toLowerCase() || '';
      
      // Admin only access
      if (userEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'This feature is in sandbox mode - admin access only' });
      }
      
      if (!pivots || pivots.length < 3) {
        return res.status(400).json({ error: 'Need at least 3 pivot points for pattern analysis' });
      }
      
      console.log(`🤖 Grok Chart Analysis: ${pivots.length} pivots for ${symbol} ${timeframe}...`);
      
      // Calculate overall trend direction
      const overallChange = priceRange.end - priceRange.start;
      const overallChangePercent = ((overallChange / priceRange.start) * 100).toFixed(2);
      const overallTrend = overallChange > 0 ? 'UPTREND' : overallChange < 0 ? 'DOWNTREND' : 'SIDEWAYS';
      
      // Find key pivot highs and lows
      const pivotHighs = pivots.filter((p: any) => p.type === 'H').sort((a: any, b: any) => b.price - a.price);
      const pivotLows = pivots.filter((p: any) => p.type === 'L').sort((a: any, b: any) => a.price - b.price);
      const highestPivot = pivotHighs[0];
      const lowestPivot = pivotLows[0];
      
      // CRITICAL: Analyze pivot SEQUENCE to detect structure (like stack/section analysis)
      // Sort pivots by time and analyze the H/L pattern
      const sortedByTime = [...pivots].sort((a: any, b: any) => a.time - b.time);
      
      console.log(`📊 ═══════════════════════════════════════════════`);
      console.log(`📊 PIVOT SEQUENCE ANALYSIS (${sortedByTime.length} pivots)`);
      
      // Log the pivot sequence
      const pivotSequence = sortedByTime.map((p: any) => `${p.type}:$${p.price.toFixed(2)}`).join(' → ');
      console.log(`📊 Sequence: ${pivotSequence}`);
      
      // Identify key turning points in the sequence
      const firstPivot = sortedByTime[0];
      const lastPivot = sortedByTime[sortedByTime.length - 1];
      
      // Find the highest H pivot and lowest L pivot WITH their positions in the sequence
      let highestHPivot: any = null;
      let highestHIndex = -1;
      let lowestLPivot: any = null;
      let lowestLIndex = -1;
      
      sortedByTime.forEach((p: any, idx: number) => {
        if (p.type === 'H' && (!highestHPivot || p.price > highestHPivot.price)) {
          highestHPivot = p;
          highestHIndex = idx;
        }
        if (p.type === 'L' && (!lowestLPivot || p.price < lowestLPivot.price)) {
          lowestLPivot = p;
          lowestLIndex = idx;
        }
      });
      
      console.log(`📊 First pivot: ${firstPivot?.type} at $${firstPivot?.price?.toFixed(4)} (index 0)`);
      console.log(`📊 Highest H: $${highestHPivot?.price?.toFixed(4)} at index ${highestHIndex} of ${sortedByTime.length - 1}`);
      console.log(`📊 Lowest L: $${lowestLPivot?.price?.toFixed(4)} at index ${lowestLIndex} of ${sortedByTime.length - 1}`);
      console.log(`📊 Last pivot: ${lastPivot?.type} at $${lastPivot?.price?.toFixed(4)} (index ${sortedByTime.length - 1})`);
      
      // Determine structure based on pivot sequence position
      // If lowest L comes BEFORE highest H in sequence = DOWN first, then UP
      // If highest H comes BEFORE lowest L in sequence = UP first, then DOWN
      let structureType = 'SIMPLE';
      let phaseAnalysis = '';
      
      const totalPivots = sortedByTime.length;
      const highestHPosition = highestHIndex / (totalPivots - 1); // 0 = start, 1 = end
      const lowestLPosition = lowestLIndex / (totalPivots - 1);
      
      console.log(`📊 Highest H position: ${(highestHPosition * 100).toFixed(0)}% through sequence`);
      console.log(`📊 Lowest L position: ${(lowestLPosition * 100).toFixed(0)}% through sequence`);
      
      // Analyze first pivot to determine initial direction
      const firstPivotType = firstPivot?.type;
      const startPrice = priceRange.start;
      const endPrice = priceRange.end;
      
      // Two-phase detection based on sequence analysis
      if (lowestLIndex < highestHIndex) {
        // Lowest L comes FIRST in sequence = went DOWN to the low, then UP to the high
        const downMovePercent = ((lowestLPivot.price - startPrice) / startPrice * 100).toFixed(1);
        const upMovePercent = ((highestHPivot.price - lowestLPivot.price) / lowestLPivot.price * 100).toFixed(1);
        
        // Check if this is a significant two-phase move (not just at edges)
        if (lowestLPosition > 0.1 && highestHPosition < 0.9 && lowestLPosition < 0.5) {
          structureType = 'TWO_PHASE_DOWN_THEN_UP';
          phaseAnalysis = `⚠️ TWO-PHASE STRUCTURE DETECTED (based on pivot sequence):
Phase 1 (DOWN): From start, price fell to lowest pivot at $${lowestLPivot.price.toFixed(4)} (${downMovePercent}%)
  - This low occurred at pivot ${lowestLIndex + 1} of ${totalPivots} (${(lowestLPosition * 100).toFixed(0)}% through the sequence)
  - Analyze this DOWN phase: Could be impulse down, zigzag ABC down, or wave A/C down

Phase 2 (UP): From that low, price rose to highest pivot at $${highestHPivot.price.toFixed(4)} (+${upMovePercent}%)
  - This high occurred at pivot ${highestHIndex + 1} of ${totalPivots} (${(highestHPosition * 100).toFixed(0)}% through the sequence)
  - Analyze this UP phase: Could be impulse up, zigzag ABC up, or corrective bounce

CRITICAL: The FIRST significant move was DOWN. Do NOT say Phase 1 was UP.`;
        }
      } else if (highestHIndex < lowestLIndex) {
        // Highest H comes FIRST in sequence = went UP to the high, then DOWN to the low
        const upMovePercent = ((highestHPivot.price - startPrice) / startPrice * 100).toFixed(1);
        const downMovePercent = ((lowestLPivot.price - highestHPivot.price) / highestHPivot.price * 100).toFixed(1);
        
        // Check if this is a significant two-phase move
        if (highestHPosition > 0.1 && lowestLPosition < 0.9 && highestHPosition < 0.5) {
          structureType = 'TWO_PHASE_UP_THEN_DOWN';
          phaseAnalysis = `⚠️ TWO-PHASE STRUCTURE DETECTED (based on pivot sequence):
Phase 1 (UP): From start, price rose to highest pivot at $${highestHPivot.price.toFixed(4)} (+${upMovePercent}%)
  - This high occurred at pivot ${highestHIndex + 1} of ${totalPivots} (${(highestHPosition * 100).toFixed(0)}% through the sequence)
  - Analyze this UP phase: Could be impulse up, zigzag ABC up, or wave A up

Phase 2 (DOWN): From that high, price fell to lowest pivot at $${lowestLPivot.price.toFixed(4)} (${downMovePercent}%)
  - This low occurred at pivot ${lowestLIndex + 1} of ${totalPivots} (${(lowestLPosition * 100).toFixed(0)}% through the sequence)
  - Analyze this DOWN phase: Could be impulse down, zigzag ABC down, or corrective decline

CRITICAL: The FIRST significant move was UP. Do NOT say Phase 1 was DOWN.`;
        }
      }
      
      // If first pivot type clearly indicates direction
      if (structureType === 'SIMPLE') {
        if (firstPivotType === 'L' && lowestLIndex === 0) {
          // Started at a low, so we're going UP from there
          phaseAnalysis = `Structure starts at a LOW pivot ($${firstPivot.price.toFixed(4)}), indicating the visible range begins after a down move. Subsequent price action is primarily UPWARD from this low.`;
        } else if (firstPivotType === 'H' && highestHIndex === 0) {
          // Started at a high, so we're going DOWN from there
          phaseAnalysis = `Structure starts at a HIGH pivot ($${firstPivot.price.toFixed(4)}), indicating the visible range begins at a peak. Subsequent price action is primarily DOWNWARD from this high.`;
        }
      }
      
      const firstPivotTime = sortedByTime[0]?.time || 0;
      const lastPivotTime = sortedByTime[sortedByTime.length - 1]?.time || 0;
      const timeRange = lastPivotTime - firstPivotTime;
      const highestPivotPosition = timeRange > 0 ? (highestHPivot?.time - firstPivotTime) / timeRange : 0.5;
      const lowestPivotPosition = timeRange > 0 ? (lowestLPivot?.time - firstPivotTime) / timeRange : 0.5;
      
      console.log(`📊 Structure type: ${structureType}`);
      console.log(`📊 ═══════════════════════════════════════════════`);
      
      // Format pivots for AI
      const pivotSummary = pivots.map((p: any) => ({
        type: p.type,
        price: p.price.toFixed(4),
        time: new Date(p.time).toISOString().split('T')[0],
      }));
      
      const prompt = `You are an Elliott Wave analyst. Analyze these raw price pivot points and identify the BEST FITTING Elliott Wave pattern(s). Do NOT assume any position in a larger structure - just analyze what you see.

=== CRITICAL: STRUCTURE ANALYSIS ===
${phaseAnalysis ? phaseAnalysis : `Simple structure: Price moved ${overallTrend} from start to end.`}

=== OVERALL MOVEMENT ===
The price moved from $${priceRange.start.toFixed(4)} to $${priceRange.end.toFixed(4)} (${overallChangePercent}%)
Overall net direction: ${overallTrend}
${structureType !== 'SIMPLE' ? `⚠️ WARNING: This is NOT a simple one-directional move! See structure analysis above.` : ''}

Highest H Pivot: $${highestHPivot?.price?.toFixed(4) || 'N/A'} on ${highestHPivot ? new Date(highestHPivot.time * 1000).toISOString().split('T')[0] : 'N/A'} (at index ${highestHIndex} of ${totalPivots}, ${(highestPivotPosition * 100).toFixed(0)}% through time range)
Lowest L Pivot: $${lowestLPivot?.price?.toFixed(4) || 'N/A'} on ${lowestLPivot ? new Date(lowestLPivot.time * 1000).toISOString().split('T')[0] : 'N/A'} (at index ${lowestLIndex} of ${totalPivots}, ${(lowestPivotPosition * 100).toFixed(0)}% through time range)
First Pivot: ${firstPivot?.type} at $${firstPivot?.price?.toFixed(4) || 'N/A'} - This tells you the INITIAL direction
Last Pivot: ${lastPivot?.type} at $${lastPivot?.price?.toFixed(4) || 'N/A'}

=== PRICE DATA ===
Symbol: ${symbol}
Timeframe: ${timeframe}
Price Range: $${priceRange.low.toFixed(4)} to $${priceRange.high.toFixed(4)}
Start Price: $${priceRange.start.toFixed(4)} → End Price: $${priceRange.end.toFixed(4)} (${overallTrend})

=== PIVOT POINTS (${pivots.length} total) ===
${JSON.stringify(pivotSummary, null, 2)}

=== ELLIOTT WAVE PATTERNS TO CONSIDER ===
MOTIVE (trending):
- Impulse (5-wave: 1-2-3-4-5) - Wave 3 never shortest, Wave 4 doesn't overlap Wave 1
- Leading Diagonal (5-wave: 1-2-3-4-5) - Waves 1 & 4 can overlap, all waves are 3s
- Ending Diagonal (5-wave: 1-2-3-4-5) - All waves are 3s, wedge shape

CORRECTIVE (counter-trend):
- Zigzag (ABC) - A=5 waves, B=3 waves, C=5 waves, sharp correction
- Flat (ABC) - A=3 waves, B=3 waves, C=5 waves, sideways correction
- Expanded Flat - B exceeds start of A, C exceeds end of A
- Running Flat - B exceeds start of A, C doesn't reach end of A
- Triangle (ABCDE) - 5 waves of 3s each, converging trendlines
- Double Zigzag (WXY) - Two zigzags connected by X wave
- Triple Zigzag (WXYXZ) - Three zigzags connected by two X waves
- Double Three (WXY) - Combination of flats/triangles/zigzags
- Triple Three (WXYXZ) - Three corrective patterns combined

=== FIBONACCI RELATIONSHIPS ===
- Wave 2: typically 50%, 61.8%, or 78.6% of Wave 1
- Wave 3: typically 161.8% or 261.8% of Wave 1
- Wave 4: typically 23.6%, 38.2%, or 50% of Wave 3
- Wave 5: typically 61.8% or 100% of Wave 1, or 61.8% of Waves 1-3
- Wave C: typically 100% or 161.8% of Wave A in zigzags
- Wave B: typically 50-78.6% of Wave A in zigzags, can exceed A in flats

=== RESPOND IN THIS JSON FORMAT ===
{
  "synopsis": "2-3 sentence summary describing EACH PHASE if a two-phase structure was detected. For example: 'Phase 1 shows a 5-wave impulse up to the peak. Phase 2 shows an overlapping correction down, likely a zigzag ABC.'",
  
  "bestFitPattern": "For two-phase: describe both (e.g., 'Impulse UP (Phase 1) + Zigzag DOWN (Phase 2)'). For single phase: just the pattern name.",
  "confidence": 75,
  "direction": "For two-phase: describe current phase direction. For single: overall direction.",
  
  "phase1Pattern": "Only for two-phase structures: Pattern of Phase 1 (e.g., 'Impulse 5-wave UP' or 'Zigzag ABC DOWN')",
  "phase2Pattern": "Only for two-phase structures: Pattern of Phase 2 (e.g., 'Zigzag ABC correction' or 'Impulse DOWN')",
  
  "possiblePatterns": [
    { "pattern": "Phase 1: Impulse UP + Phase 2: Zigzag ABC", "probability": 60, "reasoning": "Clear 5-wave impulse to peak, now retracing in ABC" },
    { "pattern": "Phase 1: Leading Diagonal + Phase 2: Sharp correction", "probability": 25, "reasoning": "Wave 1/4 overlap in up move, now correcting" },
    { "pattern": "Entire range: Double Zigzag WXY", "probability": 15, "reasoning": "If both phases are corrective, could be WXY structure" }
  ],
  
  "possibleOutcomes": [
    { "scenario": "If Phase 2 is ABC correction", "nextMove": "Expect new impulse up after C completes", "targets": ["$2.50", "$3.00"] },
    { "scenario": "If Phase 2 is start of new impulse down", "nextMove": "More downside expected", "targets": ["$1.50", "$1.20"] },
    { "scenario": "If Wave 4 of larger structure", "nextMove": "One more wave expected in trend direction", "targets": ["$2.80", "$3.20"] }
  ],
  
  "fibonacciLevels": [
    { "level": "38.2% retracement of Phase 1", "price": 2.15, "significance": "Shallow correction support" },
    { "level": "61.8% retracement of Phase 1", "price": 1.95, "significance": "Deep correction support" },
    { "level": "100% extension for Phase 2", "price": 1.50, "significance": "If C = A in zigzag" }
  ],
  
  "waveLabeling": [
    { "pivotIndex": 0, "suggestedLabel": "0 or start of Phase 1", "price": 0.50 },
    { "pivotIndex": 8, "suggestedLabel": "5 or A (end of Phase 1 / peak)", "price": 3.66 },
    { "pivotIndex": 12, "suggestedLabel": "A or 1 of Phase 2", "price": 2.80 }
  ]
}

CRITICAL FOR TWO-PHASE STRUCTURES:
- If the peak/trough is in the MIDDLE of the visible range, you MUST analyze BOTH phases separately
- Do NOT call the entire visible range a single "impulse down" when there was clearly an UP move first
- The synopsis MUST describe what happened in Phase 1 AND Phase 2
- Consider: Was Phase 1 an impulse? A diagonal? A correction? Then what is Phase 2?

CRITICAL FOR SINGLE-PHASE STRUCTURES:
- If price moved mostly in one direction, analyze as a single pattern
- The "direction" field MUST match the price movement direction
- Consider impulses, diagonals, and corrections based on wave structure`;

      const OpenAI = (await import('openai')).default;
      const xaiClient = new OpenAI({
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY,
        timeout: 120000,
      });
      
      console.log(`🤖 Calling xAI API for chart pattern analysis...`);
      const response = await xaiClient.chat.completions.create({
        model: 'grok-3-beta',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        temperature: 0.1,
      });
      console.log(`✅ xAI chart analysis response received`);
      
      const content = response.choices?.[0]?.message?.content || '';
      
      // Parse JSON from response
      let analysis;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
          console.log(`📊 Chart analysis: ${analysis.bestFitPattern} (${analysis.confidence}% confidence)`);
        } else {
          analysis = { synopsis: content, bestFitPattern: 'unclear', confidence: 0 };
        }
      } catch (parseErr) {
        console.log(`⚠️ Chart analysis JSON parse failed: ${parseErr}`);
        // Try to extract key fields
        const synopsisMatch = content.match(/"synopsis"\s*:\s*"([^"]+)"/);
        const patternMatch = content.match(/"bestFitPattern"\s*:\s*"([^"]+)"/);
        const confidenceMatch = content.match(/"confidence"\s*:\s*(\d+)/);
        analysis = {
          synopsis: synopsisMatch?.[1] || 'Analysis complete but JSON parsing failed',
          bestFitPattern: patternMatch?.[1] || 'unclear',
          confidence: parseInt(confidenceMatch?.[1] || '0'),
          possiblePatterns: [],
          possibleOutcomes: [],
        };
      }
      
      res.json({
        success: true,
        symbol,
        timeframe,
        pivotCount: pivots.length,
        analysis,
        rawResponse: content,
      });
    } catch (error: any) {
      console.error('Error in Chart AI analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== END CHART DATA ANALYSIS ====================

  // Timeframe hierarchy mapping for detailed analysis (higher → lower)
  const TIMEFRAME_HIERARCHY: Record<string, string> = {
    '1M': '1w',
    '1w': '1d',
    '1d': '4h',
    '4h': '1h',
    '1h': '15m',
    '15m': '5m',
    '5m': '1m',
  };
  
  // Map frontend timeframe values to Yahoo Finance intervals
  const TF_TO_INTERVAL: Record<string, string> = {
    '1M': '1mo',
    '1w': '1wk',
    '1d': '1d',
    '4h': '60m', // Yahoo uses 60m for 1h, we'll multiply
    '1h': '60m',
    '15m': '15m',
    '5m': '5m',
    '1m': '1m',
  };
  
  // Calculate pivots from candle data with a specific lookback
  function calculatePivotsFromCandles(candles: any[], lookback: number = 5): Array<{time: number; price: number; type: 'H' | 'L'}> {
    const pivots: Array<{time: number; price: number; type: 'H' | 'L'}> = [];
    
    for (let i = lookback; i < candles.length - lookback; i++) {
      const current = candles[i];
      let isPivotHigh = true;
      let isPivotLow = true;
      
      for (let j = 1; j <= lookback; j++) {
        if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
          isPivotHigh = false;
        }
        if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
          isPivotLow = false;
        }
      }
      
      if (isPivotHigh) pivots.push({ time: current.time, price: current.high, type: 'H' });
      if (isPivotLow) pivots.push({ time: current.time, price: current.low, type: 'L' });
    }
    
    return pivots.sort((a, b) => a.time - b.time);
  }
  
  // Adaptive pivot detection: dynamically adjust lookback to achieve target pivot count
  // Formula: lookback = clamp(candleCount / 150, 3, 40)
  // Target: 120-200 pivots for optimal AI analysis
  function calculateAdaptivePivots(
    candles: any[], 
    targetMin: number = 120, 
    targetMax: number = 200
  ): { pivots: Array<{time: number; price: number; type: 'H' | 'L'}>; lookback: number; iterations: number } {
    const candleCount = candles.length;
    
    // Initial lookback based on candle count
    let lookback = Math.round(candleCount / 150);
    lookback = Math.max(3, Math.min(40, lookback)); // Clamp between 3 and 40
    
    let pivots = calculatePivotsFromCandles(candles, lookback);
    let iterations = 1;
    const maxIterations = 5;
    
    // Iteratively adjust lookback to hit target range
    while (iterations < maxIterations) {
      if (pivots.length < targetMin && lookback > 3) {
        // Too few pivots - decrease lookback for more granularity
        lookback = Math.max(3, lookback - 2);
        pivots = calculatePivotsFromCandles(candles, lookback);
        iterations++;
      } else if (pivots.length > targetMax && lookback < 40) {
        // Too many pivots - increase lookback for less granularity
        lookback = Math.min(40, lookback + 2);
        pivots = calculatePivotsFromCandles(candles, lookback);
        iterations++;
      } else {
        // Within target range or at bounds
        break;
      }
    }
    
    console.log(`📊 Adaptive pivots: ${candleCount} candles → lookback ${lookback} → ${pivots.length} pivots (${iterations} iterations)`);
    
    return { pivots, lookback, iterations };
  }

  // Detailed Sub-Wave Analysis - uses lower timeframe data for granular sub-wave discovery
  app.post("/api/crypto/elliott-wave/analyze-detailed", requireCryptoAuth, async (req, res) => {
    try {
      const { selectedWave, symbol, priorWaveContext } = req.body;
      const userEmail = (req as any).cryptoUser?.email?.toLowerCase() || '';
      
      // Admin only access
      if (userEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'This feature is in sandbox mode - admin access only' });
      }
      
      if (!selectedWave || !selectedWave.startTime || !selectedWave.endTime) {
        return res.status(400).json({ error: 'Selected wave with start/end times is required' });
      }
      
      if (!process.env.XAI_API_KEY) {
        return res.status(503).json({ error: 'AI analysis service unavailable. Configuration required.' });
      }
      
      const currentTimeframe = selectedWave.timeframe || '1d';
      const lowerTimeframe = TIMEFRAME_HIERARCHY[currentTimeframe] || currentTimeframe;
      const yahooInterval = TF_TO_INTERVAL[lowerTimeframe] || '15m';
      
      // Convert symbol format dynamically (XYZUSDT → XYZ-USD)
      // Supports any symbol ending in USDT
      let yahooSymbol = 'XRP-USD'; // Default fallback
      if (symbol && symbol.endsWith('USDT')) {
        const base = symbol.replace('USDT', '');
        yahooSymbol = `${base}-USD`;
      } else if (symbol && symbol.includes('-')) {
        // Already in Yahoo format
        yahooSymbol = symbol;
      }
      
      // Validate the symbol is one of our supported ones
      const ALLOWED_SYMBOLS = ['XRP-USD', 'BTC-USD', 'ETH-USD', 'ADA-USD', 'SOL-USD'];
      if (!ALLOWED_SYMBOLS.includes(yahooSymbol)) {
        return res.status(400).json({ 
          error: 'Unsupported symbol', 
          message: `Symbol ${symbol} is not supported. Supported: BTCUSDT, ETHUSDT, XRPUSDT, ADAUSDT, SOLUSDT` 
        });
      }
      
      console.log(`🔍 Detailed Analysis: ${selectedWave.degree} ${selectedWave.patternType} on ${currentTimeframe}`);
      console.log(`📊 Fetching ${lowerTimeframe} data (interval: ${yahooInterval}) for sub-wave discovery...`);
      
      // Calculate date range with buffer for the wave (10% on each side)
      const waveBuffer = (selectedWave.endTime - selectedWave.startTime) * 0.1;
      const startDate = new Date((selectedWave.startTime - waveBuffer) * 1000).toISOString().slice(0, 10);
      const endDate = new Date((selectedWave.endTime + waveBuffer) * 1000).toISOString().slice(0, 10);
      
      console.log(`📅 Fetching data from ${startDate} to ${endDate}`);
      
      // Fetch lower timeframe candle data using specific date range
      const scriptPath = path.join(process.cwd(), 'server', 'python', 'chart_data.py');
      const { stdout, stderr } = await execFileAsync(
        'python3',
        [scriptPath, yahooSymbol, '1mo', yahooInterval, startDate, endDate],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      if (stderr) {
        console.warn('Python script warnings:', stderr);
      }
      
      const chartData = JSON.parse(stdout);
      if (chartData.error) {
        return res.status(400).json({ error: 'Failed to fetch lower timeframe data', details: chartData.error });
      }
      
      // Filter candles to the wave's time range (with 5% buffer on each side)
      const waveStart = selectedWave.startTime;
      const waveEnd = selectedWave.endTime;
      const buffer = (waveEnd - waveStart) * 0.05;
      
      // Debug: log wave time range and sample candle times
      const allCandles = chartData.data || chartData.candles || [];
      if (allCandles.length > 0) {
        console.log(`📊 Wave time range: ${new Date(waveStart * 1000).toISOString()} to ${new Date(waveEnd * 1000).toISOString()}`);
        console.log(`📊 Candle time range: ${new Date(allCandles[0].time * 1000).toISOString()} to ${new Date(allCandles[allCandles.length - 1].time * 1000).toISOString()}`);
      }
      
      const filteredCandles = allCandles.filter((c: any) => 
        c.time >= (waveStart - buffer) && c.time <= (waveEnd + buffer)
      );
      
      console.log(`📈 Filtered ${filteredCandles.length} candles from ${chartData.count} total (${lowerTimeframe} timeframe)`);
      
      if (filteredCandles.length < 10) {
        return res.status(400).json({ 
          error: 'Insufficient data', 
          message: `Only ${filteredCandles.length} candles available for the selected time range. Need at least 10 for pivot detection.` 
        });
      }
      
      // Use adaptive pivot detection - dynamically adjusts lookback based on candle count
      const { pivots, lookback, iterations } = calculateAdaptivePivots(filteredCandles, 120, 200);
      console.log(`🔄 Adaptive pivot detection: lookback=${lookback}, pivots=${pivots.length}, iterations=${iterations}`);
      
      // Get degree one level lower
      const degreeOrder = ['Grand Super Cycle', 'Super Cycle', 'Cycle', 'Primary', 'Intermediate', 'Minor', 'Minute', 'Minuette', 'Sub-Minuette'];
      const currentDegreeIdx = degreeOrder.indexOf(selectedWave.degree);
      const lowerDegree = currentDegreeIdx >= 0 && currentDegreeIdx < degreeOrder.length - 1 
        ? degreeOrder[currentDegreeIdx + 1] 
        : 'Minor';
      
      // Check if we have any pivots
      if (pivots.length === 0) {
        return res.status(400).json({ 
          error: 'No pivots detected', 
          message: `Could not detect any swing highs/lows in the ${filteredCandles.length} candles. Try a different timeframe or wave selection.` 
        });
      }
      
      // Send ALL pivots to the AI (no sampling - we need complete price coverage)
      const pivotSummary = pivots.map((p, i) => ({
        seq: i + 1,
        type: p.type,
        price: parseFloat(p.price.toFixed(6)),
        date: new Date(p.time * 1000).toISOString().slice(0, 16),
      }));
      
      // Find price extremes for anchoring (use parent wave bounds as fallback)
      const priceHigh = pivots.length > 0 ? Math.max(...pivots.map(p => p.price)) : (selectedWave.endPrice || 0);
      const priceLow = pivots.length > 0 ? Math.min(...pivots.map(p => p.price)) : (selectedWave.startPrice || 0);
      
      console.log(`📊 Sending ${pivotSummary.length} pivots to AI (price range: $${priceLow.toFixed(4)} - $${priceHigh.toFixed(4)})`);
      
      // Build the detailed analysis prompt
      const prompt = `You are an Elliott Wave expert analyzing a specific wave segment to identify its INTERNAL sub-wave structure using high-resolution price data.

=== PARENT WAVE CONTEXT ===
Wave being analyzed: ${selectedWave.degree} ${selectedWave.patternType} ${selectedWave.waveCount || ''}
Direction: ${selectedWave.direction || 'unknown'}
Price range: $${selectedWave.startPrice?.toFixed(6)} → $${selectedWave.endPrice?.toFixed(6)}
Time range: ${new Date(waveStart * 1000).toISOString().slice(0, 10)} to ${new Date(waveEnd * 1000).toISOString().slice(0, 10)}
Current timeframe: ${currentTimeframe}
Analysis timeframe: ${lowerTimeframe} (one level deeper for sub-wave visibility)

${priorWaveContext ? `
=== PRIOR WAVE CONTEXT ===
The wave BEFORE this one was: ${priorWaveContext.degree} ${priorWaveContext.type}
Direction: ${priorWaveContext.direction}
Price: $${priorWaveContext.startPrice?.toFixed(6)} → $${priorWaveContext.endPrice?.toFixed(6)} (${priorWaveContext.priceChange}% change)
Duration: ${priorWaveContext.durationHours} hours

Use this to understand:
- If prior was motive (5-wave), current should be corrective
- If prior was corrective (3-wave), current might be motive or next correction
- Calculate retracement depth from prior wave
` : ''}

=== HIGH-RESOLUTION PIVOT DATA (${lowerTimeframe} timeframe) ===
These are swing highs (H) and lows (L) detected within the parent wave:
${JSON.stringify(pivotSummary, null, 2)}

=== YOUR TASK ===
Analyze the pivot data to identify the INTERNAL sub-wave structure of this ${selectedWave.patternType}:

1. If the parent appears to be a MOTIVE wave (impulse/diagonal):
   - Identify 5 sub-waves (${lowerDegree} degree: i-ii-iii-iv-v or 1-2-3-4-5)
   - Check Wave 2 doesn't retrace >100% of Wave 1
   - Check Wave 3 isn't the shortest
   - Check Wave 4 doesn't overlap Wave 1 (unless diagonal)

2. If the parent appears to be a CORRECTIVE wave:
   - Identify 3 sub-waves (${lowerDegree} degree: a-b-c or w-x-y)
   - For zigzag: A and C should be 5-wave, B is 3-wave
   - For flat: All three waves are typically 3-wave
   - B should retrace 50-100% of A for flats, less for zigzags

=== RESPOND IN THIS JSON FORMAT ===
{
  "synopsis": "Brief summary of the internal structure found",
  
  "parentWaveType": "motive" or "corrective",
  
  "detectedPattern": "Impulse" or "Zigzag" or "Flat" or "Triangle" or "Diagonal" or "Complex",
  
  "subWaves": [
    {
      "label": "i" or "1" or "a" or "w",
      "degree": "${lowerDegree}",
      "type": "motive" or "corrective",
      "direction": "up" or "down",
      "startPrice": 0.000000,
      "endPrice": 0.000000,
      "startDate": "2024-01-01T00:00",
      "endDate": "2024-01-02T00:00",
      "pivotSeq": [1, 3],
      "confidence": 85,
      "reasoning": "Clear impulsive move with 5 internal waves visible"
    }
  ],
  
  "fibonacciAnalysis": [
    { "relationship": "ii/i", "value": "61.8%", "isValid": true, "note": "Typical Wave 2 retracement" },
    { "relationship": "iii/i", "value": "161.8%", "isValid": true, "note": "Extended Wave 3" }
  ],
  
  "ruleViolations": [
    { "rule": "Wave 4 overlap", "violated": false, "note": "No overlap with Wave 1" }
  ],
  
  "alternativeCount": "Could also be interpreted as a leading diagonal if waves overlap",
  
  "prediction": {
    "nextMove": "Describe what comes after this wave internally (e.g., 'Minor v in progress' or 'Complete, awaiting next wave')",
    "afterCompletion": "Once this ${selectedWave.degree} wave completes, expect a same-degree corrective response",
    "targets": ["0.5200", "0.4800"],
    "confidence": 70
  }
}

IMPORTANT: Do NOT assume this wave's position in a larger structure (e.g., don't call it "Wave 5" or "Wave C" unless you have explicit evidence from prior wave context). Only describe what you see within this wave and what immediately follows after it completes.

=== ANCHOR REQUIREMENTS ===
Parent wave starts at $${selectedWave.startPrice?.toFixed(6)} and ends at $${selectedWave.endPrice?.toFixed(6)}
Pivot data price range: $${priceLow.toFixed(6)} to $${priceHigh.toFixed(6)}

CRITICAL ANCHORING RULES:
1. Sub-wave i/1/a MUST start near the parent wave startPrice ($${selectedWave.startPrice?.toFixed(6)})
2. Sub-wave v/5/c MUST end near the parent wave endPrice ($${selectedWave.endPrice?.toFixed(6)})
3. For an UP wave: the lowest pivot should be near wave start, highest near wave end
4. For a DOWN wave: the highest pivot should be near wave start, lowest near wave end

CRITICAL DATA RULES:
1. NEVER return 0.0000 for any price - ONLY use actual prices from the pivot data above
2. Each sub-wave MUST reference specific pivots from the data (use pivotSeq to map)
3. If a sub-wave hasn't started yet, DO NOT include it (only report what you can see in the data)
4. Mark the current/in-progress wave as status: "in_progress" with the last known price
5. For each sub-wave, startPrice and endPrice MUST match actual pivot prices from the list
6. If only 2-3 sub-waves are visible so far, that's fine - report what exists, not what "should" exist
7. Include "status": "complete" or "status": "in_progress" for each sub-wave`;

      const OpenAI = (await import('openai')).default;
      const xaiClient = new OpenAI({
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY,
        timeout: 120000,
      });
      
      console.log(`🤖 Calling xAI API for detailed sub-wave analysis...`);
      const response = await xaiClient.chat.completions.create({
        model: 'grok-3-beta',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        temperature: 0.1,
      });
      console.log(`✅ Detailed analysis response received`);
      
      const content = response.choices?.[0]?.message?.content || '';
      
      // Parse JSON from response
      let analysis;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          analysis = { raw: content, parseError: 'Could not extract JSON from response' };
        }
      } catch (parseErr) {
        analysis = { raw: content, parseError: 'JSON parse failed' };
      }
      
      res.json({
        success: true,
        selectedWave: {
          degree: selectedWave.degree,
          patternType: selectedWave.patternType,
          timeframe: currentTimeframe,
        },
        analysisTimeframe: lowerTimeframe,
        pivotCount: pivots.length,
        candleCount: filteredCandles.length,
        analysis,
        rawResponse: content,
      });
    } catch (error: any) {
      console.error('Error in detailed sub-wave analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Start price monitoring service for tracked trades
  const { priceMonitorService } = await import("./services/priceMonitorService");
  priceMonitorService.start();

  // ========== ANALYTICS API ROUTES ==========
  // Log analytics event (lightweight, fire-and-forget)
  app.post("/api/analytics/event", async (req: Request, res: Response) => {
    try {
      const { eventType, eventName, eventData, page, symbol, timeframe, userTier, sessionId } = req.body;
      
      // Get user info from auth if available
      const userId = req.cryptoUser?.id || null;
      const userEmail = req.cryptoUser?.email || null;
      
      await storage.logAnalyticsEvent({
        userId,
        userEmail,
        eventType,
        eventName,
        eventData,
        page,
        symbol,
        timeframe,
        userTier,
        sessionId,
        userAgent: req.headers['user-agent'] || null,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Analytics event error:', error);
      res.json({ success: false }); // Don't fail the request for analytics
    }
  });

  // Log API usage (called internally from other routes)
  app.post("/api/analytics/api-usage", async (req: Request, res: Response) => {
    try {
      const { apiType, endpoint, symbol, interval, tokensUsed, estimatedCost, responseTime, success, errorMessage } = req.body;
      
      const userId = req.cryptoUser?.id || null;
      const userEmail = req.cryptoUser?.email || null;
      
      await storage.logApiUsage({
        userId,
        userEmail,
        apiType,
        endpoint,
        symbol,
        interval,
        tokensUsed,
        estimatedCost,
        responseTime,
        success,
        errorMessage,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('API usage log error:', error);
      res.json({ success: false });
    }
  });

  // Get analytics dashboard data (dev access only)
  app.get("/api/analytics/dashboard", async (req: Request, res: Response) => {
    try {
      // Check if user is dev (beartec@beartec.uk)
      const userEmail = req.cryptoUser?.email || '';
      const isDev = userEmail === 'beartec@beartec.uk';
      
      if (!isDev) {
        return res.status(403).json({ error: 'Dev access only' });
      }
      
      const { timeRange = '7d' } = req.query;
      
      // Calculate date range
      let startDate = new Date();
      switch(timeRange) {
        case '24h': startDate.setHours(startDate.getHours() - 24); break;
        case '7d': startDate.setDate(startDate.getDate() - 7); break;
        case '30d': startDate.setDate(startDate.getDate() - 30); break;
        case 'all': startDate = new Date(0); break; // Beginning of time
        default: startDate.setDate(startDate.getDate() - 7);
      }
      
      const data = await storage.getAnalyticsDashboard(startDate);
      res.json(data);
    } catch (error: any) {
      console.error('Analytics dashboard error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get real-time stats (dev access only)
  app.get("/api/analytics/realtime", async (req: Request, res: Response) => {
    try {
      const userEmail = req.cryptoUser?.email || '';
      const isDev = userEmail === 'beartec@beartec.uk';
      
      if (!isDev) {
        return res.status(403).json({ error: 'Dev access only' });
      }
      
      const stats = await storage.getRealtimeAnalytics();
      res.json(stats);
    } catch (error: any) {
      console.error('Realtime analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get top features/pages/symbols (dev access only)
  app.get("/api/analytics/top", async (req: Request, res: Response) => {
    try {
      const userEmail = req.cryptoUser?.email || '';
      const isDev = userEmail === 'beartec@beartec.uk';
      
      if (!isDev) {
        return res.status(403).json({ error: 'Dev access only' });
      }
      
      const { type = 'features', limit = 10 } = req.query;
      const data = await storage.getTopAnalytics(type as string, Number(limit));
      res.json(data);
    } catch (error: any) {
      console.error('Top analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get API cost breakdown (dev access only)
  app.get("/api/analytics/api-costs", async (req: Request, res: Response) => {
    try {
      const userEmail = req.cryptoUser?.email || '';
      const isDev = userEmail === 'beartec@beartec.uk';
      
      if (!isDev) {
        return res.status(403).json({ error: 'Dev access only' });
      }
      
      const { timeRange = '7d' } = req.query;
      
      let startDate = new Date();
      switch(timeRange) {
        case '24h': startDate.setHours(startDate.getHours() - 24); break;
        case '7d': startDate.setDate(startDate.getDate() - 7); break;
        case '30d': startDate.setDate(startDate.getDate() - 30); break;
        case 'all': startDate = new Date(0); break; // Beginning of time
        default: startDate.setDate(startDate.getDate() - 7);
      }
      
      const costs = await storage.getApiCostBreakdown(startDate);
      res.json(costs);
    } catch (error: any) {
      console.error('API costs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
