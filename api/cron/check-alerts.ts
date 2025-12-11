import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';

interface PriceData {
  symbol: string;
  price: number;
}

async function fetchPrices(symbols: string[]): Promise<PriceData[]> {
  const prices: PriceData[] = [];
  
  for (const symbol of symbols) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const data = await response.json();
      
      if (data.price) {
        prices.push({
          symbol,
          price: parseFloat(data.price)
        });
      }
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
    }
  }
  
  return prices;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (optional security)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    console.log('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    
    // Get all horizontal line drawings with active alerts that haven't triggered
    const activeAlerts = await sql`
      SELECT * FROM chart_drawings 
      WHERE drawing_type = 'horizontal' 
      AND (style->>'alertActive')::boolean = true 
      AND ((style->>'alertTriggered')::boolean IS NULL OR (style->>'alertTriggered')::boolean = false)
    `;

    if (activeAlerts.length === 0) {
      console.log('No active horizontal line alerts to check');
      return res.status(200).json({ message: 'No alerts to check', checked: 0 });
    }

    console.log(`Checking ${activeAlerts.length} horizontal line alerts...`);

    // Get unique symbols
    const symbolSet = new Set(activeAlerts.map((d: any) => d.symbol));
    const symbols = Array.from(symbolSet) as string[];

    // Fetch current prices
    const prices = await fetchPrices(symbols);

    let alertsSent = 0;

    for (const drawing of activeAlerts) {
      const currentPrice = prices.find(p => p.symbol === drawing.symbol)?.price;
      if (!currentPrice) {
        console.log(`No price found for ${drawing.symbol}`);
        continue;
      }

      const linePrice = drawing.coordinates?.points?.[0]?.price;
      if (!linePrice) {
        console.log(`No line price found for drawing ${drawing.id}`);
        continue;
      }

      const currentStyle = drawing.style || {};
      const lastCheckedPrice = currentStyle.lastCheckedPrice;
      const lineName = currentStyle.label || 'H-Line';

      console.log(`🔍 H-Line: ${drawing.symbol} | Line: ${linePrice} | Current: ${currentPrice} | Last: ${lastCheckedPrice}`);

      // Check if price crossed the line
      let crossed = false;
      if (lastCheckedPrice !== null && lastCheckedPrice !== undefined && Number.isFinite(lastCheckedPrice)) {
        if (lastCheckedPrice < linePrice && currentPrice >= linePrice) {
          crossed = true;
          console.log(`📈 Cross UP detected: ${lastCheckedPrice} → ${currentPrice}`);
        }
        if (lastCheckedPrice > linePrice && currentPrice <= linePrice) {
          crossed = true;
          console.log(`📉 Cross DOWN detected: ${lastCheckedPrice} → ${currentPrice}`);
        }
      }

      if (crossed) {
        console.log(`✅ Alert triggered for ${lineName} at ${linePrice}`);
        
        // Send push notification
        await sendPushNotification(sql, drawing.user_id, {
          title: `📈 Price Crossing: ${drawing.symbol}`,
          body: `Price crossing '${lineName}' at $${linePrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
          tag: `hline-${drawing.id}`,
        });

        alertsSent++;

        // Mark as triggered
        await sql`
          UPDATE chart_drawings 
          SET style = ${JSON.stringify({
            ...currentStyle,
            alertTriggered: true,
            lastCheckedPrice: currentPrice,
          })},
          updated_at = NOW()
          WHERE id = ${drawing.id}
        `;
      } else {
        // Update last checked price
        await sql`
          UPDATE chart_drawings 
          SET style = ${JSON.stringify({
            ...currentStyle,
            lastCheckedPrice: currentPrice,
          })}
          WHERE id = ${drawing.id}
        `;
      }
    }

    // ========== INDICATOR ALERTS (CCI/ADX) ==========
    const usersWithIndicatorAlerts = await sql`
      SELECT * FROM crypto_subscriptions 
      WHERE alerts_enabled = true 
      AND alert_types && ARRAY['cci', 'adx']::text[]
    `;

    console.log(`Checking indicator alerts for ${usersWithIndicatorAlerts.length} users...`);

    for (const user of usersWithIndicatorAlerts) {
      // Validate tier - CCI/ADX alerts are Intermediate+ only
      const tier = (user.tier || 'free').trim().toLowerCase();
      const allowedTiers = ['intermediate', 'pro', 'elite'];
      if (!allowedTiers.includes(tier)) {
        console.log(`Skipping user ${user.user_id} - tier ${tier} not eligible for CCI/ADX alerts`);
        continue;
      }

      if (!user.selected_tickers || user.selected_tickers.length === 0) continue;
      if (!user.alert_timeframes || user.alert_timeframes.length === 0) continue;
      if (!user.alert_types || user.alert_types.length === 0) continue;

      const hasCCI = user.alert_types.includes('cci');
      const hasADX = user.alert_types.includes('adx');

      if (!hasCCI && !hasADX) continue;

      for (const ticker of user.selected_tickers) {
        for (const timeframe of user.alert_timeframes) {
          try {
            const indicatorAlertsSent = await checkIndicatorAlertsForSymbol(
              sql, user.user_id, ticker, timeframe, hasCCI, hasADX
            );
            alertsSent += indicatorAlertsSent;
          } catch (error) {
            console.error(`Error checking indicators for ${user.user_id}/${ticker}/${timeframe}:`, error);
          }
        }
      }
    }

    // ========== ELLIOTT WAVE PROJECTION LINE ALERTS ==========
    const projectionAlerts = await sql`
      SELECT * FROM saved_projection_lines 
      WHERE alert_enabled = true 
      AND alert_triggered = false
    `;

    console.log(`Checking ${projectionAlerts.length} Elliott Wave projection alerts...`);

    // Get unique symbols from projection alerts
    const projSymbolSet = new Set(projectionAlerts.map((p: any) => p.symbol));
    const projSymbols = Array.from(projSymbolSet) as string[];
    
    // Fetch prices for projection alert symbols (if not already fetched)
    const additionalSymbols = projSymbols.filter(s => !symbols.includes(s));
    if (additionalSymbols.length > 0) {
      const additionalPrices = await fetchPrices(additionalSymbols);
      prices.push(...additionalPrices);
    }

    for (const projection of projectionAlerts) {
      const currentPrice = prices.find(p => p.symbol === projection.symbol)?.price;
      if (!currentPrice) {
        console.log(`No price found for projection ${projection.symbol}`);
        continue;
      }

      const targetPrice = projection.price;
      const levelLabel = projection.level_label || 'Target';

      console.log(`🔍 Elliott: ${projection.symbol} | Target: ${targetPrice} | Current: ${currentPrice}`);

      // Check if price hit the target (within 0.1% tolerance for precision)
      const tolerance = targetPrice * 0.001; // 0.1%
      const priceHit = Math.abs(currentPrice - targetPrice) <= tolerance ||
                       (currentPrice >= targetPrice && projection.wave_type === 'impulse') ||
                       (currentPrice <= targetPrice && projection.wave_type === 'correction');

      // For Elliott waves, also detect crossing through the level
      let crossed = false;
      if (projection.last_checked_price !== null && projection.last_checked_price !== undefined) {
        if (projection.last_checked_price < targetPrice && currentPrice >= targetPrice) {
          crossed = true;
        }
        if (projection.last_checked_price > targetPrice && currentPrice <= targetPrice) {
          crossed = true;
        }
      }

      if (crossed || priceHit) {
        console.log(`✅ Elliott Wave alert triggered: ${levelLabel} at ${targetPrice}`);

        await sendPushNotification(sql, projection.user_id, {
          title: `🌊 Elliott Wave Target: ${projection.symbol}`,
          body: `Price reached ${levelLabel} at $${targetPrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
          tag: `elliott-${projection.id}`,
        });

        alertsSent++;

        // Mark as triggered and store last checked price
        await sql`
          UPDATE saved_projection_lines 
          SET alert_triggered = true,
              last_checked_price = ${currentPrice}
          WHERE id = ${projection.id}
        `;
      } else {
        // Update last checked price
        await sql`
          UPDATE saved_projection_lines 
          SET last_checked_price = ${currentPrice}
          WHERE id = ${projection.id}
        `;
      }
    }

    return res.status(200).json({ 
      message: 'Alerts checked', 
      hLineChecked: activeAlerts.length,
      indicatorUsersChecked: usersWithIndicatorAlerts.length,
      elliottChecked: projectionAlerts.length,
      alertsSent 
    });
  } catch (error: any) {
    console.error('Error checking alerts:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendPushNotification(
  sql: any, 
  userId: string, 
  notification: { title: string; body: string; tag: string }
) {
  try {
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    const privateKey = process.env.PRIVATE_VAPID_KEY;

    if (!publicKey || !privateKey) {
      console.log('VAPID keys not configured');
      return;
    }

    webpush.setVapidDetails('mailto:support@beartec.uk', publicKey, privateKey);

    // Get user's push subscriptions
    const subscriptions = await sql`
      SELECT * FROM push_subscriptions WHERE user_id = ${userId}
    `;

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      icon: '/icon.png',
      badge: '/badge.png',
    });

    for (const sub of subscriptions) {
      try {
        const parsedSub = typeof sub.subscription === 'string' 
          ? JSON.parse(sub.subscription) 
          : sub.subscription;

        await webpush.sendNotification(parsedSub, payload);
        console.log(`✅ Push sent to subscription ${sub.id}`);
      } catch (error: any) {
        console.error(`Failed to send push to ${sub.id}:`, error.message);
        // If subscription is invalid, we could delete it here
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`Deleting invalid subscription ${sub.id}`);
          await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`;
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// ========== INDICATOR ALERT FUNCTIONS ==========

async function checkIndicatorAlertsForSymbol(
  sql: any,
  userId: string,
  symbol: string,
  timeframe: string,
  checkCCI: boolean,
  checkADX: boolean
): Promise<number> {
  let alertsSent = 0;

  // Fetch candle data
  const candles = await fetchCandleData(symbol, timeframe);
  if (candles.length < 50) return 0;

  // Calculate indicators
  let cciValues: number[] = [];
  let adxValues: { adx: number; plusDI: number; minusDI: number }[] = [];

  if (checkCCI) {
    cciValues = calculateCCI(candles, 20);
  }
  if (checkADX) {
    adxValues = calculateADX(candles, 14);
  }

  // Get last known state
  const lastStates = await sql`
    SELECT * FROM indicator_alert_state 
    WHERE user_id = ${userId} AND symbol = ${symbol} AND timeframe = ${timeframe}
    LIMIT 1
  `;
  const lastState = lastStates.length > 0 ? lastStates[0] : null;

  const currentCCI = checkCCI && cciValues.length > 0 ? cciValues[cciValues.length - 1] : null;
  const currentADX = checkADX && adxValues.length > 0 ? adxValues[adxValues.length - 1] : null;

  // Check CCI alerts
  if (checkCCI && currentCCI !== null && lastState?.last_cci !== null && lastState?.last_cci !== undefined) {
    const lastCCI = parseFloat(lastState.last_cci);
    if (Number.isFinite(lastCCI)) {
      // CCI crossed above +100 (overbought)
      if (lastCCI <= 100 && currentCCI > 100) {
        await sendPushNotification(sql, userId, {
          title: `🔴 CCI Overbought: ${symbol}`,
          body: `${timeframe} CCI crossed above +100 (${currentCCI.toFixed(2)}).`,
          tag: `cci-ob-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // CCI crossed below -100 (oversold)
      if (lastCCI >= -100 && currentCCI < -100) {
        await sendPushNotification(sql, userId, {
          title: `🟢 CCI Oversold: ${symbol}`,
          body: `${timeframe} CCI crossed below -100 (${currentCCI.toFixed(2)}).`,
          tag: `cci-os-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // CCI crossed above 0 (bullish momentum)
      if (lastCCI <= 0 && currentCCI > 0) {
        await sendPushNotification(sql, userId, {
          title: `📈 CCI Bullish: ${symbol}`,
          body: `${timeframe} CCI crossed above 0. Bullish momentum.`,
          tag: `cci-bull-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // CCI crossed below 0 (bearish momentum)
      if (lastCCI >= 0 && currentCCI < 0) {
        await sendPushNotification(sql, userId, {
          title: `📉 CCI Bearish: ${symbol}`,
          body: `${timeframe} CCI crossed below 0. Bearish momentum.`,
          tag: `cci-bear-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
    }
  }

  // Check ADX alerts
  if (checkADX && currentADX && lastState?.last_adx !== null && lastState?.last_plus_di !== null && lastState?.last_minus_di !== null) {
    const lastADX = parseFloat(lastState.last_adx);
    const lastPlusDI = parseFloat(lastState.last_plus_di);
    const lastMinusDI = parseFloat(lastState.last_minus_di);

    if (Number.isFinite(lastADX) && Number.isFinite(lastPlusDI) && Number.isFinite(lastMinusDI)) {
      // ADX crossed above 25 (strong trend)
      if (lastADX <= 25 && currentADX.adx > 25) {
        await sendPushNotification(sql, userId, {
          title: `💪 Strong Trend: ${symbol}`,
          body: `${timeframe} ADX crossed above 25 (${currentADX.adx.toFixed(2)}). Strong trend developing.`,
          tag: `adx-strong-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // ADX crossed below 20 (ranging)
      if (lastADX >= 20 && currentADX.adx < 20) {
        await sendPushNotification(sql, userId, {
          title: `📊 Ranging Market: ${symbol}`,
          body: `${timeframe} ADX dropped below 20 (${currentADX.adx.toFixed(2)}). Market is ranging.`,
          tag: `adx-weak-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // +DI/-DI bullish crossover
      if (lastPlusDI <= lastMinusDI && currentADX.plusDI > currentADX.minusDI) {
        await sendPushNotification(sql, userId, {
          title: `🟢 Bullish Crossover: ${symbol}`,
          body: `${timeframe} +DI crossed above -DI. Bullish directional change.`,
          tag: `adx-di-bull-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      // +DI/-DI bearish crossover
      if (lastPlusDI >= lastMinusDI && currentADX.plusDI < currentADX.minusDI) {
        await sendPushNotification(sql, userId, {
          title: `🔴 Bearish Crossover: ${symbol}`,
          body: `${timeframe} -DI crossed above +DI. Bearish directional change.`,
          tag: `adx-di-bear-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
    }
  }

  // Update state in database
  if (lastState) {
    await sql`
      UPDATE indicator_alert_state SET
        last_cci = ${currentCCI?.toString() || null},
        last_adx = ${currentADX?.adx.toString() || null},
        last_plus_di = ${currentADX?.plusDI.toString() || null},
        last_minus_di = ${currentADX?.minusDI.toString() || null},
        updated_at = NOW()
      WHERE user_id = ${userId} AND symbol = ${symbol} AND timeframe = ${timeframe}
    `;
  } else {
    await sql`
      INSERT INTO indicator_alert_state (user_id, symbol, timeframe, last_cci, last_adx, last_plus_di, last_minus_di)
      VALUES (${userId}, ${symbol}, ${timeframe}, ${currentCCI?.toString() || null}, ${currentADX?.adx.toString() || null}, ${currentADX?.plusDI.toString() || null}, ${currentADX?.minusDI.toString() || null})
    `;
  }

  return alertsSent;
}

async function fetchCandleData(symbol: string, timeframe: string): Promise<any[]> {
  const intervalMap: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d'
  };
  const interval = intervalMap[timeframe] || '15m';

  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error) {
    console.error(`Error fetching candles for ${symbol}:`, error);
    return [];
  }
}

// CCI Calculation
function calculateCCI(candles: any[], period: number = 20): number[] {
  const results: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const typicalPrices = slice.map(c => (c.high + c.low + c.close) / 3);
    const sma = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
    const cci = meanDeviation !== 0 ? (typicalPrices[typicalPrices.length - 1] - sma) / (0.015 * meanDeviation) : 0;
    results.push(cci);
  }
  return results;
}

// ADX Calculation
function calculateADX(candles: any[], period: number = 14): { adx: number; plusDI: number; minusDI: number }[] {
  const results: { adx: number; plusDI: number; minusDI: number }[] = [];
  if (candles.length < period * 2) return results;

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed values
  const smoothedTR: number[] = [];
  const smoothedPlusDM: number[] = [];
  const smoothedMinusDM: number[] = [];

  let sumTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sumPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  smoothedTR.push(sumTR);
  smoothedPlusDM.push(sumPlusDM);
  smoothedMinusDM.push(sumMinusDM);

  for (let i = period; i < tr.length; i++) {
    sumTR = sumTR - sumTR / period + tr[i];
    sumPlusDM = sumPlusDM - sumPlusDM / period + plusDM[i];
    sumMinusDM = sumMinusDM - sumMinusDM / period + minusDM[i];
    smoothedTR.push(sumTR);
    smoothedPlusDM.push(sumPlusDM);
    smoothedMinusDM.push(sumMinusDM);
  }

  // DI values
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];

  for (let i = 0; i < smoothedTR.length; i++) {
    const pdi = smoothedTR[i] !== 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
    const mdi = smoothedTR[i] !== 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);
    dx.push(pdi + mdi !== 0 ? (Math.abs(pdi - mdi) / (pdi + mdi)) * 100 : 0);
  }

  // ADX (smoothed DX)
  if (dx.length >= period) {
    let adxSum = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) {
      adxSum = ((adxSum * (period - 1)) + dx[i]) / period;
      results.push({
        adx: adxSum,
        plusDI: plusDI[i],
        minusDI: minusDI[i]
      });
    }
  }

  return results;
}
