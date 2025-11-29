import { storage } from "../storage";
import webpush from "web-push";

interface PriceData {
  symbol: string;
  price: number;
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
    }, this.CHECK_INTERVAL);

    // Run initial checks
    await this.checkAllTrackedTrades();
    await this.checkAllIndicatorAlerts();
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
      const publicKey = process.env.PUBLIC_VAPID_KEY;
      const privateKey = process.env.PRIVATE_VAPID_KEY;
      
      if (!publicKey || !privateKey) {
        console.log("Push notifications require VAPID keys - PUBLIC_VAPID_KEY and PRIVATE_VAPID_KEY");
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
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [user] = await db.select().from(users).where(eq(users.id, userId.toString()));
      
      // Only send notifications to intermediate+ tiers
      const allowedTiers = ['intermediate', 'professional', 'elite'];
      if (!user || !allowedTiers.includes(user.subscriptionTier?.toLowerCase() || '')) {
        console.log(`User ${userId} tier (${user?.subscriptionTier}) not eligible for trade notifications`);
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
      const publicKey = process.env.PUBLIC_VAPID_KEY;
      const privateKey = process.env.PRIVATE_VAPID_KEY;
      
      if (!publicKey || !privateKey) {
        console.log("Push notifications require VAPID keys - PUBLIC_VAPID_KEY and PRIVATE_VAPID_KEY");
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
