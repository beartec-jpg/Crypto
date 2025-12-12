import type { User, UpsertUser, Project, PipeConfiguration, MeterConfiguration, Calculation, InsertProject, InsertPipeConfiguration, InsertMeterConfiguration, InsertCalculation, CompanyBranding, InsertCompanyBranding, Feedback, InsertFeedback, FeedbackBoard, InsertFeedbackBoard, FeedbackBoardReply, InsertFeedbackBoardReply, ElliottWaveLabel, InsertElliottWaveLabel, CachedCandles, InsertCachedCandles } from "@shared/schema";
import { db } from "./db";
import { users, projects, pipeConfigurations, meterConfigurations, calculations, companyBranding, feedback, feedbackBoard, feedbackBoardReplies } from "@shared/schema";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // User operations - Required for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    console.log('🔍 DATABASE UPSERT DEBUG:');
    console.log('  - Received userData:', userData);
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,  // Changed from email to id for proper user matching
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          // CRITICAL FIX: Include subscription fields in updates!
          stripeCustomerId: userData.stripeCustomerId,
          stripeSubscriptionId: userData.stripeSubscriptionId,
          subscriptionTier: userData.subscriptionTier,
          subscriptionStatus: userData.subscriptionStatus,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log('  - Database returned user:', user);
    return user;
  }

  async updateUserSubscription(userId: string, customerId: string, subscriptionId: string, tier: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionTier: tier,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Projects
  async createProject(insertProject: InsertProject): Promise<Project> {
    const projectData = {
      reference: insertProject.reference,
      engineerName: insertProject.engineerName,
      installationType: insertProject.installationType,
      maxOperatingPressure: insertProject.maxOperatingPressure !== undefined ? String(insertProject.maxOperatingPressure) : null,
      maxIncidentalPressure: insertProject.maxIncidentalPressure !== undefined ? String(insertProject.maxIncidentalPressure) : null,
      gasType: insertProject.gasType || "Natural Gas",
      operationType: insertProject.operationType || "Purge",
      purgeMethod: insertProject.purgeMethod || null,
      safetyFactor: insertProject.safetyFactor !== undefined ? String(insertProject.safetyFactor) : "1.5",
      gasMeterPurgeVolume: insertProject.gasMeterPurgeVolume !== undefined ? String(insertProject.gasMeterPurgeVolume) : null,
      zoneType: insertProject.zoneType || null,
      gaugeType: insertProject.gaugeType || null,
      testMedium: insertProject.testMedium || null,
      testPressure: insertProject.testPressure !== undefined ? String(insertProject.testPressure) : null,
      stabilizationTime: insertProject.stabilizationTime || null,
      maxPressureDropPercent: insertProject.maxPressureDropPercent !== undefined ? String(insertProject.maxPressureDropPercent) : null,
      roomVolume: insertProject.roomVolume !== undefined ? String(insertProject.roomVolume) : null,
      actualPressureDrop: insertProject.actualPressureDrop !== undefined ? String(insertProject.actualPressureDrop) : null,
      testResult: insertProject.testResult || null,
      actualLeakageRate: insertProject.actualLeakageRate !== undefined ? String(insertProject.actualLeakageRate) : null,
      mplr: insertProject.mplr !== undefined ? String(insertProject.mplr) : null,
      actualFlowRate: insertProject.actualFlowRate !== undefined ? String(insertProject.actualFlowRate) : null,
      actualGasContent: insertProject.actualGasContent !== undefined ? String(insertProject.actualGasContent) : null,
      purgeResult: insertProject.purgeResult || null,
    };
    const [project] = await db.insert(projects).values(projectData).returning();
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async updateProject(id: string, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    // Only include fields that are actually provided in updateData
    const updateFields: any = { updatedAt: new Date() };
    
    if (updateData.reference !== undefined) updateFields.reference = updateData.reference;
    if (updateData.engineerName !== undefined) updateFields.engineerName = updateData.engineerName;
    if (updateData.installationType !== undefined) updateFields.installationType = updateData.installationType;
    if (updateData.maxOperatingPressure !== undefined) updateFields.maxOperatingPressure = String(updateData.maxOperatingPressure);
    if (updateData.maxIncidentalPressure !== undefined) updateFields.maxIncidentalPressure = String(updateData.maxIncidentalPressure);
    if (updateData.gasType !== undefined) updateFields.gasType = updateData.gasType;
    if (updateData.operationType !== undefined) updateFields.operationType = updateData.operationType;
    if (updateData.purgeMethod !== undefined) updateFields.purgeMethod = updateData.purgeMethod;
    if (updateData.safetyFactor !== undefined) updateFields.safetyFactor = String(updateData.safetyFactor);
    if (updateData.gasMeterPurgeVolume !== undefined) updateFields.gasMeterPurgeVolume = String(updateData.gasMeterPurgeVolume);
    if (updateData.zoneType !== undefined) updateFields.zoneType = updateData.zoneType;
    if (updateData.gaugeType !== undefined) updateFields.gaugeType = updateData.gaugeType;
    if (updateData.testMedium !== undefined) updateFields.testMedium = updateData.testMedium;
    if (updateData.testPressure !== undefined) updateFields.testPressure = String(updateData.testPressure);
    if (updateData.stabilizationTime !== undefined) updateFields.stabilizationTime = updateData.stabilizationTime;
    if (updateData.maxPressureDropPercent !== undefined) updateFields.maxPressureDropPercent = String(updateData.maxPressureDropPercent);
    if (updateData.roomVolume !== undefined) updateFields.roomVolume = String(updateData.roomVolume);
    if (updateData.actualPressureDrop !== undefined) updateFields.actualPressureDrop = String(updateData.actualPressureDrop);
    if (updateData.testResult !== undefined) updateFields.testResult = updateData.testResult;
    if (updateData.actualLeakageRate !== undefined) updateFields.actualLeakageRate = String(updateData.actualLeakageRate);
    if (updateData.mplr !== undefined) updateFields.mplr = String(updateData.mplr);
    if (updateData.actualFlowRate !== undefined) updateFields.actualFlowRate = String(updateData.actualFlowRate);
    if (updateData.actualGasContent !== undefined) updateFields.actualGasContent = String(updateData.actualGasContent);
    if (updateData.purgeResult !== undefined) updateFields.purgeResult = updateData.purgeResult;

    const [project] = await db
      .update(projects)
      .set(updateFields)
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async listProjects(): Promise<Project[]> {
    return await db.select().from(projects);
  }

  // Pipe Configurations
  async createPipeConfiguration(config: InsertPipeConfiguration): Promise<PipeConfiguration> {
    const [pipeConfig] = await db.insert(pipeConfigurations).values(config).returning();
    return pipeConfig;
  }

  async getPipeConfigurationsByProject(projectId: string): Promise<PipeConfiguration[]> {
    return await db.select().from(pipeConfigurations).where(eq(pipeConfigurations.projectId, projectId));
  }

  async deletePipeConfigurationsByProject(projectId: string): Promise<boolean> {
    const result = await db.delete(pipeConfigurations).where(eq(pipeConfigurations.projectId, projectId));
    return (result.rowCount ?? 0) > 0;
  }

  // Meter Configurations
  async createMeterConfiguration(config: InsertMeterConfiguration): Promise<MeterConfiguration> {
    const [meterConfig] = await db.insert(meterConfigurations).values(config).returning();
    return meterConfig;
  }

  async getMeterConfigurationsByProject(projectId: string): Promise<MeterConfiguration[]> {
    return await db.select().from(meterConfigurations).where(eq(meterConfigurations.projectId, projectId));
  }

  async deleteMeterConfigurationsByProject(projectId: string): Promise<boolean> {
    const result = await db.delete(meterConfigurations).where(eq(meterConfigurations.projectId, projectId));
    return (result.rowCount ?? 0) > 0;
  }

  // Calculations
  async createCalculation(calculation: InsertCalculation): Promise<Calculation> {
    // Convert numeric fields to strings for decimal columns
    const calculationData = {
      ...calculation,
      totalPipeVolume: String(calculation.totalPipeVolume),
      totalFittingsVolume: String(calculation.totalFittingsVolume),
      totalMeterVolume: calculation.totalMeterVolume ? String(calculation.totalMeterVolume) : null,
      totalMeterCyclicVolume: calculation.totalMeterCyclicVolume ? String(calculation.totalMeterCyclicVolume) : null,
      totalSystemVolume: String(calculation.totalSystemVolume),
      gasMeterPurgeVolume: calculation.gasMeterPurgeVolume ? String(calculation.gasMeterPurgeVolume) : null,
      requiredPurgeVolume: calculation.requiredPurgeVolume ? String(calculation.requiredPurgeVolume) : null,
      minimumFlowRate: calculation.minimumFlowRate ? String(calculation.minimumFlowRate) : null,
      testPressure: calculation.testPressure ? String(calculation.testPressure) : null,
      maxPressureDrop: calculation.maxPressureDrop ? String(calculation.maxPressureDrop) : null,
      maxPressureDropPercent: calculation.maxPressureDropPercent ? String(calculation.maxPressureDropPercent) : null,
      actualPressureDrop: calculation.actualPressureDrop ? String(calculation.actualPressureDrop) : null,
      actualLeakageRate: calculation.actualLeakageRate ? String(calculation.actualLeakageRate) : null,
      mplr: calculation.mplr ? String(calculation.mplr) : null,
      largestPipeDiameter: calculation.largestPipeDiameter ? String(calculation.largestPipeDiameter) : null,
    };
    const [calc] = await db.insert(calculations).values(calculationData).returning();
    return calc;
  }

  async getCalculationByProject(projectId: string): Promise<Calculation | undefined> {
    const [calc] = await db.select().from(calculations).where(eq(calculations.projectId, projectId));
    return calc;
  }

  async deleteCalculationByProject(projectId: string): Promise<boolean> {
    const result = await db.delete(calculations).where(eq(calculations.projectId, projectId));
    return (result.rowCount ?? 0) > 0;
  }

  // Company Branding
  async getCompanyBranding(userId: string): Promise<CompanyBranding | undefined> {
    const [branding] = await db.select().from(companyBranding)
      .where(eq(companyBranding.userId, userId));
    return branding;
  }

  async upsertCompanyBranding(brandingData: InsertCompanyBranding): Promise<CompanyBranding> {
    const cleanedData = {
      ...brandingData,
      engineerName: brandingData.engineerName || null,
      companyAddress: brandingData.companyAddress || null,
      companyPhone: brandingData.companyPhone || null,
      companyEmail: brandingData.companyEmail || null,
      companyWebsite: brandingData.companyWebsite || null,
      logoUrl: brandingData.logoUrl || null,
      headerLogoUrl: brandingData.headerLogoUrl || null,
      footerText: brandingData.footerText || null,
      primaryColor: brandingData.primaryColor || "#2563eb",
      secondaryColor: brandingData.secondaryColor || "#64748b",
      gasSafeNumber: brandingData.gasSafeNumber || null,
      engineerSignatureUrl: brandingData.engineerSignatureUrl || null,
      isActive: brandingData.isActive ?? true,
    };
    
    const [branding] = await db
      .insert(companyBranding)
      .values(cleanedData)
      .onConflictDoUpdate({
        target: companyBranding.userId,
        set: {
          ...cleanedData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return branding;
  }

  async deleteCompanyBranding(userId: string): Promise<boolean> {
    const result = await db.delete(companyBranding).where(eq(companyBranding.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  // Feedback operations
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [createdFeedback] = await db
      .insert(feedback)
      .values({
        userId: feedbackData.userId || null,
        rating: feedbackData.rating,
        comment: feedbackData.comment,
      })
      .returning();
    return createdFeedback;
  }

  async listFeedback(): Promise<Feedback[]> {
    const feedbackList = await db
      .select()
      .from(feedback)
      .orderBy(feedback.createdAt);
    return feedbackList.reverse(); // Most recent first
  }

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
      .where(eq(trackedTrades.id, id));
  }

  async getPushSubscriptionsByUserId(userId: number): Promise<any[]> {
    const { pushSubscriptions } = await import("@shared/schema");
    
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    
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
      .where(eq(pushSubscriptions.id, id));
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
    
    const result = await db
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
}