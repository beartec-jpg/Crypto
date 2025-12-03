import { type Project, type PipeConfiguration, type MeterConfiguration, type Calculation, type InsertProject, type InsertPipeConfiguration, type InsertMeterConfiguration, type InsertCalculation, type User, type UpsertUser, type CompanyBranding, type InsertCompanyBranding, type Feedback, type InsertFeedback, type ElliottWaveLabel, type InsertElliottWaveLabel, type CachedCandles, type InsertCachedCandles } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users (required for authentication)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Company Branding
  getCompanyBranding(userId: string): Promise<CompanyBranding | undefined>;
  upsertCompanyBranding(branding: InsertCompanyBranding): Promise<CompanyBranding>;
  deleteCompanyBranding(userId: string): Promise<boolean>;

  // Projects
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  listProjects(): Promise<Project[]>;

  // Pipe Configurations
  createPipeConfiguration(config: InsertPipeConfiguration): Promise<PipeConfiguration>;
  getPipeConfigurationsByProject(projectId: string): Promise<PipeConfiguration[]>;
  deletePipeConfigurationsByProject(projectId: string): Promise<boolean>;

  // Meter Configurations
  createMeterConfiguration(config: InsertMeterConfiguration): Promise<MeterConfiguration>;
  getMeterConfigurationsByProject(projectId: string): Promise<MeterConfiguration[]>;
  deleteMeterConfigurationsByProject(projectId: string): Promise<boolean>;

  // Calculations
  createCalculation(calculation: InsertCalculation): Promise<Calculation>;
  getCalculationByProject(projectId: string): Promise<Calculation | undefined>;
  deleteCalculationByProject(projectId: string): Promise<boolean>;

  // Feedback
  createFeedback(feedback: InsertFeedback): Promise<Feedback>;
  listFeedback(): Promise<Feedback[]>;

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private projects: Map<string, Project>;
  private pipeConfigurations: Map<string, PipeConfiguration>;
  private meterConfigurations: Map<string, MeterConfiguration>;
  private calculations: Map<string, Calculation>;
  private companyBrandings: Map<string, CompanyBranding>;
  private feedback: Map<string, Feedback>;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.pipeConfigurations = new Map();
    this.meterConfigurations = new Map();
    this.calculations = new Map();
    this.companyBrandings = new Map();
    this.feedback = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Fix TypeScript iterator issue
    const usersArray = Array.from(this.users.values());
    for (const user of usersArray) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    // Fix: userData.id can be undefined, handle it properly
    if (!userData.id) {
      throw new Error('User ID is required for upsert');
    }
    const existingUser = this.users.get(userData.id);
    
    console.log('🔍 UPSERT DEBUG:');
    console.log('  - Received userData.subscriptionTier:', userData.subscriptionTier);
    console.log('  - Existing user tier:', existingUser?.subscriptionTier);
    
    // Fix the tier assignment logic - properly handle undefined vs null vs actual values
    let finalTier: string;
    if (userData.subscriptionTier !== undefined && userData.subscriptionTier !== null) {
      finalTier = userData.subscriptionTier;
      console.log('  - Using new tier from userData:', finalTier);
    } else if (existingUser?.subscriptionTier) {
      finalTier = existingUser.subscriptionTier;
      console.log('  - Using existing user tier:', finalTier);
    } else {
      finalTier = "free";
      console.log('  - Defaulting to free tier');
    }
    
    const user: User = {
      id: userData.id,
      email: userData.email || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      stripeCustomerId: userData.stripeCustomerId ?? existingUser?.stripeCustomerId ?? null,
      stripeSubscriptionId: userData.stripeSubscriptionId ?? existingUser?.stripeSubscriptionId ?? null,
      subscriptionTier: finalTier,
      subscriptionStatus: userData.subscriptionStatus ?? existingUser?.subscriptionStatus ?? "active",
      createdAt: existingUser?.createdAt ?? now,
      updatedAt: now,
    };
    
    console.log('  - Final user object tier:', user.subscriptionTier);
    
    this.users.set(userData.id, user);
    return user;
  }

  // Projects
  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
      ...insertProject,
      id,
      maxOperatingPressure: insertProject.maxOperatingPressure ? String(insertProject.maxOperatingPressure) : null,
      maxIncidentalPressure: insertProject.maxIncidentalPressure !== undefined ? String(insertProject.maxIncidentalPressure || '') || null : null,
      gasType: insertProject.gasType || "Natural Gas",
      operationType: insertProject.operationType || "Purge",
      purgeMethod: insertProject.purgeMethod || null,
      safetyFactor: String(insertProject.safetyFactor || "1.5"),
      gasMeterPurgeVolume: insertProject.gasMeterPurgeVolume !== undefined ? String(insertProject.gasMeterPurgeVolume || '') || null : null,
      zoneType: insertProject.zoneType || null,
      testPressure: insertProject.testPressure ? String(insertProject.testPressure) : null,
      testResult: insertProject.testResult || null,
      maxPressureDrop: insertProject.maxPressureDrop || null,
      maxPressureDropPercent: insertProject.maxPressureDropPercent || null,
      actualPressureDrop: insertProject.actualPressureDrop || null,
      stabilizationTime: insertProject.stabilizationTime || null,
      complianceNotes: insertProject.complianceNotes || null,
      isCompliant: insertProject.isCompliant ?? false,
      totalSystemVolume: insertProject.totalSystemVolume || null,
      totalPipeLength: insertProject.totalPipeLength || null,
      totalPurgeVolume: insertProject.totalPurgeVolume || null,
      directPurgeVolume: insertProject.directPurgeVolume || null,
      letByVolume: insertProject.letByVolume || null,
      purgeRate: insertProject.purgeRate || null,
      purgeResult: insertProject.purgeResult || null,
      createdAt: now,
      updatedAt: now,
    } as Project;
    this.projects.set(id, project);
    return project;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async updateProject(id: string, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;

    const normalizedUpdate: Partial<Project> = {
      ...updateData,
      maxOperatingPressure: updateData.maxOperatingPressure !== undefined 
        ? (typeof updateData.maxOperatingPressure === 'number' ? String(updateData.maxOperatingPressure) : updateData.maxOperatingPressure) 
        : existing.maxOperatingPressure,
      maxIncidentalPressure: updateData.maxIncidentalPressure !== undefined 
        ? (typeof updateData.maxIncidentalPressure === 'number' ? String(updateData.maxIncidentalPressure) : updateData.maxIncidentalPressure) 
        : existing.maxIncidentalPressure,
      updatedAt: new Date(),
    };

    const updated: Project = {
      ...existing,
      ...normalizedUpdate,
    } as Project;
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    // Also delete related configurations and calculations
    await this.deletePipeConfigurationsByProject(id);
    await this.deleteMeterConfigurationsByProject(id);
    await this.deleteCalculationByProject(id);
    return this.projects.delete(id);
  }

  async listProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => 
      (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
    );
  }

  // Pipe Configurations
  async createPipeConfiguration(insertConfig: InsertPipeConfiguration): Promise<PipeConfiguration> {
    const id = randomUUID();
    const config: PipeConfiguration = {
      ...insertConfig,
      id,
      fittingsQuantity: insertConfig.fittingsQuantity || 0,
    };
    this.pipeConfigurations.set(id, config);
    return config;
  }

  async getPipeConfigurationsByProject(projectId: string): Promise<PipeConfiguration[]> {
    return Array.from(this.pipeConfigurations.values())
      .filter(config => config.projectId === projectId);
  }

  async deletePipeConfigurationsByProject(projectId: string): Promise<boolean> {
    const toDelete = Array.from(this.pipeConfigurations.entries())
      .filter(([_, config]) => config.projectId === projectId)
      .map(([id, _]) => id);
    
    toDelete.forEach(id => this.pipeConfigurations.delete(id));
    return true;
  }

  // Meter Configurations
  async createMeterConfiguration(insertConfig: InsertMeterConfiguration): Promise<MeterConfiguration> {
    const id = randomUUID();
    const config: MeterConfiguration = {
      ...insertConfig,
      id,
      quantity: insertConfig.quantity || 1,
    };
    this.meterConfigurations.set(id, config);
    return config;
  }

  async getMeterConfigurationsByProject(projectId: string): Promise<MeterConfiguration[]> {
    return Array.from(this.meterConfigurations.values())
      .filter(config => config.projectId === projectId);
  }

  async deleteMeterConfigurationsByProject(projectId: string): Promise<boolean> {
    const toDelete = Array.from(this.meterConfigurations.entries())
      .filter(([_, config]) => config.projectId === projectId)
      .map(([id, _]) => id);
    
    toDelete.forEach(id => this.meterConfigurations.delete(id));
    return true;
  }

  // Calculations
  async createCalculation(insertCalculation: InsertCalculation): Promise<Calculation> {
    const id = randomUUID();
    const calculation: Calculation = {
      ...insertCalculation,
      id,
      isCompliant: insertCalculation.isCompliant !== undefined ? insertCalculation.isCompliant : true,
      complianceNotes: insertCalculation.complianceNotes || null,
      actualPressureDrop: insertCalculation.actualPressureDrop !== undefined 
        ? (typeof insertCalculation.actualPressureDrop === 'number' ? String(insertCalculation.actualPressureDrop) : insertCalculation.actualPressureDrop) 
        : null,
      testResult: insertCalculation.testResult || null,
      actualLeakageRate: insertCalculation.actualLeakageRate !== undefined 
        ? (typeof insertCalculation.actualLeakageRate === 'number' ? String(insertCalculation.actualLeakageRate) : insertCalculation.actualLeakageRate) 
        : null,
      mplr: insertCalculation.mplr !== undefined 
        ? (typeof insertCalculation.mplr === 'number' ? String(insertCalculation.mplr) : insertCalculation.mplr) 
        : null,
      calculatedAt: new Date(),
    };
    this.calculations.set(id, calculation);
    return calculation;
  }

  async getCalculationByProject(projectId: string): Promise<Calculation | undefined> {
    return Array.from(this.calculations.values())
      .find(calc => calc.projectId === projectId);
  }

  async deleteCalculationByProject(projectId: string): Promise<boolean> {
    const toDelete = Array.from(this.calculations.entries())
      .filter(([_, calc]) => calc.projectId === projectId)
      .map(([id, _]) => id);
    
    toDelete.forEach(id => this.calculations.delete(id));
    return true;
  }

  // Company Branding
  async getCompanyBranding(userId: string): Promise<CompanyBranding | undefined> {
    return Array.from(this.companyBrandings.values())
      .find(branding => branding.userId === userId && branding.isActive);
  }

  async upsertCompanyBranding(brandingData: InsertCompanyBranding): Promise<CompanyBranding> {
    const now = new Date();
    const existingBranding = Array.from(this.companyBrandings.values())
      .find(b => b.userId === brandingData.userId);
    
    const branding: CompanyBranding = {
      id: existingBranding?.id || randomUUID(),
      ...brandingData,
      createdAt: existingBranding?.createdAt || now,
      updatedAt: now,
    };
    
    this.companyBrandings.set(branding.id, branding);
    return branding;
  }

  async deleteCompanyBranding(userId: string): Promise<boolean> {
    const toDelete = Array.from(this.companyBrandings.entries())
      .filter(([_, branding]) => branding.userId === userId)
      .map(([id, _]) => id);
    
    toDelete.forEach(id => this.companyBrandings.delete(id));
    return toDelete.length > 0;
  }

  // Feedback
  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    const id = randomUUID();
    const now = new Date();
    const feedback: Feedback = {
      id,
      userId: insertFeedback.userId || null,
      rating: insertFeedback.rating,
      comment: insertFeedback.comment,
      createdAt: now,
    };
    this.feedback.set(id, feedback);
    return feedback;
  }

  async listFeedback(): Promise<Feedback[]> {
    return Array.from(this.feedback.values()).sort((a, b) => 
      (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  // Elliott Wave Labels (stub - uses database storage in production)
  async createElliottWaveLabel(_label: InsertElliottWaveLabel): Promise<ElliottWaveLabel> {
    throw new Error("Elliott Wave labels require database storage");
  }

  async getElliottWaveLabels(_userId: string, _symbol: string, _timeframe: string): Promise<ElliottWaveLabel[]> {
    return [];
  }

  async getElliottWaveLabel(_id: string): Promise<ElliottWaveLabel | undefined> {
    return undefined;
  }

  async updateElliottWaveLabel(_id: string, _label: Partial<InsertElliottWaveLabel>): Promise<ElliottWaveLabel | undefined> {
    return undefined;
  }

  async deleteElliottWaveLabel(_id: string): Promise<boolean> {
    return false;
  }

  async deleteElliottWaveLabelsByUserSymbolTimeframe(_userId: string, _symbol: string, _timeframe: string): Promise<boolean> {
    return false;
  }

  // Cached Candles (stub - uses database storage in production)
  async getCachedCandles(_symbol: string, _timeframe: string): Promise<CachedCandles | undefined> {
    return undefined;
  }

  async upsertCachedCandles(_candles: InsertCachedCandles): Promise<CachedCandles> {
    throw new Error("Cached candles require database storage");
  }
}

import { DatabaseStorage } from "./databaseStorage";

// Use database storage for production
export const storage = new DatabaseStorage();
