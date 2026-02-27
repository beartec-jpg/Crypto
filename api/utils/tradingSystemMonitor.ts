/**
 * Trading System Alert Monitor
 * Monitors active trading systems and sends alerts when entry conditions are met
 */

import { evaluateTradingSystemConditions, formatTradingSystemNotification, type IndicatorValues } from './tradingSystemEvaluator.js';

interface PriceData {
  symbol: string;
  price: number;
}

interface TradingSystemCheckResult {
  systemsChecked: number;
  alertsSent: number;
}

/**
 * Helper to fetch candle data from Binance (simple version for indicator calculation)
 */
async function fetchCandles(symbol: string, timeframe: string, limit: number = 100): Promise<any[]> {
  try {
    const binanceTimeframe = timeframe === '1m' ? '1m' 
      : timeframe === '5m' ? '5m'
      : timeframe === '15m' ? '15m'
      : timeframe === '1h' ? '1h'
      : timeframe === '4h' ? '4h'
      : timeframe === '1d' ? '1d'
      : '1h';
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceTimeframe}&limit=${limit}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    
    if (!response.ok) {
      console.error(`Failed to fetch candles for ${symbol}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.map((k: any) => ({
      time: parseInt(k[0]) / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error: any) {
    console.error(`Error fetching candles for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Calculate simple indicators from candle data
 */
function calculateIndicators(candles: any[]): Partial<IndicatorValues> {
  if (candles.length < 50) return {};
  
  const indicators: Partial<IndicatorValues> = {
    price: candles[candles.length - 1].close,
    prevPrice: candles[candles.length - 2]?.close,
    volume: candles[candles.length - 1].volume
  };
  
  // Calculate RSI (14 period)
  const rsiPeriod = 14;
  if (candles.length >= rsiPeriod + 1) {
    let gains = 0, losses = 0;
    for (let i = candles.length - rsiPeriod; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    indicators.rsi = 100 - (100 / (1 + rs));
  }
  
  // Calculate EMA (9, 21, 50, 200)
  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  
  if (ema9) indicators.ema9 = ema9;
  if (ema21) indicators.ema21 = ema21;
  if (ema50) indicators.ema50 = ema50;
  if (ema200) indicators.ema200 = ema200;
  
  // Calculate MACD (12, 26, 9)
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  if (ema12 && ema26) {
    const macd = ema12 - ema26;
    indicators.macd = macd;
    
    // Calculate signal line (9-period EMA of MACD)
    const macdLine: number[] = [];
    for (let i = 26; i < candles.length; i++) {
      const e12 = calculateEMAAt(candles, 12, i);
      const e26 = calculateEMAAt(candles, 26, i);
      if (e12 && e26) macdLine.push(e12 - e26);
    }
    if (macdLine.length >= 9) {
      indicators.macdSignal = calculateEMAFromValues(macdLine, 9);
      indicators.macdHistogram = macd - (indicators.macdSignal || 0);
    }
  }
  
  // Calculate ADX (14 period)
  if (candles.length >= 28) {
    const atrValues: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevHigh = candles[i - 1].high;
      const prevLow = candles[i - 1].low;
      const prevClose = candles[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrValues.push(tr);
      
      const upMove = high - prevHigh;
      const downMove = prevLow - low;
      
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    
    if (atrValues.length >= 14) {
      const avgTR = atrValues.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const avgPlusDM = plusDM.slice(-14).reduce((a, b) => a + b, 0) / 14;
      const avgMinusDM = minusDM.slice(-14).reduce((a, b) => a + b, 0) / 14;
      
      const plusDI = (avgPlusDM / avgTR) * 100;
      const minusDI = (avgMinusDM / avgTR) * 100;
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      
      indicators.plusDI = plusDI;
      indicators.minusDI = minusDI;
      indicators.adx = dx; // Simplified ADX (should be smoothed, but good enough)
      indicators.atr = avgTR;
    }
  }
  
  // Calculate volume average
  if (candles.length >= 20 && indicators.volume !== undefined) {
    const volumeSum = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0);
    indicators.avgVolume = volumeSum / 20;
    indicators.volumeRatio = indicators.volume / indicators.avgVolume;
  }
  
  // Calculate VWAP (daily)
  let vwapSum = 0;
  let volumeSum = 0;
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    vwapSum += typicalPrice * candle.volume;
    volumeSum += candle.volume;
  }
  if (volumeSum > 0) {
    indicators.vwap = vwapSum / volumeSum;
  }
  
  return indicators;
}

function calculateEMA(candles: any[], period: number): number | undefined {
  if (candles.length < period) return undefined;
  
  // Calculate SMA for first EMA value
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  
  // Calculate EMA
  const multiplier = 2 / (period + 1);
  for (let i = candles.length - period + 1; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateEMAAt(candles: any[], period: number, endIndex: number): number | undefined {
  if (endIndex < period) return undefined;
  
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (i >= 0) sum += candles[i].close;
  }
  let ema = sum / period;
  
  const multiplier = 2 / (period + 1);
  for (let i = endIndex - period + 2; i <= endIndex; i++) {
    if (i >= 0) ema = (candles[i].close - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateEMAFromValues(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  let ema = sum / period;
  
  const multiplier = 2 / (period + 1);
  for (let i = values.length - period + 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Main function to check all active trading system alerts
 */
export async function checkTradingSystemAlerts(
  sql: any,
  priceData: PriceData[]
): Promise<TradingSystemCheckResult> {
  let systemsChecked = 0;
  let alertsSent = 0;
  
  try {
    // Get all active trading system alerts
    const activeSystemAlerts = await sql`
      SELECT * FROM trading_system_alerts 
      WHERE active = true
    `;

    console.log(`📊 Checking ${activeSystemAlerts.length} active trading system alerts...`);
    systemsChecked = activeSystemAlerts.length;

    for (const systemAlert of activeSystemAlerts) {
      try {
        const currentPrice = priceData.find(p => p.symbol === systemAlert.symbol)?.price;
        if (!currentPrice) {
          console.log(`⚠️ No price data for ${systemAlert.symbol}`);
          continue;
        }

        // Fetch candles for indicator calculation
        const candles = await fetchCandles(systemAlert.symbol, systemAlert.timeframe, 200);
        if (candles.length < 50) {
          console.log(`⚠️ Insufficient candle data for ${systemAlert.symbol}`);
          continue;
        }

        // Calculate current indicator values
        const currentIndicators = calculateIndicators(candles);
        
        // Get last known state for cross detection
        const lastState = systemAlert.last_indicator_state || {};

        // Evaluate conditions
        const result = evaluateTradingSystemConditions(
          systemAlert.active_conditions,
          currentIndicators as IndicatorValues,
          lastState
        );

        if (result.triggered && result.triggeredConditions.length > 0) {
          console.log(`✅ Trading system alert triggered: ${systemAlert.system_name} on ${systemAlert.symbol}`);
          console.log(`   Conditions: ${result.triggeredConditions.join(', ')}`);

          // Format and send notification
          const notification = formatTradingSystemNotification(
            systemAlert.system_name,
            systemAlert.symbol,
            result,
            currentPrice
          );

          // Import push/SMS functions dynamically
          const { default: checkAlertsHandler } = await import('../cron/check-alerts.js');
          const sendPush = (checkAlertsHandler as any).sendPushNotification;
          const sendSMS = (checkAlertsHandler as any).sendSMSNotification;

          if (sendPush) {
            await sendPush(sql, systemAlert.user_id, {
              title: notification.title,
              body: notification.body,
              tag: `trading-system-${systemAlert.id}`
            });
          }

          if (sendSMS) {
            await sendSMS(sql, systemAlert.user_id, {
              title: notification.title,
              body: notification.body,
              tag: `trading-system-${systemAlert.id}`
            });
          }

          alertsSent++;

          // Deactivate alert after triggering (user can reactivate)
          await sql`
            UPDATE trading_system_alerts 
            SET active = false,
                last_checked = NOW(),
                last_indicator_state = ${JSON.stringify(currentIndicators)}
            WHERE id = ${systemAlert.id}
          `;
        } else {
          // Update last state
          await sql`
            UPDATE trading_system_alerts 
            SET last_checked = NOW(),
                last_indicator_state = ${JSON.stringify(currentIndicators)}
            WHERE id = ${systemAlert.id}
          `;
        }
      } catch (error: any) {
        console.error(`Error checking system alert ${systemAlert.id}:`, error.message);
      }
    }

    return { systemsChecked, alertsSent };
  } catch (error: any) {
    console.error('Error in checkTradingSystemAlerts:', error.message);
    return { systemsChecked, alertsSent };
  }
}
