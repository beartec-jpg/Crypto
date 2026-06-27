import type { FeedbackBoard, InsertFeedbackBoard, FeedbackBoardReply, InsertFeedbackBoardReply, ElliottWaveLabel, InsertElliottWaveLabel, CachedCandles, InsertCachedCandles, UserOscillatorPreferences } from "@shared/schema";
import { db } from "./db";
import { feedbackBoard, feedbackBoardReplies } from "@shared/schema";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // Feedback Board operations
  async createFeedbackBoard(post: InsertFeedbackBoard): Promise<FeedbackBoard> {
    const [created] = await db
      .insert(feedbackBoard)
      .values({
        userEmail: post.userEmail || null,
        userName: post.userName || null,
        content: post.content,
      })
      .returning();
    return created;
  }

  async listFeedbackBoard(): Promise<FeedbackBoard[]> {
    const posts = await db
      .select()
      .from(feedbackBoard)
      .orderBy(desc(feedbackBoard.createdAt));
    return posts;
  }

  async deleteFeedbackBoard(id: string): Promise<boolean> {
    const result = await db.delete(feedbackBoard).where(eq(feedbackBoard.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createFeedbackBoardReply(reply: InsertFeedbackBoardReply): Promise<FeedbackBoardReply> {
    const [created] = await db
      .insert(feedbackBoardReplies)
      .values({
        feedbackId: reply.feedbackId,
        responderEmail: reply.responderEmail || null,
        responderName: reply.responderName || null,
        content: reply.content,
        isAdminReply: reply.isAdminReply || false,
      })
      .returning();
    return created;
  }

  async getFeedbackBoardReplies(feedbackId: string): Promise<FeedbackBoardReply[]> {
    const replies = await db
      .select()
      .from(feedbackBoardReplies)
      .where(eq(feedbackBoardReplies.feedbackId, feedbackId))
      .orderBy(feedbackBoardReplies.createdAt);
    return replies;
  }

  async deleteFeedbackBoardReply(id: string): Promise<boolean> {
    const result = await db.delete(feedbackBoardReplies).where(eq(feedbackBoardReplies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Tracked Trades operations for price monitoring
  async getActiveTrackedTrades(): Promise<any[]> {
    const { trackedTrades } = await import("@shared/schema");
    const { or } = await import("drizzle-orm");
    
    const trades = await db
      .select()
      .from(trackedTrades)
      .where(or(
        eq(trackedTrades.status, "pending"),
        eq(trackedTrades.status, "entry_hit")
      ));
    
    return trades
      .filter(trade => trade.entry && trade.stopLoss && trade.targets && trade.targets.length > 0)
      .map(trade => ({
        ...trade,
        entry: parseFloat(trade.entry!),
        stopLoss: parseFloat(trade.stopLoss!),
        targets: trade.targets!.map((t: string) => parseFloat(t)),
      }));
  }

  async updateTrackedTradeStatus(id: number, status: string): Promise<void> {
    const { trackedTrades } = await import("@shared/schema");
    
    await db
      .update(trackedTrades)
      .set({ status })
      .where(eq(trackedTrades.id, String(id)));
  }

  async getPushSubscriptionsByUserId(userId: number): Promise<any[]> {
    const { pushSubscriptions } = await import("@shared/schema");
    
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, String(userId)));
    
    return subs;
  }

  async getCryptoPushSubscriptionsByUserId(userId: string): Promise<any[]> {
    const { pushSubscriptions } = await import("@shared/schema");
    
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    
    return subs;
  }

  async deletePushSubscription(id: number): Promise<void> {
    const { pushSubscriptions } = await import("@shared/schema");
    
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, String(id)));
  }

  // Indicator Alert State operations for CCI/ADX monitoring
  async getIndicatorAlertState(userId: string, symbol: string, timeframe: string): Promise<any | null> {
    const { indicatorAlertState } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    const states = await db
      .select()
      .from(indicatorAlertState)
      .where(and(
        eq(indicatorAlertState.userId, userId),
        eq(indicatorAlertState.symbol, symbol),
        eq(indicatorAlertState.timeframe, timeframe)
      ))
      .limit(1);
    
    return states.length > 0 ? states[0] : null;
  }

  async upsertIndicatorAlertState(state: any): Promise<any> {
    const { indicatorAlertState } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    // Check if state exists
    const existing = await this.getIndicatorAlertState(state.userId, state.symbol, state.timeframe);
    
    if (existing) {
      // Update existing state
      const [updated] = await db
        .update(indicatorAlertState)
        .set({
          lastCci: state.lastCci,
          lastAdx: state.lastAdx,
          lastPlusDi: state.lastPlusDi,
          lastMinusDi: state.lastMinusDi,
          updatedAt: new Date(),
        })
        .where(and(
          eq(indicatorAlertState.userId, state.userId),
          eq(indicatorAlertState.symbol, state.symbol),
          eq(indicatorAlertState.timeframe, state.timeframe)
        ))
        .returning();
      return updated;
    } else {
      // Insert new state
      const [inserted] = await db
        .insert(indicatorAlertState)
        .values({
          userId: state.userId,
          symbol: state.symbol,
          timeframe: state.timeframe,
          lastCci: state.lastCci,
          lastAdx: state.lastAdx,
          lastPlusDi: state.lastPlusDi,
          lastMinusDi: state.lastMinusDi,
        })
        .returning();
      return inserted;
    }
  }

  // Elliott Wave Labels operations
  async createElliottWaveLabel(label: InsertElliottWaveLabel): Promise<ElliottWaveLabel> {
    const { elliottWaveLabels } = await import("@shared/schema");
    
    const [created] = await db
      .insert(elliottWaveLabels)
      .values(label as any)
      .returning();
    
    return created;
  }

  async getElliottWaveLabels(userId: string, symbol: string, timeframe: string): Promise<ElliottWaveLabel[]> {
    const { elliottWaveLabels } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    const labels = await db
      .select()
      .from(elliottWaveLabels)
      .where(and(
        eq(elliottWaveLabels.userId, userId),
        eq(elliottWaveLabels.symbol, symbol),
        eq(elliottWaveLabels.timeframe, timeframe)
      ));
    
    return labels;
  }

  async getElliottWaveLabel(id: string): Promise<ElliottWaveLabel | undefined> {
    const { elliottWaveLabels } = await import("@shared/schema");
    
    const [label] = await db
      .select()
      .from(elliottWaveLabels)
      .where(eq(elliottWaveLabels.id, id));
    
    return label;
  }

  async updateElliottWaveLabel(id: string, labelUpdate: Partial<InsertElliottWaveLabel>): Promise<ElliottWaveLabel | undefined> {
    const { elliottWaveLabels } = await import("@shared/schema");
    
    const [updated] = await db
      .update(elliottWaveLabels)
      .set({
        ...labelUpdate as any,
        updatedAt: new Date(),
      })
      .where(eq(elliottWaveLabels.id, id))
      .returning();
    
    return updated;
  }

  async deleteElliottWaveLabel(id: string): Promise<boolean> {
    const { elliottWaveLabels } = await import("@shared/schema");
    
    const _result = await db
      .delete(elliottWaveLabels)
      .where(eq(elliottWaveLabels.id, id));
    
    return true;
  }

  async deleteElliottWaveLabelsByUserSymbolTimeframe(userId: string, symbol: string, timeframe: string): Promise<boolean> {
    const { elliottWaveLabels } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    await db
      .delete(elliottWaveLabels)
      .where(and(
        eq(elliottWaveLabels.userId, userId),
        eq(elliottWaveLabels.symbol, symbol),
        eq(elliottWaveLabels.timeframe, timeframe)
      ));
    
    return true;
  }

  // Cached Candles operations
  async getCachedCandles(symbol: string, timeframe: string): Promise<CachedCandles | undefined> {
    const { cachedCandles } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    const [cached] = await db
      .select()
      .from(cachedCandles)
      .where(and(
        eq(cachedCandles.symbol, symbol),
        eq(cachedCandles.timeframe, timeframe)
      ));
    
    return cached;
  }

  async upsertCachedCandles(candlesData: InsertCachedCandles): Promise<CachedCandles> {
    const { cachedCandles } = await import("@shared/schema");
    const { and } = await import("drizzle-orm");
    
    // Check if exists
    const existing = await this.getCachedCandles(candlesData.symbol, candlesData.timeframe);
    
    if (existing) {
      const [updated] = await db
        .update(cachedCandles)
        .set({
          startTime: candlesData.startTime,
          endTime: candlesData.endTime,
          candles: candlesData.candles as any,
          candleCount: candlesData.candleCount,
          updatedAt: new Date(),
        })
        .where(and(
          eq(cachedCandles.symbol, candlesData.symbol),
          eq(cachedCandles.timeframe, candlesData.timeframe)
        ))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(cachedCandles)
        .values(candlesData as any)
        .returning();
      return inserted;
    }
  }

  // Oscillator Preferences operations
  async getOscillatorPreferences(userId: string): Promise<UserOscillatorPreferences | undefined> {
    const { userOscillatorPreferences } = await import("@shared/schema");
    const [prefs] = await db
      .select()
      .from(userOscillatorPreferences)
      .where(eq(userOscillatorPreferences.userId, userId));
    return prefs;
  }

  async upsertOscillatorPreferences(userId: string, favoriteOscillators: string[]): Promise<UserOscillatorPreferences> {
    const { userOscillatorPreferences } = await import("@shared/schema");
    const existing = await this.getOscillatorPreferences(userId);

    if (existing) {
      const [updated] = await db
        .update(userOscillatorPreferences)
        .set({
          favoriteOscillators: favoriteOscillators as any,
          updatedAt: new Date(),
        })
        .where(eq(userOscillatorPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(userOscillatorPreferences)
        .values({
          userId,
          favoriteOscillators: favoriteOscillators as any,
        })
        .returning();
      return inserted;
    }
  }

  // ========== ANALYTICS METHODS ==========

  async logAnalyticsEvent(event: any): Promise<void> {
    const { analyticsEvents } = await import("@shared/schema");
    try {
      await db.insert(analyticsEvents).values(event);
    } catch (error) {
      console.error('Failed to log analytics event:', error);
    }
  }

  async logApiUsage(usage: any): Promise<void> {
    const { apiUsageLog } = await import("@shared/schema");
    try {
      await db.insert(apiUsageLog).values(usage);
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
  }

  async getAnalyticsDashboard(startDate: Date): Promise<any> {
    const { analyticsEvents, apiUsageLog, cryptoUsers } = await import("@shared/schema");
    const { sql, gte, count } = await import("drizzle-orm");
    
    // Get total page views
    const pageViews = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, startDate));
    
    // Get unique users
    const uniqueUsers = await db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, startDate));
    
    // Get API calls
    const apiCalls = await db
      .select({ count: count() })
      .from(apiUsageLog)
      .where(gte(apiUsageLog.createdAt, startDate));
    
    // Get AI calls and costs
    const aiStats = await db
      .select({
        count: count(),
        totalTokens: sql<number>`COALESCE(SUM(${apiUsageLog.tokensUsed}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${apiUsageLog.estimatedCost}), 0)`,
      })
      .from(apiUsageLog)
      .where(sql`${apiUsageLog.apiType} = 'ai_analysis' AND ${apiUsageLog.createdAt} >= ${startDate}`);
    
    // Get total registered users
    const totalUsers = await db.select({ count: count() }).from(cryptoUsers);
    
    return {
      totalPageViews: pageViews[0]?.count || 0,
      uniqueUsers: uniqueUsers.length,
      totalApiCalls: apiCalls[0]?.count || 0,
      totalAiCalls: aiStats[0]?.count || 0,
      totalAiTokens: aiStats[0]?.totalTokens || 0,
      estimatedAiCost: aiStats[0]?.totalCost || 0,
      totalRegisteredUsers: totalUsers[0]?.count || 0,
    };
  }

  async getRealtimeAnalytics(): Promise<any> {
    const { analyticsEvents, apiUsageLog: _apiUsageLog } = await import("@shared/schema");
    const { sql: _sql, gte, count } = await import("drizzle-orm");
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Last hour stats
    const lastHourEvents = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, oneHourAgo));
    
    const lastHourUsers = await db
      .selectDistinct({ sessionId: analyticsEvents.sessionId })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, oneHourAgo));
    
    // Last 24h stats
    const last24hEvents = await db
      .select({ count: count() })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, oneDayAgo));
    
    return {
      lastHour: {
        events: lastHourEvents[0]?.count || 0,
        activeSessions: lastHourUsers.length,
      },
      last24Hours: {
        events: last24hEvents[0]?.count || 0,
      },
      serverTime: now.toISOString(),
    };
  }

  async getTopAnalytics(type: string, limit: number): Promise<any> {
    const { analyticsEvents } = await import("@shared/schema");
    const { sql, count, desc: descOrder } = await import("drizzle-orm");
    
    let results: any[] = [];
    
    if (type === 'features') {
      results = await db
        .select({
          name: analyticsEvents.eventName,
          count: count(),
        })
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.eventType} = 'feature_usage'`)
        .groupBy(analyticsEvents.eventName)
        .orderBy(descOrder(count()))
        .limit(limit);
    } else if (type === 'pages') {
      results = await db
        .select({
          name: analyticsEvents.page,
          count: count(),
        })
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.eventType} = 'page_view'`)
        .groupBy(analyticsEvents.page)
        .orderBy(descOrder(count()))
        .limit(limit);
    } else if (type === 'symbols') {
      results = await db
        .select({
          name: analyticsEvents.symbol,
          count: count(),
        })
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.symbol} IS NOT NULL`)
        .groupBy(analyticsEvents.symbol)
        .orderBy(descOrder(count()))
        .limit(limit);
    } else if (type === 'clicks') {
      results = await db
        .select({
          name: analyticsEvents.eventName,
          count: count(),
        })
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.eventType} = 'click'`)
        .groupBy(analyticsEvents.eventName)
        .orderBy(descOrder(count()))
        .limit(limit);
    }
    
    return results;
  }

  async getApiCostBreakdown(startDate: Date): Promise<any> {
    const { apiUsageLog } = await import("@shared/schema");
    const { sql, gte, count } = await import("drizzle-orm");
    
    const breakdown = await db
      .select({
        apiType: apiUsageLog.apiType,
        count: count(),
        totalTokens: sql<number>`COALESCE(SUM(${apiUsageLog.tokensUsed}), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${apiUsageLog.estimatedCost}), 0)`,
        avgResponseTime: sql<number>`AVG(${apiUsageLog.responseTime})`,
        successRate: sql<number>`(SUM(CASE WHEN ${apiUsageLog.success} THEN 1 ELSE 0 END) * 100.0 / COUNT(*))`,
      })
      .from(apiUsageLog)
      .where(gte(apiUsageLog.createdAt, startDate))
      .groupBy(apiUsageLog.apiType);
    
    // Calculate totals
    const totals = breakdown.reduce((acc, row) => ({
      totalCalls: acc.totalCalls + Number(row.count),
      totalTokens: acc.totalTokens + Number(row.totalTokens || 0),
      totalCost: acc.totalCost + Number(row.totalCost || 0),
    }), { totalCalls: 0, totalTokens: 0, totalCost: 0 });
    
    return {
      breakdown,
      totals,
    };
  }
}
