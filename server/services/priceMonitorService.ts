import { storage } from "../storage";
import webpush from "web-push";

interface PriceData {
  symbol: string;
  price: number;
}

interface AlertConfig {
  enabled: boolean;
  triggered: boolean;
  lastCheckedPrice: number;
  crossUpEnabled: boolean;
  crossDownEnabled: boolean;
  triggerTime?: number;
  [key: string]: unknown;
}

class PriceMonitorService {
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 30000; // Check every 30 seconds

  async start() {
    if (this.monitorInterval) {
      console.log("Price monitor already running");
      return;
    }

    console.log("Starting price monitor service...");
    this.monitorInterval = setInterval(() => {
      this.checkAllTrackedTrades();
      this.checkAllIndicatorAlerts();
      this.checkAllDrawingAlerts(); // Replaces checkAllHorizontalLineAlerts with universal drawing alerts
    }, this.CHECK_INTERVAL);

    // Run initial checks
    await this.checkAllTrackedTrades();
    await this.checkAllIndicatorAlerts();
    await this.checkAllDrawingAlerts();
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log("Price monitor stopped");
    }
  }

  private async checkAllTrackedTrades() {
    try {
      // Get all active tracked trades (pending or entry_hit)
      const activeTrades = await storage.getActiveTrackedTrades();
      
      if (activeTrades.length === 0) {
        return;
      }

      // Get unique symbols
      const symbolSet = new Set(activeTrades.map(t => t.symbol));
      const symbols = Array.from(symbolSet);
      
      // Fetch current prices for all symbols
      const prices = await this.fetchPrices(symbols);
      
      // Check each trade
      for (const trade of activeTrades) {
        const currentPrice = prices.find(p => p.symbol === trade.symbol)?.price;
        if (!currentPrice) continue;

        await this.checkTrade(trade, currentPrice);
      }
    } catch (error) {
      console.error("Error checking tracked trades:", error);
    }
  }

  private async fetchPrices(symbols: string[]): Promise<PriceData[]> {
    const prices: PriceData[] = [];
    
    for (const symbol of symbols) {
      try {
        // Use Binance API for crypto prices
        const response = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`);
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

  private async checkTrade(trade: any, currentPrice: number) {
    const { id, userId, symbol, direction, entry, stopLoss, targets, status } = trade;

    // Guard: Skip if entry, stopLoss, or targets are invalid
    if (!entry || !stopLoss || !targets || targets.length === 0) {
      console.warn(`Skipping incomplete trade ${id}: missing entry/SL/targets`);
      return;
    }

    // Check if entry is hit (only for pending trades)
    if (status === 'pending') {
      const entryHit = direction === 'LONG' 
        ? currentPrice <= entry 
        : currentPrice >= entry;

      if (entryHit) {
        await storage.updateTrackedTradeStatus(id, 'entry_hit');
        await this.sendNotification(userId, {
          title: `🎯 Entry Hit: ${symbol}`,
          body: `${direction} entry at $${entry.toFixed(4)} has been hit! Current price: $${currentPrice.toFixed(4)}`,
          tag: `entry-${id}`,
        });
        console.log(`Entry hit for trade ${id}: ${symbol} ${direction} @ ${currentPrice}`);
        return; // Don't check SL/TP in same tick
      }
    }

    // Check stop loss and targets (only for entry_hit trades)
    if (status === 'entry_hit') {
      // Check SL first (higher priority than TP)
      const slHit = direction === 'LONG'
        ? currentPrice <= stopLoss
        : currentPrice >= stopLoss;

      if (slHit) {
        await storage.updateTrackedTradeStatus(id, 'sl_hit');
        await this.sendNotification(userId, {
          title: `🛑 Stop Loss Hit: ${symbol}`,
          body: `${direction} SL at $${stopLoss.toFixed(4)} has been hit. Current price: $${currentPrice.toFixed(4)}`,
          tag: `sl-${id}`,
        });
        console.log(`SL hit for trade ${id}: ${symbol} ${direction} @ ${currentPrice}`);
        return; // Stop immediately, don't check TP
      }

      // Check targets only if SL not hit
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tpHit = direction === 'LONG'
          ? currentPrice >= target
          : currentPrice <= target;

        if (tpHit) {
          await storage.updateTrackedTradeStatus(id, 'tp_hit');
          await this.sendNotification(userId, {
            title: `✅ Target Hit: ${symbol}`,
            body: `${direction} TP${i + 1} at $${target.toFixed(4)} has been hit! Current price: $${currentPrice.toFixed(4)}`,
            tag: `tp-${id}`,
          });
          console.log(`TP${i + 1} hit for trade ${id}: ${symbol} ${direction} @ ${currentPrice}`);
          return; // Stop after first target hit
        }
      }
    }
  }

  private async sendNotification(userId: number, notification: { title: string; body: string; tag: string }) {
    try {
      // VAPID keys re-enabled for push notifications
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      
      if (!publicKey || !privateKey) {
        console.log("Push notifications require VAPID keys - VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
        return;
      }

      // Configure webpush with VAPID details
      webpush.setVapidDetails(
        'mailto:support@beartec.uk',
        publicKey,
        privateKey
      );

      // Get user's subscription tier
      const { db } = await import("../db");
      const { cryptoSubscriptions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [userSubscription] = await db
        .select()
        .from(cryptoSubscriptions)
        .where(eq(cryptoSubscriptions.userId, userId.toString()));
      
      // Only send notifications to intermediate+ tiers
      const allowedTiers = ['intermediate', 'pro', 'elite'];
      const tier = (userSubscription?.tier || '').toLowerCase();
      if (!userSubscription || !allowedTiers.includes(tier)) {
        console.log(`User ${userId} tier (${tier || 'none'}) not eligible for trade notifications`);
        return;
      }

      const subscriptions = await storage.getPushSubscriptionsByUserId(userId);
      
      if (subscriptions.length === 0) {
        console.log(`No push subscriptions found for user ${userId}`);
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
        } catch (error) {
          console.error(`Failed to send notification to subscription ${sub.id}:`, error);
          // If subscription is no longer valid, remove it
          if (error instanceof Error && (error.message.includes('410') || error.message.includes('404'))) {
            await storage.deletePushSubscription(sub.id);
          }
        }
      }
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }

  // ============ INDICATOR ALERT DETECTION ============

  private async checkAllIndicatorAlerts() {
    try {
      // Get all users with CCI or ADX alerts enabled
      const { db } = await import("../db");
      const { cryptoSubscriptions } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      const usersWithAlerts = await db
        .select()
        .from(cryptoSubscriptions)
        .where(sql`${cryptoSubscriptions.alertsEnabled} = true AND (${cryptoSubscriptions.alertTypes}::text[] && ARRAY['cci', 'adx']::text[])`);

      if (usersWithAlerts.length === 0) {
        return;
      }

      console.log(`Checking indicator alerts for ${usersWithAlerts.length} users...`);

      for (const user of usersWithAlerts) {
        // Validate tier - CCI/ADX alerts are Intermediate+ only
        // Canonical tier values: 'free', 'beginner', 'intermediate', 'pro', 'elite'
        const tier = (user.tier || 'free').trim().toLowerCase();
        const allowedTiers = ['intermediate', 'pro', 'elite'];
        if (!allowedTiers.includes(tier)) {
          console.log(`Skipping user ${user.userId} - tier ${tier} not eligible for CCI/ADX alerts`);
          continue;
        }

        if (!user.selectedTickers || user.selectedTickers.length === 0) continue;
        if (!user.alertTimeframes || user.alertTimeframes.length === 0) continue;
        if (!user.alertTypes || user.alertTypes.length === 0) continue;

        const hasCCI = user.alertTypes.includes('cci');
        const hasADX = user.alertTypes.includes('adx');

        if (!hasCCI && !hasADX) continue;

        // Check each ticker/timeframe combination
        for (const ticker of user.selectedTickers) {
          for (const timeframe of user.alertTimeframes) {
            try {
              await this.checkIndicatorAlertsForSymbol(user.userId, ticker, timeframe, hasCCI, hasADX);
            } catch (error) {
              console.error(`Error checking alerts for ${user.userId}/${ticker}/${timeframe}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking indicator alerts:", error);
    }
  }

  private async checkIndicatorAlertsForSymbol(
    userId: string,
    symbol: string,
    timeframe: string,
    checkCCI: boolean,
    checkADX: boolean
  ) {
    // Fetch candle data
    const candles = await this.fetchCandleData(symbol, timeframe);
    if (candles.length < 50) return; // Need enough data for indicators

    // Calculate indicators
    const { calculateCCI, calculateADX } = await import("../lib/indicators");
    
    let cciValues: any[] = [];
    let adxValues: any[] = [];

    if (checkCCI) {
      cciValues = calculateCCI(candles, 20);
    }
    if (checkADX) {
      adxValues = calculateADX(candles, 14);
    }

    if ((checkCCI && cciValues.length === 0) || (checkADX && adxValues.length === 0)) {
      return; // Not enough data
    }

    // Get last known values from database
    const lastState = await storage.getIndicatorAlertState(userId, symbol, timeframe);

    // Get current values
    const currentCCI = checkCCI && cciValues.length > 0 ? cciValues[cciValues.length - 1].value : null;
    const currentADX = checkADX && adxValues.length > 0 ? adxValues[adxValues.length - 1] : null;

    // Check for CCI crosses (explicit null/undefined check to handle zero values correctly)
    if (checkCCI && currentCCI !== null && lastState?.lastCci !== null && lastState?.lastCci !== undefined) {
      const lastCCIValue = parseFloat(lastState.lastCci);
      if (Number.isFinite(lastCCIValue)) {
        await this.checkCCIAlerts(userId, symbol, timeframe, lastCCIValue, currentCCI);
      }
    }

    // Check for ADX crosses (explicit null/undefined check, validate all DI components)
    // Skip if no historic DI values to prevent spurious alerts on first poll
    if (checkADX && currentADX && 
        Number.isFinite(currentADX.adx) && 
        Number.isFinite(currentADX.plusDI) && 
        Number.isFinite(currentADX.minusDI) &&
        lastState?.lastAdx !== null && lastState?.lastAdx !== undefined &&
        lastState?.lastPlusDi !== null && lastState?.lastPlusDi !== undefined &&
        lastState?.lastMinusDi !== null && lastState?.lastMinusDi !== undefined) {
      const lastADXValue = parseFloat(lastState.lastAdx);
      const lastPlusDI = parseFloat(lastState.lastPlusDi);
      const lastMinusDI = parseFloat(lastState.lastMinusDi);
      
      if (Number.isFinite(lastADXValue) && Number.isFinite(lastPlusDI) && Number.isFinite(lastMinusDI)) {
        await this.checkADXAlerts(
          userId,
          symbol,
          timeframe,
          {
            adx: lastADXValue,
            plusDI: lastPlusDI,
            minusDI: lastMinusDI
          },
          currentADX
        );
      }
    }

    // Update state in database
    await storage.upsertIndicatorAlertState({
      userId,
      symbol,
      timeframe,
      lastCci: currentCCI?.toString() || null,
      lastAdx: currentADX?.adx.toString() || null,
      lastPlusDi: currentADX?.plusDI.toString() || null,
      lastMinusDi: currentADX?.minusDI.toString() || null,
    });
  }

  private async sendCryptoNotification(userId: string, notification: { title: string; body: string; tag: string }) {
    try {
      // VAPID keys re-enabled for push notifications
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      
      if (!publicKey || !privateKey) {
        console.log("Push notifications require VAPID keys - VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
        return;
      }

      webpush.setVapidDetails('mailto:support@beartec.uk', publicKey, privateKey);

      // Get crypto user subscriptions directly
      const subscriptions = await storage.getCryptoPushSubscriptionsByUserId(userId);
      
      if (subscriptions.length === 0) {
        console.log(`No push subscriptions found for crypto user ${userId}`);
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
        } catch (error) {
          console.error(`Failed to send notification to crypto subscription ${sub.id}:`, error);
          // Note: deletePushSubscription expects numeric ID, but crypto subs have UUID strings
          // For now, log the error - subscription cleanup should be handled separately for crypto
          console.log(`Stale crypto push subscription detected: ${sub.id}. Manual cleanup may be required.`);
        }
      }
    } catch (error) {
      console.error("Error sending crypto notification:", error);
    }
  }

  private async checkCCIAlerts(userId: string, symbol: string, timeframe: string, lastCCI: number, currentCCI: number) {
    // Check for crosses above +100 (overbought)
    if (lastCCI <= 100 && currentCCI > 100) {
      await this.sendCryptoNotification(userId, {
        title: `🔴 CCI Overbought: ${symbol}`,
        body: `${timeframe} CCI crossed above +100 (${currentCCI.toFixed(2)}). Market may be overbought.`,
        tag: `cci-ob-${symbol}-${timeframe}`,
      });
    }

    // Check for crosses below -100 (oversold)
    if (lastCCI >= -100 && currentCCI < -100) {
      await this.sendCryptoNotification(userId, {
        title: `🟢 CCI Oversold: ${symbol}`,
        body: `${timeframe} CCI crossed below -100 (${currentCCI.toFixed(2)}). Market may be oversold.`,
        tag: `cci-os-${symbol}-${timeframe}`,
      });
    }

    // Check for crosses above 0 (bullish momentum)
    if (lastCCI <= 0 && currentCCI > 0) {
      await this.sendCryptoNotification(userId, {
        title: `🟢 CCI Bullish: ${symbol}`,
        body: `${timeframe} CCI crossed above 0 (${currentCCI.toFixed(2)}). Bullish momentum shift.`,
        tag: `cci-bull-${symbol}-${timeframe}`,
      });
    }

    // Check for crosses below 0 (bearish momentum)
    if (lastCCI >= 0 && currentCCI < 0) {
      await this.sendCryptoNotification(userId, {
        title: `🔴 CCI Bearish: ${symbol}`,
        body: `${timeframe} CCI crossed below 0 (${currentCCI.toFixed(2)}). Bearish momentum shift.`,
        tag: `cci-bear-${symbol}-${timeframe}`,
      });
    }
  }

  private async checkADXAlerts(
    userId: string,
    symbol: string,
    timeframe: string,
    lastADX: { adx: number; plusDI: number; minusDI: number },
    currentADX: { adx: number; plusDI: number; minusDI: number }
  ) {
    // Check for ADX crossing above 25 (strong trend)
    if (lastADX.adx <= 25 && currentADX.adx > 25) {
      await this.sendCryptoNotification(userId, {
        title: `📈 Strong Trend: ${symbol}`,
        body: `${timeframe} ADX crossed above 25 (${currentADX.adx.toFixed(2)}). Strong trend forming.`,
        tag: `adx-strong-${symbol}-${timeframe}`,
      });
    }

    // Check for ADX crossing below 20 (weak trend/ranging)
    if (lastADX.adx >= 20 && currentADX.adx < 20) {
      await this.sendCryptoNotification(userId, {
        title: `📊 Ranging Market: ${symbol}`,
        body: `${timeframe} ADX crossed below 20 (${currentADX.adx.toFixed(2)}). Market may be ranging.`,
        tag: `adx-weak-${symbol}-${timeframe}`,
      });
    }

    // Check for +DI/-DI crossover (bullish)
    if (lastADX.plusDI <= lastADX.minusDI && currentADX.plusDI > currentADX.minusDI) {
      await this.sendCryptoNotification(userId, {
        title: `🟢 Bullish Crossover: ${symbol}`,
        body: `${timeframe} +DI crossed above -DI. Bullish directional change.`,
        tag: `adx-di-bull-${symbol}-${timeframe}`,
      });
    }

    // Check for +DI/-DI crossover (bearish)
    if (lastADX.plusDI >= lastADX.minusDI && currentADX.plusDI < currentADX.minusDI) {
      await this.sendCryptoNotification(userId, {
        title: `🔴 Bearish Crossover: ${symbol}`,
        body: `${timeframe} -DI crossed above +DI. Bearish directional change.`,
        tag: `adx-di-bear-${symbol}-${timeframe}`,
      });
    }
  }

  // ============ HORIZONTAL LINE PRICE ALERTS ============
  
  private async checkAllHorizontalLineAlerts() {
    try {
      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      // Get all horizontal line drawings with active alerts
      const activeAlerts = await db
        .select()
        .from(chartDrawings)
        .where(sql`${chartDrawings.drawingType} = 'horizontal' AND (${chartDrawings.style}->>'alertActive')::boolean = true AND ((${chartDrawings.style}->>'alertTriggered')::boolean IS NULL OR (${chartDrawings.style}->>'alertTriggered')::boolean = false)`);

      if (activeAlerts.length === 0) {
        return;
      }

      console.log(`Checking ${activeAlerts.length} horizontal line alerts...`);

      // Get unique symbols
      const symbolSet = new Set(activeAlerts.map(d => d.symbol));
      const symbols = Array.from(symbolSet);

      // Fetch current prices for all symbols
      const prices = await this.fetchPrices(symbols);

      for (const drawing of activeAlerts) {
        const currentPrice = prices.find(p => p.symbol === drawing.symbol)?.price;
        if (!currentPrice) {
          console.log(`⚠️ No price found for ${drawing.symbol} (drawing ${drawing.id})`);
          continue;
        }

        const linePrice = drawing.coordinates?.points?.[0]?.price;
        if (!linePrice) {
          console.log(`⚠️ No line price found for drawing ${drawing.id}`);
          continue;
        }

        // Safely get style properties, defaulting to empty object if undefined
        const currentStyle = drawing.style || {};
        const lastCheckedPrice = (currentStyle as any).lastCheckedPrice;
        const lineName = (currentStyle as any).label || 'H-Line';

        console.log(`🔍 Checking H-Line alert: ${drawing.symbol} | Line: ${linePrice} | Current: ${currentPrice} | Last: ${lastCheckedPrice}`);

        // Check if price crossed the line (only if we have a previous price to compare)
        let crossed = false;
        if (lastCheckedPrice !== null && lastCheckedPrice !== undefined && Number.isFinite(lastCheckedPrice)) {
          // Price crossed from below to above
          if (lastCheckedPrice < linePrice && currentPrice >= linePrice) {
            crossed = true;
            console.log(`📈 Cross detected: below→above (${lastCheckedPrice} → ${currentPrice})`);
          }
          // Price crossed from above to below
          if (lastCheckedPrice > linePrice && currentPrice <= linePrice) {
            crossed = true;
            console.log(`📉 Cross detected: above→below (${lastCheckedPrice} → ${currentPrice})`);
          }
        } else {
          // First check - initialize lastCheckedPrice and check if price is already at/past line
          console.log(`🆕 First check for H-Line ${drawing.id}, initializing lastCheckedPrice`);
        }

        if (crossed) {
          console.log(`✅ Price crossed ${lineName} for ${drawing.symbol} at ${linePrice}`);
          
          // Send notification
          await this.sendCryptoNotification(drawing.userId, {
            title: `📈 Price Crossing: ${drawing.symbol}`,
            body: `Price crossing '${lineName}' at $${linePrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
            tag: `hline-${drawing.id}`,
          });

          // Mark as triggered - safely merge existing style properties
          await db
            .update(chartDrawings)
            .set({
              style: {
                ...currentStyle,
                alertTriggered: true,
                lastCheckedPrice: currentPrice,
              },
              updatedAt: new Date(),
            })
            .where(sql`${chartDrawings.id} = ${drawing.id}`);
        } else {
          // Just update last checked price - safely merge existing style properties
          await db
            .update(chartDrawings)
            .set({
              style: {
                ...currentStyle,
                lastCheckedPrice: currentPrice,
              },
            })
            .where(sql`${chartDrawings.id} = ${drawing.id}`);
        }
      }
    } catch (error) {
      console.error("Error checking horizontal line alerts:", error);
    }
  }

  // ============ UNIVERSAL DRAWING ALERTS ============

  /**
   * Calculate trendline price at current time using slope formula
   */
  private getTrendlinePrice(p1: { time: number; price: number }, p2: { time: number; price: number }, currentTime: number): number {
    const slope = (p2.price - p1.price) / (p2.time - p1.time);
    return p1.price + slope * (currentTime - p1.time);
  }

  /**
   * Calculate level price for channel, fib, or rectangle
   */
  private getLevelPrice(points: { time: number; price: number }[], level: number): number {
    if (points.length < 2) return 0;
    const p1 = points[0];
    const p2 = points[1];
    const priceDiff = Math.abs(p2.price - p1.price);
    const basePrice = Math.min(p1.price, p2.price);
    return basePrice + priceDiff * level;
  }

  /**
   * Calculate trend fib level price (wave-based projection)
   */
  private getTrendFibPrice(points: { time: number; price: number }[], level: number): number {
    if (points.length < 3) return 0;
    const [p1, p2, p3] = points;
    
    // Calculate the wave height (p1 to p2)
    const waveHeight = Math.abs(p2.price - p1.price);
    
    // Project from p3 using the level
    const direction = p2.price > p1.price ? 1 : -1;
    return p3.price + (direction * waveHeight * level);
  }

  /**
   * Detect price crossing with directional support
   */
  private detectCrossing(
    lastPrice: number | undefined,
    currentPrice: number,
    linePrice: number,
    crossUpEnabled: boolean,
    crossDownEnabled: boolean
  ): 'up' | 'down' | null {
    if (!lastPrice || !Number.isFinite(lastPrice)) return null;
    
    if (crossUpEnabled && lastPrice < linePrice && currentPrice >= linePrice) {
      return 'up';
    }
    if (crossDownEnabled && lastPrice > linePrice && currentPrice <= linePrice) {
      return 'down';
    }
    return null;
  }

  /**
   * Check all drawing alerts (trendlines, channels, fibs, etc.)
   */
  private async checkAllDrawingAlerts() {
    try {
      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      // Get all drawings with alerts enabled
      const activeAlerts = await db
        .select()
        .from(chartDrawings)
        .where(sql`
          (${chartDrawings.drawingType} = 'horizontal' AND (${chartDrawings.style}->>'alertActive')::boolean = true AND ((${chartDrawings.style}->>'alertTriggered')::boolean IS NULL OR (${chartDrawings.style}->>'alertTriggered')::boolean = false))
          OR (${chartDrawings.style}->>'alertsEnabled')::boolean = true
          OR (${chartDrawings.style}->'trendlineAlert'->>'enabled')::boolean = true
          OR jsonb_typeof(${chartDrawings.style}->'levelAlerts') = 'object'
        `);

      if (activeAlerts.length === 0) {
        return;
      }

      console.log(`Checking ${activeAlerts.length} drawing alerts...`);

      // Get unique symbols
      const symbolSet = new Set(activeAlerts.map(d => d.symbol));
      const symbols = Array.from(symbolSet);

      // Fetch current prices for all symbols
      const prices = await this.fetchPrices(symbols);
      
      // Get current time in seconds
      const currentTime = Math.floor(Date.now() / 1000);

      for (const drawing of activeAlerts) {
        const currentPrice = prices.find(p => p.symbol === drawing.symbol)?.price;
        if (!currentPrice) {
          console.log(`⚠️ No price found for ${drawing.symbol} (drawing ${drawing.id})`);
          continue;
        }

        const currentStyle = drawing.style || {};
        
        // Check based on drawing type
        try {
          switch (drawing.drawingType) {
            case 'horizontal':
              await this.checkHorizontalAlert(drawing, currentPrice, currentStyle);
              break;
            case 'trendline':
              await this.checkTrendlineAlert(drawing, currentPrice, currentTime, currentStyle);
              break;
            case 'channel':
              await this.checkChannelAlert(drawing, currentPrice, currentStyle);
              break;
            case 'fib_retracement':
              await this.checkFibRetracementAlert(drawing, currentPrice, currentStyle);
              break;
            case 'trend_fib':
              await this.checkTrendFibAlert(drawing, currentPrice, currentStyle);
              break;
            case 'rectangle':
              await this.checkRectangleAlert(drawing, currentPrice, currentStyle);
              break;
          }
        } catch (error) {
          console.error(`Error checking alert for drawing ${drawing.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error checking drawing alerts:", error);
    }
  }

  private async checkHorizontalAlert(drawing: any, currentPrice: number, currentStyle: any) {
    const linePrice = drawing.coordinates?.points?.[0]?.price;
    if (!linePrice) return;

    // Support both legacy and new alert system
    const alertConfig = currentStyle.trendlineAlert || {
      enabled: currentStyle.alertActive,
      crossUpEnabled: true,
      crossDownEnabled: true,
      lastCheckedPrice: currentStyle.lastCheckedPrice,
      triggered: currentStyle.alertTriggered,
    };

    if (!alertConfig.enabled && !currentStyle.alertActive) return;

    const lastCheckedPrice = alertConfig.lastCheckedPrice;
    const lineName = currentStyle.label || 'H-Line';

    console.log(`🔍 Checking H-Line: ${drawing.symbol} | Line: ${linePrice} | Current: ${currentPrice}`);

    const crossDirection = this.detectCrossing(
      lastCheckedPrice,
      currentPrice,
      linePrice,
      alertConfig.crossUpEnabled !== false, // Default to true for legacy
      alertConfig.crossDownEnabled !== false
    );

    if (crossDirection) {
      console.log(`✅ Price crossed ${lineName} ${crossDirection} for ${drawing.symbol}`);
      
      await this.sendCryptoNotification(drawing.userId, {
        title: `📈 Price Crossing: ${drawing.symbol}`,
        body: `Price crossed ${crossDirection} '${lineName}' at $${linePrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
        tag: `hline-${drawing.id}`,
      });

      // Update style based on which system is being used
      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      if (currentStyle.trendlineAlert) {
        await db.update(chartDrawings).set({
          style: {
            ...currentStyle,
            trendlineAlert: {
              ...alertConfig,
              triggered: true,
              triggerTime: Date.now(),
              lastCheckedPrice: currentPrice,
            },
          },
          updatedAt: new Date(),
        }).where(sql`${chartDrawings.id} = ${drawing.id}`);
      } else {
        // Legacy system
        await db.update(chartDrawings).set({
          style: {
            ...currentStyle,
            alertTriggered: true,
            lastCheckedPrice: currentPrice,
          },
          updatedAt: new Date(),
        }).where(sql`${chartDrawings.id} = ${drawing.id}`);
      }
    } else {
      // Update last checked price
      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      if (currentStyle.trendlineAlert) {
        await db.update(chartDrawings).set({
          style: {
            ...currentStyle,
            trendlineAlert: {
              ...alertConfig,
              lastCheckedPrice: currentPrice,
            },
          },
        }).where(sql`${chartDrawings.id} = ${drawing.id}`);
      } else {
        await db.update(chartDrawings).set({
          style: {
            ...currentStyle,
            lastCheckedPrice: currentPrice,
          },
        }).where(sql`${chartDrawings.id} = ${drawing.id}`);
      }
    }
  }

  private async checkTrendlineAlert(drawing: any, currentPrice: number, currentTime: number, currentStyle: any) {
    const alertConfig = currentStyle.trendlineAlert;
    if (!alertConfig?.enabled) return;

    const points = drawing.coordinates?.points;
    if (!points || points.length < 2) return;

    const linePrice = this.getTrendlinePrice(points[0], points[1], currentTime);
    const lineName = currentStyle.label || 'Trendline';

    console.log(`🔍 Checking Trendline: ${drawing.symbol} | Line: ${linePrice.toFixed(4)} | Current: ${currentPrice}`);

    const crossDirection = this.detectCrossing(
      alertConfig.lastCheckedPrice,
      currentPrice,
      linePrice,
      alertConfig.crossUpEnabled,
      alertConfig.crossDownEnabled
    );

    if (crossDirection) {
      console.log(`✅ Price crossed ${lineName} ${crossDirection} for ${drawing.symbol}`);
      
      await this.sendCryptoNotification(drawing.userId, {
        title: `📈 Trendline Cross: ${drawing.symbol}`,
        body: `Price crossed ${crossDirection} '${lineName}' at $${linePrice.toFixed(4)}. Current: $${currentPrice.toFixed(4)}`,
        tag: `trendline-${drawing.id}`,
      });

      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      await db.update(chartDrawings).set({
        style: {
          ...currentStyle,
          trendlineAlert: {
            ...alertConfig,
            triggered: true,
            triggerTime: Date.now(),
            lastCheckedPrice: currentPrice,
          },
        },
        updatedAt: new Date(),
      }).where(sql`${chartDrawings.id} = ${drawing.id}`);
    } else {
      const { db } = await import("../db");
      const { chartDrawings } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");

      await db.update(chartDrawings).set({
        style: {
          ...currentStyle,
          trendlineAlert: {
            ...alertConfig,
            lastCheckedPrice: currentPrice,
          },
        },
      }).where(sql`${chartDrawings.id} = ${drawing.id}`);
    }
  }

  private async checkChannelAlert(drawing: any, currentPrice: number, currentStyle: any) {
    const levelAlerts = currentStyle.levelAlerts;
    if (!levelAlerts) return;

    const points = drawing.coordinates?.points;
    if (!points || points.length < 2) return;

    // Check each configured level
    const levelMap: Record<string, number> = {
      'top': 1.0,
      '0.75': 0.75,
      '0.5': 0.5,
      '0.25': 0.25,
      'bottom': 0.0,
    };

    let needsUpdate = false;
    const updatedLevelAlerts = { ...levelAlerts };

    for (const [levelKey, alertConfig] of Object.entries(levelAlerts) as [string, AlertConfig][]) {
      if (!alertConfig.enabled || alertConfig.triggered) continue;

      const levelValue = levelMap[levelKey];
      if (levelValue === undefined) continue;

      const levelPrice = this.getLevelPrice(points, levelValue);
      const levelName = levelKey === 'top' ? 'Top' : levelKey === 'bottom' ? 'Bottom' : `${Math.round(levelValue * 100)}%`;

      const crossDirection = this.detectCrossing(
        alertConfig.lastCheckedPrice,
        currentPrice,
        levelPrice,
        alertConfig.crossUpEnabled,
        alertConfig.crossDownEnabled
      );

      if (crossDirection) {
        console.log(`✅ Channel ${levelName} crossed ${crossDirection} for ${drawing.symbol}`);
        
        await this.sendCryptoNotification(drawing.userId, {
          title: `📊 Channel Alert: ${drawing.symbol}`,
          body: `Price crossed ${crossDirection} channel ${levelName} at $${levelPrice.toFixed(4)}`,
          tag: `channel-${drawing.id}-${levelKey}`,
        });

        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          triggered: true,
          triggerTime: Date.now(),
          lastCheckedPrice: currentPrice,
        };
        needsUpdate = true;
      } else {
        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          lastCheckedPrice: currentPrice,
        };
      }
    }

    // Always update lastCheckedPrice, but only update updatedAt when alerts trigger
    const { db } = await import("../db");
    const { chartDrawings } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");

    const updatePayload: any = {
      style: {
        ...currentStyle,
        levelAlerts: updatedLevelAlerts,
      },
    };
    
    if (needsUpdate) {
      updatePayload.updatedAt = new Date();
    }

    await db.update(chartDrawings).set(updatePayload).where(sql`${chartDrawings.id} = ${drawing.id}`);
  }

  private async checkFibRetracementAlert(drawing: any, currentPrice: number, currentStyle: any) {
    const levelAlerts = currentStyle.levelAlerts;
    if (!levelAlerts) return;

    const points = drawing.coordinates?.points;
    if (!points || points.length < 2) return;

    // Fib levels
    const fibLevels: Record<string, number> = {
      '0': 0,
      '0.236': 0.236,
      '0.382': 0.382,
      '0.5': 0.5,
      '0.618': 0.618,
      '0.786': 0.786,
      '1.0': 1.0,
      '1.272': 1.272,
      '1.618': 1.618,
    };

    let needsUpdate = false;
    const updatedLevelAlerts = { ...levelAlerts };

    for (const [levelKey, alertConfig] of Object.entries(levelAlerts) as [string, AlertConfig][]) {
      if (!alertConfig.enabled || alertConfig.triggered) continue;

      const levelValue = fibLevels[levelKey];
      if (levelValue === undefined) continue;

      const levelPrice = this.getLevelPrice(points, levelValue);

      const crossDirection = this.detectCrossing(
        alertConfig.lastCheckedPrice,
        currentPrice,
        levelPrice,
        alertConfig.crossUpEnabled,
        alertConfig.crossDownEnabled
      );

      if (crossDirection) {
        console.log(`✅ Fib ${levelKey} crossed ${crossDirection} for ${drawing.symbol}`);
        
        await this.sendCryptoNotification(drawing.userId, {
          title: `📐 Fib Alert: ${drawing.symbol}`,
          body: `Price crossed ${crossDirection} Fib ${levelKey} at $${levelPrice.toFixed(4)}`,
          tag: `fib-${drawing.id}-${levelKey}`,
        });

        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          triggered: true,
          triggerTime: Date.now(),
          lastCheckedPrice: currentPrice,
        };
        needsUpdate = true;
      } else {
        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          lastCheckedPrice: currentPrice,
        };
      }
    }

    // Always update lastCheckedPrice, but only update updatedAt when alerts trigger
    const { db } = await import("../db");
    const { chartDrawings } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");

    const updatePayload: any = {
      style: {
        ...currentStyle,
        levelAlerts: updatedLevelAlerts,
      },
    };
    
    if (needsUpdate) {
      updatePayload.updatedAt = new Date();
    }

    await db.update(chartDrawings).set(updatePayload).where(sql`${chartDrawings.id} = ${drawing.id}`);
  }

  private async checkTrendFibAlert(drawing: any, currentPrice: number, currentStyle: any) {
    const levelAlerts = currentStyle.levelAlerts;
    if (!levelAlerts) return;

    const points = drawing.coordinates?.points;
    if (!points || points.length < 3) return;

    // Trend fib levels
    const trendFibLevels: Record<string, number> = {
      '0.382': 0.382,
      '0.5': 0.5,
      '0.618': 0.618,
      '0.786': 0.786,
      '1.0': 1.0,
      '1.272': 1.272,
      '1.618': 1.618,
      '2.0': 2.0,
      '2.618': 2.618,
      '3.618': 3.618,
      '4.236': 4.236,
    };

    let needsUpdate = false;
    const updatedLevelAlerts = { ...levelAlerts };

    for (const [levelKey, alertConfig] of Object.entries(levelAlerts) as [string, AlertConfig][]) {
      if (!alertConfig.enabled || alertConfig.triggered) continue;

      const levelValue = trendFibLevels[levelKey];
      if (levelValue === undefined) continue;

      const levelPrice = this.getTrendFibPrice(points, levelValue);

      const crossDirection = this.detectCrossing(
        alertConfig.lastCheckedPrice,
        currentPrice,
        levelPrice,
        alertConfig.crossUpEnabled,
        alertConfig.crossDownEnabled
      );

      if (crossDirection) {
        console.log(`✅ Trend Fib ${levelKey} crossed ${crossDirection} for ${drawing.symbol}`);
        
        await this.sendCryptoNotification(drawing.userId, {
          title: `📈 Trend Fib Alert: ${drawing.symbol}`,
          body: `Price crossed ${crossDirection} Trend Fib ${levelKey} at $${levelPrice.toFixed(4)}`,
          tag: `trendfib-${drawing.id}-${levelKey}`,
        });

        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          triggered: true,
          triggerTime: Date.now(),
          lastCheckedPrice: currentPrice,
        };
        needsUpdate = true;
      } else {
        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          lastCheckedPrice: currentPrice,
        };
      }
    }

    // Always update lastCheckedPrice, but only update updatedAt when alerts trigger
    const { db } = await import("../db");
    const { chartDrawings } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");

    const updatePayload: any = {
      style: {
        ...currentStyle,
        levelAlerts: updatedLevelAlerts,
      },
    };
    
    if (needsUpdate) {
      updatePayload.updatedAt = new Date();
    }

    await db.update(chartDrawings).set(updatePayload).where(sql`${chartDrawings.id} = ${drawing.id}`);
  }

  private async checkRectangleAlert(drawing: any, currentPrice: number, currentStyle: any) {
    const levelAlerts = currentStyle.levelAlerts;
    if (!levelAlerts) return;

    const points = drawing.coordinates?.points;
    if (!points || points.length < 2) return;

    // Rectangle has top and bottom levels
    const levelMap: Record<string, number> = {
      'top': 1.0,
      'bottom': 0.0,
    };

    let needsUpdate = false;
    const updatedLevelAlerts = { ...levelAlerts };

    for (const [levelKey, alertConfig] of Object.entries(levelAlerts) as [string, AlertConfig][]) {
      if (!alertConfig.enabled || alertConfig.triggered) continue;

      const levelValue = levelMap[levelKey];
      if (levelValue === undefined) continue;

      const levelPrice = this.getLevelPrice(points, levelValue);
      const levelName = levelKey === 'top' ? 'Top' : 'Bottom';

      const crossDirection = this.detectCrossing(
        alertConfig.lastCheckedPrice,
        currentPrice,
        levelPrice,
        alertConfig.crossUpEnabled,
        alertConfig.crossDownEnabled
      );

      if (crossDirection) {
        console.log(`✅ Rectangle ${levelName} crossed ${crossDirection} for ${drawing.symbol}`);
        
        await this.sendCryptoNotification(drawing.userId, {
          title: `📦 Rectangle Alert: ${drawing.symbol}`,
          body: `Price broke ${crossDirection} rectangle ${levelName} at $${levelPrice.toFixed(4)}`,
          tag: `rectangle-${drawing.id}-${levelKey}`,
        });

        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          triggered: true,
          triggerTime: Date.now(),
          lastCheckedPrice: currentPrice,
        };
        needsUpdate = true;
      } else {
        updatedLevelAlerts[levelKey] = {
          ...alertConfig,
          lastCheckedPrice: currentPrice,
        };
      }
    }

    // Always update lastCheckedPrice, but only update updatedAt when alerts trigger
    const { db } = await import("../db");
    const { chartDrawings } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");

    const updatePayload: any = {
      style: {
        ...currentStyle,
        levelAlerts: updatedLevelAlerts,
      },
    };
    
    if (needsUpdate) {
      updatePayload.updatedAt = new Date();
    }

    await db.update(chartDrawings).set(updatePayload).where(sql`${chartDrawings.id} = ${drawing.id}`);
  }

  private async fetchCandleData(symbol: string, timeframe: string): Promise<any[]> {
    try {
      // Map timeframes to Binance intervals
      const intervalMap: Record<string, string> = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d'
      };

      const interval = intervalMap[timeframe] || '15m';
      
      // Fetch from Binance API
      const response = await fetch(
        `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch candles for ${symbol}: ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      
      // Transform to candle format: [openTime, open, high, low, close, volume, ...]
      return data.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000), // Convert ms to seconds
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    } catch (error) {
      console.error(`Error fetching candle data for ${symbol}/${timeframe}:`, error);
      return [];
    }
  }
}

export const priceMonitorService = new PriceMonitorService();
