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

    // ========== AI TRACKED TRADE ALERTS ==========
    const activeTrades = await sql`
      SELECT * FROM tracked_trades 
      WHERE status IN ('pending', 'entry_hit')
    `;

    console.log(`Checking ${activeTrades.length} AI tracked trades...`);

    // Get unique symbols from trades
    const tradeSymbolSet = new Set(activeTrades.map((t: any) => t.symbol));
    const tradeSymbols = Array.from(tradeSymbolSet) as string[];

    // Fetch prices for trade symbols
    const tradePrices = await fetchPrices(tradeSymbols);

    for (const trade of activeTrades) {
      const currentPrice = tradePrices.find(p => p.symbol === trade.symbol)?.price;
      if (!currentPrice) continue;

      const entry = parseFloat(trade.entry);
      const stopLoss = parseFloat(trade.stop_loss);
      const targets = trade.targets?.map((t: string) => parseFloat(t)) || [];

      if (!entry || !stopLoss || targets.length === 0) continue;

      const isLong = trade.direction === 'LONG';

      // Check entry hit (for pending trades)
      if (trade.status === 'pending') {
        const entryHit = isLong ? currentPrice <= entry : currentPrice >= entry;

        if (entryHit) {
          await sql`
            UPDATE tracked_trades 
            SET status = 'entry_hit', entry_hit_at = NOW()
            WHERE id = ${trade.id}
          `;
          await sendPushNotification(sql, trade.user_id, {
            title: `🎯 Entry Hit: ${trade.symbol}`,
            body: `${trade.direction} entry at $${entry.toFixed(4)} hit! Current: $${currentPrice.toFixed(4)}`,
            tag: `entry-${trade.id}`,
          });
          alertsSent++;
          console.log(`✅ Entry hit for trade ${trade.id}`);
          continue;
        }
      }

      // Check SL/TP for entry_hit trades
      if (trade.status === 'entry_hit') {
        const slHit = isLong ? currentPrice <= stopLoss : currentPrice >= stopLoss;

        if (slHit) {
          await sql`
            UPDATE tracked_trades 
            SET status = 'sl_hit', sl_hit_at = NOW()
            WHERE id = ${trade.id}
          `;
          await sendPushNotification(sql, trade.user_id, {
            title: `🛑 Stop Loss Hit: ${trade.symbol}`,
            body: `${trade.direction} SL at $${stopLoss.toFixed(4)} hit. Current: $${currentPrice.toFixed(4)}`,
            tag: `sl-${trade.id}`,
          });
          alertsSent++;
          console.log(`❌ SL hit for trade ${trade.id}`);
          continue;
        }

        // Check targets
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const tpHit = isLong ? currentPrice >= target : currentPrice <= target;

          if (tpHit) {
            await sql`
              UPDATE tracked_trades 
              SET status = 'tp_hit', tp_hit_at = NOW(), tp_hit_level = ${i + 1}
              WHERE id = ${trade.id}
            `;
            await sendPushNotification(sql, trade.user_id, {
              title: `🎉 Target ${i + 1} Hit: ${trade.symbol}`,
              body: `${trade.direction} TP${i + 1} at $${target.toFixed(4)} hit! Current: $${currentPrice.toFixed(4)}`,
              tag: `tp-${trade.id}`,
            });
            alertsSent++;
            console.log(`✅ TP${i + 1} hit for trade ${trade.id}`);
            break;
          }
        }
      }
    }

    // ========== INDICATOR ALERTS (All Types) ==========
    const usersWithIndicatorAlerts = await sql`
      SELECT * FROM crypto_subscriptions 
      WHERE alerts_enabled = true 
      AND array_length(alert_types, 1) > 0
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

      for (const ticker of user.selected_tickers) {
        for (const timeframe of user.alert_timeframes) {
          try {
            const indicatorAlertsSent = await checkAllIndicatorAlerts(
              sql, user.user_id, ticker, timeframe, user.alert_types, user.tier
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
      aiTradesChecked: activeTrades.length,
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

// ========== ALL INDICATOR ALERT FUNCTIONS ==========

async function checkAllIndicatorAlerts(
  sql: any,
  userId: string,
  symbol: string,
  timeframe: string,
  alertTypes: string[],
  tier: string
): Promise<number> {
  let alertsSent = 0;

  // Fetch candle data
  const candles = await fetchCandleData(symbol, timeframe);
  if (candles.length < 50) return 0;

  // Get last known state
  const lastStates = await sql`
    SELECT * FROM indicator_alert_state 
    WHERE user_id = ${userId} AND symbol = ${symbol} AND timeframe = ${timeframe}
    LIMIT 1
  `;
  const lastState = lastStates.length > 0 ? lastStates[0] : null;

  // Calculate all needed indicators based on alertTypes
  const indicators: any = {};
  
  if (alertTypes.includes('cci')) {
    indicators.cci = calculateCCI(candles, 20);
  }
  if (alertTypes.includes('adx')) {
    indicators.adx = calculateADX(candles, 14);
  }
  if (alertTypes.includes('rsi_divergence') || alertTypes.includes('rsi_overbought')) {
    indicators.rsi = calculateRSI(candles, 14);
  }
  if (alertTypes.includes('macd_crossover')) {
    indicators.macd = calculateMACD(candles, 12, 26, 9);
  }
  if (alertTypes.includes('stoch_cross')) {
    indicators.stoch = calculateStochastic(candles, 14, 3, 3);
  }
  if (alertTypes.includes('ema_cross')) {
    indicators.ema9 = calculateEMA(candles, 9);
    indicators.ema21 = calculateEMA(candles, 21);
  }
  if (alertTypes.includes('vwap_cross')) {
    indicators.vwap = calculateVWAP(candles);
  }
  if (alertTypes.includes('volume_spike')) {
    indicators.volumeAvg = calculateVolumeAverage(candles, 20);
  }
  if (alertTypes.includes('engulfing')) {
    indicators.engulfing = detectEngulfing(candles);
  }
  if (alertTypes.includes('hammer_star')) {
    indicators.hammerStar = detectHammerStar(candles);
  }

  // ========== CCI Alerts ==========
  if (alertTypes.includes('cci') && indicators.cci?.length > 0) {
    const currentCCI = indicators.cci[indicators.cci.length - 1];
    if (lastState?.last_cci !== null && lastState?.last_cci !== undefined) {
      const lastCCI = parseFloat(lastState.last_cci);
      if (Number.isFinite(lastCCI)) {
        if (lastCCI <= 100 && currentCCI > 100) {
          await sendPushNotification(sql, userId, {
            title: `🔴 CCI Overbought: ${symbol}`,
            body: `${timeframe} CCI crossed above +100 (${currentCCI.toFixed(2)}).`,
            tag: `cci-ob-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastCCI >= -100 && currentCCI < -100) {
          await sendPushNotification(sql, userId, {
            title: `🟢 CCI Oversold: ${symbol}`,
            body: `${timeframe} CCI crossed below -100 (${currentCCI.toFixed(2)}).`,
            tag: `cci-os-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentCCI = currentCCI;
  }

  // ========== ADX Alerts ==========
  if (alertTypes.includes('adx') && indicators.adx?.length > 0) {
    const currentADX = indicators.adx[indicators.adx.length - 1];
    if (lastState?.last_adx !== null && lastState?.last_plus_di !== null && lastState?.last_minus_di !== null) {
      const lastADX = parseFloat(lastState.last_adx);
      const lastPlusDI = parseFloat(lastState.last_plus_di);
      const lastMinusDI = parseFloat(lastState.last_minus_di);
      
      if (Number.isFinite(lastADX)) {
        if (lastADX <= 25 && currentADX.adx > 25) {
          await sendPushNotification(sql, userId, {
            title: `💪 Strong Trend: ${symbol}`,
            body: `${timeframe} ADX crossed above 25. Strong trend developing.`,
            tag: `adx-strong-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastPlusDI <= lastMinusDI && currentADX.plusDI > currentADX.minusDI) {
          await sendPushNotification(sql, userId, {
            title: `🟢 Bullish DI Cross: ${symbol}`,
            body: `${timeframe} +DI crossed above -DI.`,
            tag: `adx-bull-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastPlusDI >= lastMinusDI && currentADX.plusDI < currentADX.minusDI) {
          await sendPushNotification(sql, userId, {
            title: `🔴 Bearish DI Cross: ${symbol}`,
            body: `${timeframe} -DI crossed above +DI.`,
            tag: `adx-bear-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentADX = currentADX;
  }

  // ========== RSI Alerts ==========
  if (alertTypes.includes('rsi_overbought') && indicators.rsi?.length > 0) {
    const currentRSI = indicators.rsi[indicators.rsi.length - 1];
    if (lastState?.last_rsi !== null && lastState?.last_rsi !== undefined) {
      const lastRSI = parseFloat(lastState.last_rsi);
      if (Number.isFinite(lastRSI)) {
        if (lastRSI <= 70 && currentRSI > 70) {
          await sendPushNotification(sql, userId, {
            title: `🔴 RSI Overbought: ${symbol}`,
            body: `${timeframe} RSI entered overbought zone (${currentRSI.toFixed(2)}).`,
            tag: `rsi-ob-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastRSI >= 30 && currentRSI < 30) {
          await sendPushNotification(sql, userId, {
            title: `🟢 RSI Oversold: ${symbol}`,
            body: `${timeframe} RSI entered oversold zone (${currentRSI.toFixed(2)}).`,
            tag: `rsi-os-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentRSI = currentRSI;
  }

  // ========== MACD Alerts ==========
  if (alertTypes.includes('macd_crossover') && indicators.macd?.length > 0) {
    const currentMACD = indicators.macd[indicators.macd.length - 1];
    if (lastState?.last_macd !== null && lastState?.last_macd_signal !== null) {
      const lastMACD = parseFloat(lastState.last_macd);
      const lastSignal = parseFloat(lastState.last_macd_signal);
      if (Number.isFinite(lastMACD) && Number.isFinite(lastSignal)) {
        const wasBearish = lastMACD < lastSignal;
        const isBullish = currentMACD.macd > currentMACD.signal;
        if (wasBearish && isBullish) {
          await sendPushNotification(sql, userId, {
            title: `🟢 MACD Bullish Cross: ${symbol}`,
            body: `${timeframe} MACD crossed above signal line.`,
            tag: `macd-bull-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        const wasBullish = lastMACD > lastSignal;
        const isBearish = currentMACD.macd < currentMACD.signal;
        if (wasBullish && isBearish) {
          await sendPushNotification(sql, userId, {
            title: `🔴 MACD Bearish Cross: ${symbol}`,
            body: `${timeframe} MACD crossed below signal line.`,
            tag: `macd-bear-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentMACD = currentMACD;
  }

  // ========== Stochastic Alerts ==========
  if (alertTypes.includes('stoch_cross') && indicators.stoch?.length > 0) {
    const currentStoch = indicators.stoch[indicators.stoch.length - 1];
    if (lastState?.last_stoch_k !== null && lastState?.last_stoch_d !== null) {
      const lastK = parseFloat(lastState.last_stoch_k);
      const lastD = parseFloat(lastState.last_stoch_d);
      if (Number.isFinite(lastK) && Number.isFinite(lastD)) {
        if (lastK < lastD && currentStoch.k > currentStoch.d && currentStoch.k < 20) {
          await sendPushNotification(sql, userId, {
            title: `🟢 Stoch Bullish Cross: ${symbol}`,
            body: `${timeframe} Stochastic bullish crossover in oversold zone.`,
            tag: `stoch-bull-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastK > lastD && currentStoch.k < currentStoch.d && currentStoch.k > 80) {
          await sendPushNotification(sql, userId, {
            title: `🔴 Stoch Bearish Cross: ${symbol}`,
            body: `${timeframe} Stochastic bearish crossover in overbought zone.`,
            tag: `stoch-bear-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentStoch = currentStoch;
  }

  // ========== EMA Cross Alerts ==========
  if (alertTypes.includes('ema_cross') && indicators.ema9?.length > 0 && indicators.ema21?.length > 0) {
    const currentEMA9 = indicators.ema9[indicators.ema9.length - 1];
    const currentEMA21 = indicators.ema21[indicators.ema21.length - 1];
    if (lastState?.last_ema9 !== null && lastState?.last_ema21 !== null) {
      const lastEMA9 = parseFloat(lastState.last_ema9);
      const lastEMA21 = parseFloat(lastState.last_ema21);
      if (Number.isFinite(lastEMA9) && Number.isFinite(lastEMA21)) {
        if (lastEMA9 < lastEMA21 && currentEMA9 > currentEMA21) {
          await sendPushNotification(sql, userId, {
            title: `🟢 EMA Bullish Cross: ${symbol}`,
            body: `${timeframe} EMA 9 crossed above EMA 21.`,
            tag: `ema-bull-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
        if (lastEMA9 > lastEMA21 && currentEMA9 < currentEMA21) {
          await sendPushNotification(sql, userId, {
            title: `🔴 EMA Bearish Cross: ${symbol}`,
            body: `${timeframe} EMA 9 crossed below EMA 21.`,
            tag: `ema-bear-${symbol}-${timeframe}`,
          });
          alertsSent++;
        }
      }
    }
    indicators.currentEMA9 = currentEMA9;
    indicators.currentEMA21 = currentEMA21;
  }

  // ========== VWAP Cross Alerts ==========
  if (alertTypes.includes('vwap_cross') && indicators.vwap !== null) {
    const currentPrice = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2]?.close;
    if (prevPrice && indicators.vwap) {
      if (prevPrice < indicators.vwap && currentPrice > indicators.vwap) {
        await sendPushNotification(sql, userId, {
          title: `🟢 VWAP Bullish Cross: ${symbol}`,
          body: `${timeframe} Price crossed above VWAP.`,
          tag: `vwap-bull-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
      if (prevPrice > indicators.vwap && currentPrice < indicators.vwap) {
        await sendPushNotification(sql, userId, {
          title: `🔴 VWAP Bearish Cross: ${symbol}`,
          body: `${timeframe} Price crossed below VWAP.`,
          tag: `vwap-bear-${symbol}-${timeframe}`,
        });
        alertsSent++;
      }
    }
  }

  // ========== Volume Spike Alerts ==========
  if (alertTypes.includes('volume_spike') && indicators.volumeAvg) {
    const currentVolume = candles[candles.length - 1].volume;
    if (currentVolume > indicators.volumeAvg * 2) {
      await sendPushNotification(sql, userId, {
        title: `📊 Volume Spike: ${symbol}`,
        body: `${timeframe} Volume is ${(currentVolume / indicators.volumeAvg).toFixed(1)}x average!`,
        tag: `vol-spike-${symbol}-${timeframe}`,
      });
      alertsSent++;
    }
  }

  // ========== Engulfing Pattern Alerts ==========
  if (alertTypes.includes('engulfing') && indicators.engulfing) {
    if (indicators.engulfing === 'bullish') {
      await sendPushNotification(sql, userId, {
        title: `🟢 Bullish Engulfing: ${symbol}`,
        body: `${timeframe} Bullish engulfing pattern detected!`,
        tag: `engulf-bull-${symbol}-${timeframe}`,
      });
      alertsSent++;
    }
    if (indicators.engulfing === 'bearish') {
      await sendPushNotification(sql, userId, {
        title: `🔴 Bearish Engulfing: ${symbol}`,
        body: `${timeframe} Bearish engulfing pattern detected!`,
        tag: `engulf-bear-${symbol}-${timeframe}`,
      });
      alertsSent++;
    }
  }

  // ========== Hammer/Shooting Star Alerts ==========
  if (alertTypes.includes('hammer_star') && indicators.hammerStar) {
    if (indicators.hammerStar === 'hammer') {
      await sendPushNotification(sql, userId, {
        title: `🟢 Hammer Pattern: ${symbol}`,
        body: `${timeframe} Hammer reversal pattern detected!`,
        tag: `hammer-${symbol}-${timeframe}`,
      });
      alertsSent++;
    }
    if (indicators.hammerStar === 'shooting_star') {
      await sendPushNotification(sql, userId, {
        title: `🔴 Shooting Star: ${symbol}`,
        body: `${timeframe} Shooting star reversal pattern!`,
        tag: `star-${symbol}-${timeframe}`,
      });
      alertsSent++;
    }
  }

  // Update state in database with all indicator values
  const updateData: any = {};
  if (indicators.currentCCI !== undefined) updateData.last_cci = indicators.currentCCI?.toString();
  if (indicators.currentADX !== undefined) {
    updateData.last_adx = indicators.currentADX?.adx?.toString();
    updateData.last_plus_di = indicators.currentADX?.plusDI?.toString();
    updateData.last_minus_di = indicators.currentADX?.minusDI?.toString();
  }
  if (indicators.currentRSI !== undefined) updateData.last_rsi = indicators.currentRSI?.toString();
  if (indicators.currentMACD !== undefined) {
    updateData.last_macd = indicators.currentMACD?.macd?.toString();
    updateData.last_macd_signal = indicators.currentMACD?.signal?.toString();
  }
  if (indicators.currentStoch !== undefined) {
    updateData.last_stoch_k = indicators.currentStoch?.k?.toString();
    updateData.last_stoch_d = indicators.currentStoch?.d?.toString();
  }
  if (indicators.currentEMA9 !== undefined) updateData.last_ema9 = indicators.currentEMA9?.toString();
  if (indicators.currentEMA21 !== undefined) updateData.last_ema21 = indicators.currentEMA21?.toString();

  if (Object.keys(updateData).length > 0) {
    if (lastState) {
      await sql`
        UPDATE indicator_alert_state SET
          last_cci = ${updateData.last_cci || lastState.last_cci},
          last_adx = ${updateData.last_adx || lastState.last_adx},
          last_plus_di = ${updateData.last_plus_di || lastState.last_plus_di},
          last_minus_di = ${updateData.last_minus_di || lastState.last_minus_di},
          updated_at = NOW()
        WHERE user_id = ${userId} AND symbol = ${symbol} AND timeframe = ${timeframe}
      `;
    } else {
      await sql`
        INSERT INTO indicator_alert_state (user_id, symbol, timeframe, last_cci, last_adx, last_plus_di, last_minus_di)
        VALUES (${userId}, ${symbol}, ${timeframe}, ${updateData.last_cci || null}, ${updateData.last_adx || null}, ${updateData.last_plus_di || null}, ${updateData.last_minus_di || null})
      `;
    }
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

// RSI Calculation
function calculateRSI(candles: any[], period: number = 14): number[] {
  const results: number[] = [];
  if (candles.length < period + 1) return results;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      const change = candles[i].close - candles[i - 1].close;
      avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    results.push(100 - (100 / (1 + rs)));
  }
  return results;
}

// MACD Calculation
function calculateMACD(candles: any[], fast: number = 12, slow: number = 26, signal: number = 9): { macd: number; signal: number; histogram: number }[] {
  const results: { macd: number; signal: number; histogram: number }[] = [];
  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);
  
  if (emaFast.length < signal || emaSlow.length < signal) return results;
  
  const macdLine: number[] = [];
  const offset = slow - fast;
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }
  
  // Signal line EMA
  const signalLine: number[] = [];
  let signalEMA = macdLine.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  signalLine.push(signalEMA);
  
  for (let i = signal; i < macdLine.length; i++) {
    signalEMA = (macdLine[i] - signalEMA) * (2 / (signal + 1)) + signalEMA;
    signalLine.push(signalEMA);
  }
  
  for (let i = 0; i < signalLine.length; i++) {
    const idx = i + signal - 1;
    results.push({
      macd: macdLine[idx],
      signal: signalLine[i],
      histogram: macdLine[idx] - signalLine[i]
    });
  }
  return results;
}

// Stochastic Calculation
function calculateStochastic(candles: any[], kPeriod: number = 14, kSmooth: number = 3, dSmooth: number = 3): { k: number; d: number }[] {
  const results: { k: number; d: number }[] = [];
  if (candles.length < kPeriod) return results;
  
  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    rawK.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
  }
  
  // Smooth K
  const smoothedK: number[] = [];
  for (let i = kSmooth - 1; i < rawK.length; i++) {
    smoothedK.push(rawK.slice(i - kSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / kSmooth);
  }
  
  // Calculate D
  for (let i = dSmooth - 1; i < smoothedK.length; i++) {
    results.push({
      k: smoothedK[i],
      d: smoothedK.slice(i - dSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / dSmooth
    });
  }
  return results;
}

// EMA Calculation
function calculateEMA(candles: any[], period: number): number[] {
  const results: number[] = [];
  if (candles.length < period) return results;
  
  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  results.push(ema);
  
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
    results.push(ema);
  }
  return results;
}

// VWAP Calculation (simplified - session VWAP)
function calculateVWAP(candles: any[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

// Volume Average
function calculateVolumeAverage(candles: any[], period: number): number {
  if (candles.length < period) return 0;
  return candles.slice(-period).reduce((sum, c) => sum + c.volume, 0) / period;
}

// Engulfing Pattern Detection
function detectEngulfing(candles: any[]): 'bullish' | 'bearish' | null {
  if (candles.length < 2) return null;
  
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  
  // Bullish engulfing
  if (prevBearish && currBullish && curr.open < prev.close && curr.close > prev.open) {
    return 'bullish';
  }
  
  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  
  // Bearish engulfing
  if (prevBullish && currBearish && curr.open > prev.close && curr.close < prev.open) {
    return 'bearish';
  }
  
  return null;
}

// Hammer/Shooting Star Detection
function detectHammerStar(candles: any[]): 'hammer' | 'shooting_star' | null {
  if (candles.length < 1) return null;
  
  const c = candles[candles.length - 1];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  
  if (range === 0 || body === 0) return null;
  
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  
  // Hammer: small body at top, long lower wick
  if (lowerWick > body * 2 && upperWick < body * 0.5) {
    return 'hammer';
  }
  
  // Shooting star: small body at bottom, long upper wick
  if (upperWick > body * 2 && lowerWick < body * 0.5) {
    return 'shooting_star';
  }
  
  return null;
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
