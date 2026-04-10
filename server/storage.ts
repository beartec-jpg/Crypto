import { type FeedbackBoard, type InsertFeedbackBoard, type FeedbackBoardReply, type InsertFeedbackBoardReply, type ElliottWaveLabel, type InsertElliottWaveLabel, type CachedCandles, type InsertCachedCandles } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Feedback Board (rolling suggestions board)
  createFeedbackBoard(post: InsertFeedbackBoard): Promise<FeedbackBoard>;
  listFeedbackBoard(): Promise<FeedbackBoard[]>;
  deleteFeedbackBoard(id: string): Promise<boolean>;
  createFeedbackBoardReply(reply: InsertFeedbackBoardReply): Promise<FeedbackBoardReply>;
  getFeedbackBoardReplies(feedbackId: string): Promise<FeedbackBoardReply[]>;
  deleteFeedbackBoardReply(id: string): Promise<boolean>;

  // Elliott Wave Labels (elite tier only)
  createElliottWaveLabel(label: InsertElliottWaveLabel): Promise<ElliottWaveLabel>;
  getElliottWaveLabels(userId: string, symbol: string, timeframe: string): Promise<ElliottWaveLabel[]>;
  getElliottWaveLabel(id: string): Promise<ElliottWaveLabel | undefined>;
  updateElliottWaveLabel(id: string, label: Partial<InsertElliottWaveLabel>): Promise<ElliottWaveLabel | undefined>;
  deleteElliottWaveLabel(id: string): Promise<boolean>;
  deleteElliottWaveLabelsByUserSymbolTimeframe(userId: string, symbol: string, timeframe: string): Promise<boolean>;

  // Cached Historical Candles (for extended EW analysis)
  getCachedCandles(symbol: string, timeframe: string): Promise<CachedCandles | undefined>;
  upsertCachedCandles(candles: InsertCachedCandles): Promise<CachedCandles>;

  // Analytics
  logAnalyticsEvent(event: any): Promise<void>;
  logApiUsage(usage: any): Promise<void>;
  getAnalyticsDashboard(startDate: Date): Promise<any>;
  getRealtimeAnalytics(): Promise<any>;
  getTopAnalytics(type: string, limit: number): Promise<any>;
  getApiCostBreakdown(startDate: Date): Promise<any>;
}

export class MemStorage implements IStorage {
  private feedbackBoardPosts: Map<string, FeedbackBoard>;
  private feedbackBoardRepliesMap: Map<string, FeedbackBoardReply>;

  constructor() {
    this.feedbackBoardPosts = new Map();
    this.feedbackBoardRepliesMap = new Map();
  }

  // Feedback Board
  async createFeedbackBoard(post: InsertFeedbackBoard): Promise<FeedbackBoard> {
    const id = randomUUID();
    const now = new Date();
    const feedbackPost: FeedbackBoard = {
      id,
      userEmail: post.userEmail || null,
      userName: post.userName || null,
      content: post.content,
      createdAt: now,
    };
    this.feedbackBoardPosts.set(id, feedbackPost);
    return feedbackPost;
  }

  async listFeedbackBoard(): Promise<FeedbackBoard[]> {
    return Array.from(this.feedbackBoardPosts.values()).sort((a, b) => 
      (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async deleteFeedbackBoard(id: string): Promise<boolean> {
    const deleted = this.feedbackBoardPosts.delete(id);
    if (deleted) {
      Array.from(this.feedbackBoardRepliesMap.entries())
        .filter(([_, reply]) => reply.feedbackId === id)
        .forEach(([replyId]) => this.feedbackBoardRepliesMap.delete(replyId));
    }
    return deleted;
  }

  async createFeedbackBoardReply(reply: InsertFeedbackBoardReply): Promise<FeedbackBoardReply> {
    const id = randomUUID();
    const now = new Date();
    const replyData: FeedbackBoardReply = {
      id,
      feedbackId: reply.feedbackId,
      responderEmail: reply.responderEmail || null,
      responderName: reply.responderName || null,
      content: reply.content,
      isAdminReply: reply.isAdminReply || false,
      createdAt: now,
    };
    this.feedbackBoardRepliesMap.set(id, replyData);
    return replyData;
  }

  async getFeedbackBoardReplies(feedbackId: string): Promise<FeedbackBoardReply[]> {
    return Array.from(this.feedbackBoardRepliesMap.values())
      .filter(reply => reply.feedbackId === feedbackId)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  }

  async deleteFeedbackBoardReply(id: string): Promise<boolean> {
    return this.feedbackBoardRepliesMap.delete(id);
  }

  // Elliott Wave Labels (stub - uses database storage in production)
  async createElliottWaveLabel(_label: InsertElliottWaveLabel): Promise<ElliottWaveLabel> {
    throw new Error("Elliott Wave labels require database storage");
  }
  async getElliottWaveLabels(_userId: string, _symbol: string, _timeframe: string): Promise<ElliottWaveLabel[]> { return []; }
  async getElliottWaveLabel(_id: string): Promise<ElliottWaveLabel | undefined> { return undefined; }
  async updateElliottWaveLabel(_id: string, _label: Partial<InsertElliottWaveLabel>): Promise<ElliottWaveLabel | undefined> { return undefined; }
  async deleteElliottWaveLabel(_id: string): Promise<boolean> { return false; }
  async deleteElliottWaveLabelsByUserSymbolTimeframe(_userId: string, _symbol: string, _timeframe: string): Promise<boolean> { return false; }

  // Cached Candles (stub - uses database storage in production)
  async getCachedCandles(_symbol: string, _timeframe: string): Promise<CachedCandles | undefined> { return undefined; }
  async upsertCachedCandles(_candles: InsertCachedCandles): Promise<CachedCandles> { throw new Error("Cached candles require database storage"); }

  // Analytics stubs (uses database in production)
  async logAnalyticsEvent(_event: any): Promise<void> {}
  async logApiUsage(_usage: any): Promise<void> {}
  async getAnalyticsDashboard(_startDate: Date): Promise<any> { return {}; }
  async getRealtimeAnalytics(): Promise<any> { return {}; }
  async getTopAnalytics(_type: string, _limit: number): Promise<any> { return []; }
  async getApiCostBreakdown(_startDate: Date): Promise<any> { return { breakdown: [], totals: {} }; }
}

import { DatabaseStorage } from "./databaseStorage";

// Use database storage for production
export const storage = new DatabaseStorage();
