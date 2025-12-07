import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: text("reference").notNull(),
  engineerName: text("engineer_name").notNull(),
  installationType: text("installation_type").notNull(),
  maxOperatingPressure: decimal("max_operating_pressure", { precision: 6, scale: 1 }),
  maxIncidentalPressure: decimal("max_incidental_pressure", { precision: 6, scale: 1 }),
  gasType: text("gas_type").notNull().default("Natural Gas"),
  operationType: text("operation_type").notNull().default("Purge"),
  purgeMethod: text("purge_method"),
  safetyFactor: decimal("safety_factor", { precision: 3, scale: 1 }).notNull().default("1.5"),
  gasMeterPurgeVolume: decimal("gas_meter_purge_volume", { precision: 8, scale: 2 }),
  zoneType: text("zone_type"),
  gaugeType: text("gauge_type"),
  testMedium: text("test_medium"),
  testPressure: decimal("test_pressure", { precision: 6, scale: 1 }),
  stabilizationTime: integer("stabilization_time"), // minutes
  maxPressureDropPercent: decimal("max_pressure_drop_percent", { precision: 4, scale: 1 }), // percentage of test pressure
  roomVolume: decimal("room_volume", { precision: 8, scale: 2 }), // For Type B calculations
  actualPressureDrop: decimal("actual_pressure_drop", { precision: 6, scale: 2 }),
  testResult: text("test_result"), // "PASS" | "FAIL" | "PENDING"
  actualLeakageRate: decimal("actual_leakage_rate", { precision: 8, scale: 4 }),
  mplr: decimal("mplr", { precision: 8, scale: 4 }),
  actualFlowRate: decimal("actual_flow_rate", { precision: 8, scale: 2 }), // For purge operations
  actualGasContent: decimal("actual_gas_content", { precision: 5, scale: 2 }), // Gas content percentage
  purgeResult: text("purge_result"), // "PASS" | "FAIL" | "PENDING" for purge operations
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pipeConfigurations = pgTable("pipe_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  nominalSize: text("nominal_size").notNull(),
  length: decimal("length", { precision: 8, scale: 2 }).notNull(),
  fittingsQuantity: integer("fittings_quantity").notNull().default(0),
  internalDiameter: decimal("internal_diameter", { precision: 6, scale: 2 }).notNull(),
  volume: decimal("volume", { precision: 10, scale: 4 }).notNull(),
});

export const meterConfigurations = pgTable("meter_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  meterType: text("meter_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  internalVolume: decimal("internal_volume", { precision: 8, scale: 4 }).notNull(),
  cyclicVolume: decimal("cyclic_volume", { precision: 8, scale: 4 }).notNull(),
  totalInternalVolume: decimal("total_internal_volume", { precision: 10, scale: 4 }).notNull(),
  totalCyclicVolume: decimal("total_cyclic_volume", { precision: 10, scale: 4 }).notNull(),
});

export const calculations = pgTable("calculations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  totalPipeVolume: decimal("total_pipe_volume", { precision: 10, scale: 4 }).notNull(),
  totalFittingsVolume: decimal("total_fittings_volume", { precision: 10, scale: 4 }).notNull(),
  totalMeterVolume: decimal("total_meter_volume", { precision: 10, scale: 4 }),
  totalMeterCyclicVolume: decimal("total_meter_cyclic_volume", { precision: 10, scale: 4 }),
  totalSystemVolume: decimal("total_system_volume", { precision: 10, scale: 4 }).notNull(),
  gasMeterPurgeVolume: decimal("gas_meter_purge_volume", { precision: 10, scale: 4 }),
  requiredPurgeVolume: decimal("required_purge_volume", { precision: 10, scale: 4 }),
  minimumFlowRate: decimal("minimum_flow_rate", { precision: 8, scale: 2 }),
  maximumPurgeTime: text("maximum_purge_time"), // Now stores mm:ss format
  maximumPurgeTimeSeconds: integer("maximum_purge_time_seconds"), // Raw seconds for calculations
  testPressure: decimal("test_pressure", { precision: 6, scale: 1 }),
  testDuration: text("test_duration"), // Now stores mm:ss format
  testDurationSeconds: integer("test_duration_seconds"), // Raw seconds for calculations
  maxPressureDrop: decimal("max_pressure_drop", { precision: 6, scale: 2 }),
  stabilizationTime: integer("stabilization_time"), // minutes for strength tests
  maxPressureDropPercent: decimal("max_pressure_drop_percent", { precision: 4, scale: 1 }), // percentage for strength tests
  actualPressureDrop: decimal("actual_pressure_drop", { precision: 6, scale: 2 }),
  testResult: text("test_result"), // "PASS" | "FAIL" | "PENDING"
  actualLeakageRate: decimal("actual_leakage_rate", { precision: 8, scale: 4 }),
  mplr: decimal("mplr", { precision: 8, scale: 4 }),
  largestPipeDiameter: decimal("largest_pipe_diameter", { precision: 6, scale: 1 }),
  isCompliant: boolean("is_compliant").notNull().default(true),
  complianceNotes: jsonb("compliance_notes"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

// Helper to handle optional numeric fields (undefined, empty string, or number)
const optionalNumeric = z.union([
  z.string().transform((val) => val === "" ? undefined : Number(val)),
  z.number(),
  z.undefined()
]).optional();

// Insert schemas - manually defined without drizzle-zod
export const insertProjectSchema = z.object({
  reference: z.string(),
  engineerName: z.string(),
  installationType: z.string(),
  maxOperatingPressure: optionalNumeric,
  maxIncidentalPressure: optionalNumeric,
  gasType: z.string().optional().default("Natural Gas"),
  operationType: z.string().optional().default("Purge"),
  purgeMethod: z.string().optional().nullable(),
  safetyFactor: optionalNumeric,
  gasMeterPurgeVolume: optionalNumeric,
  zoneType: z.string().optional().nullable(),
  gaugeType: z.string().optional().nullable(),
  testMedium: z.string().optional().nullable(),
  testPressure: optionalNumeric,
  stabilizationTime: optionalNumeric,
  maxPressureDropPercent: optionalNumeric,
  roomVolume: optionalNumeric,
  actualPressureDrop: optionalNumeric,
  testResult: z.string().optional().nullable(),
  actualLeakageRate: optionalNumeric,
  mplr: optionalNumeric,
  actualFlowRate: optionalNumeric,
  actualGasContent: optionalNumeric,
  purgeResult: z.string().optional().nullable(),
});

export const insertPipeConfigurationSchema = z.object({
  projectId: z.string(),
  nominalSize: z.string(),
  length: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  fittingsQuantity: z.number().int().optional().default(0),
  internalDiameter: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  volume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
});

export const insertMeterConfigurationSchema = z.object({
  projectId: z.string(),
  meterType: z.string(),
  quantity: z.number().int().optional().default(1),
  internalVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  cyclicVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  totalInternalVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  totalCyclicVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
});

export const insertCalculationSchema = z.object({
  projectId: z.string(),
  totalPipeVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  totalFittingsVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  totalMeterVolume: z.union([z.string(), z.number()]).optional().nullable(),
  totalMeterCyclicVolume: z.union([z.string(), z.number()]).optional().nullable(),
  totalSystemVolume: z.union([z.string(), z.number()]).transform((val) => typeof val === 'string' ? val : String(val)),
  gasMeterPurgeVolume: z.union([z.string(), z.number()]).optional().nullable(),
  requiredPurgeVolume: z.union([z.string(), z.number()]).optional().nullable(),
  minimumFlowRate: z.union([z.string(), z.number()]).optional().nullable(),
  maximumPurgeTime: z.string().optional().nullable(),
  maximumPurgeTimeSeconds: z.number().int().optional().nullable(),
  testPressure: z.union([z.string(), z.number()]).optional().nullable(),
  testDuration: z.string().optional().nullable(),
  testDurationSeconds: z.number().int().optional().nullable(),
  maxPressureDrop: z.union([z.string(), z.number()]).optional().nullable(),
  stabilizationTime: z.number().int().optional().nullable(),
  maxPressureDropPercent: z.union([z.string(), z.number()]).optional().nullable(),
  actualPressureDrop: z.union([z.string(), z.number()]).optional().nullable(),
  testResult: z.string().optional().nullable(),
  actualLeakageRate: z.union([z.string(), z.number()]).optional().nullable(),
  mplr: z.union([z.string(), z.number()]).optional().nullable(),
  largestPipeDiameter: z.union([z.string(), z.number()]).optional().nullable(),
  isCompliant: z.boolean().optional().default(true),
  complianceNotes: z.any().optional().nullable(),
});

// Calculation request schema
export const calculationRequestSchema = z.object({
  project: insertProjectSchema,
  pipeConfigurations: z.array(z.object({
    nominalSize: z.string(),
    length: z.number().min(0),
  })),
  meterConfigurations: z.array(z.object({
    meterType: z.string(),
    quantity: z.number().min(1),
  })).optional(),
  purgeConfigurations: z.array(z.object({
    type: z.string(), // "hose" or "stack"
    nominalSize: z.string(),
    length: z.number().min(0),
  })).optional(),
  calculatorType: z.enum(["industrial", "commercial"]).optional().default("industrial"),
});

// Types
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertPipeConfiguration = z.infer<typeof insertPipeConfigurationSchema>;
export type PipeConfiguration = typeof pipeConfigurations.$inferSelect;

export type InsertMeterConfiguration = z.infer<typeof insertMeterConfigurationSchema>;
export type MeterConfiguration = typeof meterConfigurations.$inferSelect;

export type InsertCalculation = z.infer<typeof insertCalculationSchema>;
export type Calculation = typeof calculations.$inferSelect;

export type CalculationRequest = z.infer<typeof calculationRequestSchema>;

// Result type for API responses
// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionTier: varchar("subscription_tier").default("free"), // free, basic, premium, professional
  subscriptionStatus: varchar("subscription_status").default("active"), // active, canceled, past_due
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Company branding table for custom white-label reports
export const companyBranding = pgTable("company_branding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address"),
  companyPhone: varchar("company_phone"),
  companyEmail: varchar("company_email"),
  companyWebsite: varchar("company_website"),
  logoUrl: varchar("logo_url"), // Object storage path
  headerLogoUrl: varchar("header_logo_url"), // Optional separate header logo
  footerText: text("footer_text"),
  primaryColor: varchar("primary_color").default("#2563eb"), // Hex color
  secondaryColor: varchar("secondary_color").default("#64748b"), // Hex color
  engineerName: text("engineer_name"), // Default engineer name for tests
  gasSafeNumber: varchar("gas_safe_number"), // Gas Safe registration number
  engineerSignatureUrl: varchar("engineer_signature_url"), // Signature image path
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Company branding types
export const insertCompanyBrandingSchema = z.object({
  userId: z.string(),
  companyName: z.string(),
  companyAddress: z.string().optional().nullable(),
  companyPhone: z.string().optional().nullable(),
  companyEmail: z.string().optional().nullable(),
  companyWebsite: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  headerLogoUrl: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
  primaryColor: z.string().optional().default("#2563eb"),
  secondaryColor: z.string().optional().default("#64748b"),
  engineerName: z.string().optional().nullable(),
  gasSafeNumber: z.string().optional().nullable(),
  engineerSignatureUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});
export type InsertCompanyBranding = z.infer<typeof insertCompanyBrandingSchema>;
export type CompanyBranding = typeof companyBranding.$inferSelect;

// Subscription schemas
export const insertUserSchema = z.object({
  id: z.string().optional(),
  email: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  profileImageUrl: z.string().optional().nullable(),
  stripeCustomerId: z.string().optional().nullable(),
  stripeSubscriptionId: z.string().optional().nullable(),
  subscriptionTier: z.string().optional().default("free"),
  subscriptionStatus: z.string().optional().default("active"),
});
export type InsertUser = z.infer<typeof insertUserSchema>;

// Job section counter table
export const jobSectionCounters = pgTable("job_section_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobNumber: text("job_number").notNull().unique(),
  lastSectionNumber: integer("last_section_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type JobSectionCounter = typeof jobSectionCounters.$inferSelect;

// Feedback table for customer feedback system
export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Optional - anonymous feedback allowed
  rating: integer("rating").notNull(), // 1-5 flames
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Feedback schemas
export const insertFeedbackSchema = z.object({
  userId: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

// Crypto users table - completely separate from gas calculator users
export const cryptoUsers = pgTable("crypto_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CryptoUser = typeof cryptoUsers.$inferSelect;
export type InsertCryptoUser = typeof cryptoUsers.$inferInsert;

// Crypto subscription table for alert preferences and subscription tiers
export const cryptoSubscriptions = pgTable("crypto_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  tier: varchar("tier").notNull().default("free"), // Base tier: "free", "beginner", "intermediate", "pro", "elite"
  hasElliottAddon: boolean("has_elliott_addon").default(false), // Elliott Wave add-on ($10/mo) - independent of tier
  elliottStripeItemId: varchar("elliott_stripe_item_id"), // Stripe subscription item ID for Elliott add-on
  selectedTickers: text("selected_tickers").array().default(sql`ARRAY[]::text[]`), // Max 3 tickers
  alertGrades: text("alert_grades").array().default(sql`ARRAY['A+', 'A']::text[]`), // Which grades to alert on
  alertTimeframes: text("alert_timeframes").array().default(sql`ARRAY['15m', '1h', '4h']::text[]`), // Which timeframes to monitor
  alertTypes: text("alert_types").array().default(sql`ARRAY['bos', 'choch', 'fvg', 'liquidation']::text[]`), // Which alert types to enable
  alertsEnabled: boolean("alerts_enabled").default(false), // Master toggle for push notifications
  aiCredits: integer("ai_credits").default(0), // Remaining AI trade idea credits (Intermediate tier gets 50/month)
  aiCreditsResetAt: timestamp("ai_credits_reset_at"), // When credits were last reset (monthly)
  dailyAiUsage: integer("daily_ai_usage").default(0), // Daily AI trade calls used today
  dailyAiUsageResetAt: timestamp("daily_ai_usage_reset_at"), // When daily usage was last reset (midnight)
  autoRefreshInterval: integer("auto_refresh_interval"), // null=manual only, 3600=hourly, 900=15min
  pushSubscription: jsonb("push_subscription"), // Store push subscription data
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status").default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCryptoSubscriptionSchema = z.object({
  userId: z.string(),
  tier: z.string().optional().default("free"),
  hasElliottAddon: z.boolean().optional().default(false),
  elliottStripeItemId: z.string().optional().nullable(),
  selectedTickers: z.array(z.string()).optional().default([]),
  alertGrades: z.array(z.string()).optional().default(['A+', 'A']),
  alertTimeframes: z.array(z.string()).optional().default(['15m', '1h', '4h']),
  alertTypes: z.array(z.string()).optional().default(['bos', 'choch', 'fvg', 'liquidation']),
  alertsEnabled: z.boolean().optional().default(false),
  aiCredits: z.number().int().optional().default(0),
  aiCreditsResetAt: z.date().optional().nullable(),
  dailyAiUsage: z.number().int().optional().default(0),
  dailyAiUsageResetAt: z.date().optional().nullable(),
  autoRefreshInterval: z.number().int().optional().nullable(),
  pushSubscription: z.any().optional().nullable(),
  stripeSubscriptionId: z.string().optional().nullable(),
  subscriptionStatus: z.string().optional().default("active"),
  expiresAt: z.date().optional().nullable(),
});

export type InsertCryptoSubscription = z.infer<typeof insertCryptoSubscriptionSchema>;
export type CryptoSubscription = typeof cryptoSubscriptions.$inferSelect;

// Dedicated Crypto Preferences types (subset of CryptoSubscription for alert settings)
export const cryptoPreferencesSchema = z.object({
  selectedTickers: z.array(z.string()).max(3).default([]),
  alertGrades: z.array(z.string()).default(['A+', 'A']),
  alertTimeframes: z.array(z.string()).default(['15m', '1h', '4h']),
  alertTypes: z.array(z.string()).default(['bos', 'choch', 'fvg', 'liquidation']),
  alertsEnabled: z.boolean().default(false),
  pushSubscription: z.any().nullable().default(null),
  tier: z.string().default('free'),
});

export type CryptoPreferences = z.infer<typeof cryptoPreferencesSchema>;

// Push notification subscriptions table - stores all web push subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  endpoint: text("endpoint").notNull().unique(), // Unique endpoint URL from browser
  p256dh: text("p256dh").notNull(), // Public key for encryption
  auth: text("auth").notNull(), // Authentication secret
  userId: varchar("user_id").references(() => cryptoUsers.id, { onDelete: "cascade" }), // Optional - link to user if authenticated
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
});

export const insertPushSubscriptionSchema = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userId: z.string().optional().nullable(),
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Tracked trades table - for tracking AI trade recommendations with entry/SL/TP monitoring
export const trackedTrades = pgTable("tracked_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  symbol: varchar("symbol").notNull(), // e.g., "XRPUSDT"
  direction: varchar("direction").notNull(), // "LONG" or "SHORT"
  grade: varchar("grade").notNull(), // "A+", "A", "B", "C", "D", "E"
  entry: decimal("entry", { precision: 18, scale: 8 }).notNull(), // Entry price
  stopLoss: decimal("stop_loss", { precision: 18, scale: 8 }).notNull(), // Stop loss price
  targets: text("targets").array().notNull(), // Array of target prices as strings
  status: varchar("status").notNull().default("pending"), // "pending", "entry_hit", "sl_hit", "tp_hit", "cancelled"
  confluenceSignals: text("confluence_signals").array().default(sql`ARRAY[]::text[]`), // Trade signals
  reasoning: text("reasoning"), // AI reasoning for the trade
  entryHitAt: timestamp("entry_hit_at"), // When entry was hit
  slHitAt: timestamp("sl_hit_at"), // When stop loss was hit
  tpHitAt: timestamp("tp_hit_at"), // When target was hit
  tpHitLevel: integer("tp_hit_level"), // Which target was hit (1, 2, 3)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrackedTradeSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  direction: z.string(),
  grade: z.string(),
  entry: z.union([z.string(), z.number()]).transform((val) => String(val)),
  stopLoss: z.union([z.string(), z.number()]).transform((val) => String(val)),
  targets: z.array(z.string()),
  status: z.string().optional().default("pending"),
  confluenceSignals: z.array(z.string()).optional().default([]),
  reasoning: z.string().optional().nullable(),
  entryHitAt: z.date().optional().nullable(),
  slHitAt: z.date().optional().nullable(),
  tpHitAt: z.date().optional().nullable(),
  tpHitLevel: z.number().int().optional().nullable(),
});

export type InsertTrackedTrade = z.infer<typeof insertTrackedTradeSchema>;
export type TrackedTrade = typeof trackedTrades.$inferSelect;

// Indicator alert state table - stores last known indicator values for cross detection
export const indicatorAlertState = pgTable("indicator_alert_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  symbol: varchar("symbol").notNull(), // e.g., "XRPUSDT"
  timeframe: varchar("timeframe").notNull(), // e.g., "15m", "1h", "4h"
  lastCci: decimal("last_cci", { precision: 10, scale: 2 }), // Last CCI value
  lastAdx: decimal("last_adx", { precision: 10, scale: 2 }), // Last ADX value
  lastPlusDi: decimal("last_plus_di", { precision: 10, scale: 2 }), // Last +DI value
  lastMinusDi: decimal("last_minus_di", { precision: 10, scale: 2 }), // Last -DI value
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertIndicatorAlertStateSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  lastCci: z.union([z.string(), z.number()]).optional().nullable(),
  lastAdx: z.union([z.string(), z.number()]).optional().nullable(),
  lastPlusDi: z.union([z.string(), z.number()]).optional().nullable(),
  lastMinusDi: z.union([z.string(), z.number()]).optional().nullable(),
});

export type InsertIndicatorAlertState = z.infer<typeof insertIndicatorAlertStateSchema>;
export type IndicatorAlertState = typeof indicatorAlertState.$inferSelect;

export type CalculationResult = {
  project: Project;
  pipeConfigurations: PipeConfiguration[];
  meterConfigurations?: MeterConfiguration[];
  calculation: Calculation;
  compliance: {
    isCompliant: boolean;
    standard: string;
    notes: string[];
    nextSteps: string[];
  };
};

// Elliott Wave degree constants - ordered from largest to smallest
export const ELLIOTT_WAVE_DEGREES = [
  'grand_supercycle',
  'supercycle', 
  'cycle',
  'primary',
  'intermediate',
  'minor',
  'minute',
  'minuette',
  'subminuette'
] as const;

export type ElliottWaveDegree = typeof ELLIOTT_WAVE_DEGREES[number];

// Elliott Wave degree color mapping (standard professional colors)
export const ELLIOTT_WAVE_COLORS: Record<ElliottWaveDegree, string> = {
  grand_supercycle: '#00CED1', // Dark Cyan
  supercycle: '#32CD32',       // Lime Green
  cycle: '#FFD700',            // Gold
  primary: '#FF6B6B',          // Coral Red
  intermediate: '#4169E1',     // Royal Blue
  minor: '#FF69B4',            // Hot Pink
  minute: '#00FF7F',           // Spring Green
  minuette: '#FFA500',         // Orange
  subminuette: '#BA55D3'       // Medium Orchid
};

// Elliott Wave degree labeling conventions
export const ELLIOTT_WAVE_LABELS: Record<ElliottWaveDegree, { motive: string[], corrective: string[] }> = {
  grand_supercycle: { motive: ['[I]', '[II]', '[III]', '[IV]', '[V]'], corrective: ['[A]', '[B]', '[C]', '[D]', '[E]'] },
  supercycle: { motive: ['(I)', '(II)', '(III)', '(IV)', '(V)'], corrective: ['(A)', '(B)', '(C)', '(D)', '(E)'] },
  cycle: { motive: ['I', 'II', 'III', 'IV', 'V'], corrective: ['A', 'B', 'C', 'D', 'E'] },
  primary: { motive: ['[1]', '[2]', '[3]', '[4]', '[5]'], corrective: ['[a]', '[b]', '[c]', '[d]', '[e]'] },
  intermediate: { motive: ['(1)', '(2)', '(3)', '(4)', '(5)'], corrective: ['(a)', '(b)', '(c)', '(d)', '(e)'] },
  minor: { motive: ['1', '2', '3', '4', '5'], corrective: ['a', 'b', 'c', 'd', 'e'] },
  minute: { motive: ['[i]', '[ii]', '[iii]', '[iv]', '[v]'], corrective: ['[a]', '[b]', '[c]', '[d]', '[e]'] },
  minuette: { motive: ['(i)', '(ii)', '(iii)', '(iv)', '(v)'], corrective: ['(a)', '(b)', '(c)', '(d)', '(e)'] },
  subminuette: { motive: ['i', 'ii', 'iii', 'iv', 'v'], corrective: ['a', 'b', 'c', 'd', 'e'] }
};

// Elliott Wave pattern types
export const ELLIOTT_WAVE_PATTERNS = [
  'impulse',           // Standard 5-wave motive
  'diagonal_leading',  // Leading diagonal (Wave 1 or A)
  'diagonal_ending',   // Ending diagonal (Wave 5 or C)
  'zigzag',           // 5-3-5 correction
  'flat',             // 3-3-5 correction
  'triangle',         // 3-3-3-3-3 converging correction
  'combination',      // W-X-Y or W-X-Y-X-Z complex correction
  'wxy',              // Double three
  'wxyxz'             // Triple three
] as const;

export type ElliottWavePattern = typeof ELLIOTT_WAVE_PATTERNS[number];

// Fibonacci measurement modes
export const FIB_MODES = ['measured', 'projected', 'off'] as const;
export type FibMode = typeof FIB_MODES[number];

// Wave point structure for JSONB storage
export const wavePointSchema = z.object({
  index: z.number(), // Wave number (0=origin, 1=W1, 2=W2, etc.)
  label: z.string(), // Display label (e.g., "1", "[ii]", "A")
  price: z.number(), // Price level
  time: z.number(),  // Unix timestamp
  isCorrection: z.boolean().default(false), // Is this a corrective wave?
});

export type WavePoint = z.infer<typeof wavePointSchema>;

// Elliott Wave labels table - stores wave drawings per user/symbol/timeframe
export const elliottWaveLabels = pgTable("elliott_wave_labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  symbol: varchar("symbol").notNull(), // e.g., "BTCUSDT"
  timeframe: varchar("timeframe").notNull(), // e.g., "1h", "4h", "1D", "1W", "1M"
  degree: varchar("degree").notNull(), // Elliott wave degree (grand_supercycle to subminuette)
  patternType: varchar("pattern_type").notNull(), // impulse, diagonal, zigzag, flat, triangle, etc.
  points: jsonb("points").notNull().$type<WavePoint[]>(), // Array of wave points
  fibMode: varchar("fib_mode").notNull().default("measured"), // measured, projected, off
  validationStatus: varchar("validation_status").notNull().default("valid"), // valid, warning, invalid
  validationErrors: text("validation_errors").array().default(sql`ARRAY[]::text[]`), // List of rule violations
  isAutoGenerated: boolean("is_auto_generated").default(false), // Auto-analysis vs manual
  isConfirmed: boolean("is_confirmed").default(false), // User confirmed auto-count
  metadata: jsonb("metadata").$type<{
    fibRatios?: { wave: number; ratio: number; target: string }[];
    alternativeCount?: string;
    confidence?: number; // 0-100 for auto-generated
    notes?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertElliottWaveLabelSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  degree: z.string(),
  patternType: z.string(),
  points: z.array(wavePointSchema),
  fibMode: z.string().optional().default("measured"),
  validationStatus: z.string().optional().default("valid"),
  validationErrors: z.array(z.string()).optional().default([]),
  isAutoGenerated: z.boolean().optional().default(false),
  isConfirmed: z.boolean().optional().default(false),
  metadata: z.any().optional().nullable(),
});

export type InsertElliottWaveLabel = z.infer<typeof insertElliottWaveLabelSchema>;
export type ElliottWaveLabel = typeof elliottWaveLabels.$inferSelect;

// Cached historical candles table - for extended history beyond standard API limits
export const cachedCandles = pgTable("cached_candles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol").notNull(), // e.g., "BTCUSDT"
  timeframe: varchar("timeframe").notNull(), // e.g., "1D", "1W", "1M"
  startTime: timestamp("start_time").notNull(), // Start of batch
  endTime: timestamp("end_time").notNull(), // End of batch
  candles: jsonb("candles").notNull().$type<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[]>(),
  candleCount: integer("candle_count").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCachedCandlesSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  candles: z.array(z.object({
    time: z.number(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  })),
  candleCount: z.number().int(),
});

export type InsertCachedCandles = z.infer<typeof insertCachedCandlesSchema>;
export type CachedCandles = typeof cachedCandles.$inferSelect;
