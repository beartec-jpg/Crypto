import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, jsonb, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { z } from "zod";
// Feedback Board - public rolling message board for suggestions/feedback
export const feedbackBoard = pgTable("feedback_board", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userEmail: varchar("user_email"), // Email of poster (null for anonymous)
  userName: varchar("user_name"), // Display name
  userImageUrl: varchar("user_image_url"), // Clerk profile picture URL
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const feedbackBoardReplies = pgTable("feedback_board_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedbackId: varchar("feedback_id").notNull().references(() => feedbackBoard.id, { onDelete: "cascade" }),
  responderEmail: varchar("responder_email"), // Email of responder
  responderName: varchar("responder_name"), // Display name
  content: text("content").notNull(),
  isAdminReply: boolean("is_admin_reply").default(false), // True if from beartec@beartec.uk
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFeedbackBoardSchema = z.object({
  userEmail: z.string().optional().nullable(),
  userName: z.string().optional().nullable(),
  userImageUrl: z.string().optional().nullable(),
  content: z.string().min(1),
});

export const insertFeedbackBoardReplySchema = z.object({
  feedbackId: z.string(),
  responderEmail: z.string().optional().nullable(),
  responderName: z.string().optional().nullable(),
  content: z.string().min(1),
  isAdminReply: z.boolean().optional().default(false),
});

export type InsertFeedbackBoard = z.infer<typeof insertFeedbackBoardSchema>;
export type FeedbackBoard = typeof feedbackBoard.$inferSelect;
export type InsertFeedbackBoardReply = z.infer<typeof insertFeedbackBoardReplySchema>;
export type FeedbackBoardReply = typeof feedbackBoardReplies.$inferSelect;

// Crypto users table - completely separate from gas calculator users
export const cryptoUsers = pgTable("crypto_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phoneNumber: varchar("phone_number"), // For SMS alerts via Twilio
  smsAlertsEnabled: boolean("sms_alerts_enabled").default(false), // Master toggle for SMS
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CryptoUser = typeof cryptoUsers.$inferSelect;
export type InsertCryptoUser = typeof cryptoUsers.$inferInsert;

const aiTimeframeSchema = z.enum(['5m', '15m', '1h', '4h', '1d', '1w']);

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
  // Alert source toggles - control which alert types are active
  hlineAlertsEnabled: boolean("hline_alerts_enabled").default(true), // Horizontal line price alerts
  elliottAlertsEnabled: boolean("elliott_alerts_enabled").default(true), // Elliott Wave projection alerts
  aiTradeAlertsEnabled: boolean("ai_trade_alerts_enabled").default(true), // AI tracked trade alerts
  indicatorAlertsEnabled: boolean("indicator_alerts_enabled").default(true), // Smart Money/Indicator alerts
  aiCredits: integer("ai_credits").default(0), // Remaining AI trade credits (monthly: Intermediate 200, Pro 400, Elite 500)
  aiCreditsResetAt: timestamp("ai_credits_reset_at"), // When credits were last reset (monthly)
  elliottAiCredits: integer("elliott_ai_credits").default(0), // Remaining Elliott Wave AI credits (monthly: Elite 150, Add-on 50)
  elliottAiCreditsResetAt: timestamp("elliott_ai_credits_reset_at"), // When Elliott credits were last reset (monthly)
  bonusAiCredits: integer("bonus_ai_credits").default(0), // Admin-granted bonus AI credits (added on top of tier)
  bonusElliottCredits: integer("bonus_elliott_credits").default(0), // Admin-granted bonus Elliott credits
  customToolAccess: jsonb("custom_tool_access").$type<string[]>(), // Admin-granted custom tool/indicator IDs
  // AI trading-desk scan preferences (per-user)
  tickerSlots: integer("ticker_slots").notNull().default(1), // How many watchlist tickers may run through LIVE AI scanning (ticker-scaled tier)
  strategyGroups: text("strategy_groups").array().notNull().default(sql`ARRAY['indicator','smc']::text[]`), // Which strategy groups/modes to receive
  scanTickers: text("scan_tickers").array().notNull().default(sql`ARRAY[]::text[]`), // Subset of watchlist activated for live AI
  minRiskReward: decimal("min_risk_reward", { precision: 4, scale: 2 }).notNull().default("1.5"), // User-tunable min R/R threshold
  minConfluence: integer("min_confluence").notNull().default(3), // User-tunable min confluence threshold
  aiModelPref: varchar("ai_model_pref").notNull().default("fast"), // Preferred narrator model: 'fast' | 'deep'
  aiTraderMode: varchar("ai_trader_mode").notNull().default("smc"), // Selected AI trader mode for /cryptoai page: 'indicator' | 'smc' | ...
  aiHigherTimeframe: varchar("ai_higher_timeframe").notNull().default("1d"), // Preferred higher timeframe for /cryptoai analysis cards
  aiLowerTimeframe: varchar("ai_lower_timeframe").notNull().default("15m"), // Preferred lower timeframe for /cryptoai analysis cards
  elliottScanEnabled: boolean("elliott_scan_enabled").notNull().default(false), // Opt-in to Elliott mode in scanner
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
  hlineAlertsEnabled: z.boolean().optional().default(true),
  elliottAlertsEnabled: z.boolean().optional().default(true),
  aiTradeAlertsEnabled: z.boolean().optional().default(true),
  indicatorAlertsEnabled: z.boolean().optional().default(true),
  aiCredits: z.number().int().optional().default(0),
  aiCreditsResetAt: z.date().optional().nullable(),
  elliottAiCredits: z.number().int().optional().default(0),
  elliottAiCreditsResetAt: z.date().optional().nullable(),
  bonusAiCredits: z.number().int().optional().default(0),
  bonusElliottCredits: z.number().int().optional().default(0),
  customToolAccess: z.array(z.string()).optional().nullable(),
  tickerSlots: z.number().int().optional().default(1),
  strategyGroups: z.array(z.string()).optional().default(['indicator', 'smc']),
  scanTickers: z.array(z.string()).optional().default([]),
  minRiskReward: z.union([z.string(), z.number()]).optional().default("1.5"),
  minConfluence: z.number().int().optional().default(3),
  aiModelPref: z.enum(['fast', 'deep']).optional().default('fast'),
  aiTraderMode: z.string().optional().default('smc'),
  aiHigherTimeframe: aiTimeframeSchema.optional().default('1d'),
  aiLowerTimeframe: aiTimeframeSchema.optional().default('15m'),
  elliottScanEnabled: z.boolean().optional().default(false),
  pushSubscription: z.any().optional().nullable(),
  stripeSubscriptionId: z.string().optional().nullable(),
  subscriptionStatus: z.string().optional().default("active"),
  expiresAt: z.date().optional().nullable(),
});

export type InsertCryptoSubscription = z.infer<typeof insertCryptoSubscriptionSchema>;
export type CryptoSubscription = typeof cryptoSubscriptions.$inferSelect;

// Shared, cross-user AI scan cache (NO user_id -> one Grok call serves every user on that ticker)
export const cryptoScanCache = pgTable("crypto_scan_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol").notNull(), // e.g. 'XRPUSDT'
  interval: varchar("interval").notNull(), // e.g. '15m','1h','4h'
  mode: varchar("mode").notNull(), // 'indicator' | 'smc' | 'elliott' | ...
  scores: jsonb("scores").notNull().default(sql`'{}'::jsonb`), // deterministic 9-system output + reasoning[]
  aiNarration: jsonb("ai_narration"), // Grok narration/ranking (nullable until narrated)
  tierState: varchar("tier_state").notNull().default("neutral"), // 'actionable' | 'watchlist' | 'neutral'
  modelUsed: varchar("model_used"), // 'fast' | 'deep'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCryptoScanCacheSchema = z.object({
  symbol: z.string(),
  interval: z.string(),
  mode: z.string(),
  scores: z.any().optional().default({}),
  aiNarration: z.any().optional().nullable(),
  tierState: z.enum(['actionable', 'watchlist', 'neutral']).optional().default('neutral'),
  modelUsed: z.enum(['fast', 'deep']).optional().nullable(),
});

export type InsertCryptoScanCache = z.infer<typeof insertCryptoScanCacheSchema>;
export type CryptoScanCache = typeof cryptoScanCache.$inferSelect;

// User Watchlists - separate table for managing user's ticker watchlist
export const userWatchlists = pgTable("user_watchlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  tickers: jsonb("tickers").notNull().default(sql`'[]'::jsonb`), // Array of ticker symbols
  structurePivotLength: integer("structure_pivot_length").notNull().default(5), // Pivot length for structure detection
  emaLengths: integer("ema_lengths").array().notNull().default(sql`ARRAY[21, 50, 200]`), // EMA periods for bias calculation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserWatchlistSchema = z.object({
  userId: z.string(),
  tickers: z.array(z.string()).default([]),
  structurePivotLength: z.number().int().min(1).default(5),
  emaLengths: z.array(z.number().int().min(1)).default([21, 50, 200]),
});

export type InsertUserWatchlist = z.infer<typeof insertUserWatchlistSchema>;
export type UserWatchlist = typeof userWatchlists.$inferSelect;

// Watchlist Bias Settings - DTO for GET/PUT /api/crypto/watchlist/settings
export const watchlistBiasSettingsSchema = z.object({
  structurePivotLength: z.number().int().min(1),
  emaLengths: z.array(z.number().int().min(1)).length(3),
});

export type WatchlistBiasSettings = z.infer<typeof watchlistBiasSettingsSchema>;

// User Oscillator Preferences - separate table for managing user's favorite oscillators
export const userOscillatorPreferences = pgTable("user_oscillator_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  favoriteOscillators: jsonb("favorite_oscillators").notNull().default(sql`'[]'::jsonb`), // Array of oscillator IDs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserOscillatorPreferencesSchema = z.object({
  userId: z.string(),
  favoriteOscillators: z.array(z.enum(['rsi', 'macd', 'stochRSI', 'obv', 'mfi', 'williamsR', 'cci', 'adx'])).default([]),
});

export type InsertUserOscillatorPreferences = z.infer<typeof insertUserOscillatorPreferencesSchema>;
export type UserOscillatorPreferences = typeof userOscillatorPreferences.$inferSelect;

// Oscillator Preferences - DTO for GET/PUT /api/crypto/oscillator-preferences
export const oscillatorPreferencesSchema = z.object({
  favoriteOscillators: z.array(z.enum(['rsi', 'macd', 'stochRSI', 'obv', 'mfi', 'williamsR', 'cci', 'adx'])),
});

export type OscillatorPreferences = z.infer<typeof oscillatorPreferencesSchema>;

// Cached AI analyses table - stores last analysis per user/symbol/interval
export const cryptoAiAnalyses = pgTable("crypto_ai_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  symbol: varchar("symbol").notNull(), // e.g., "XRPUSDT"
  interval: varchar("interval").notNull(), // e.g., "15m", "1h", "4h"
  alerts: jsonb("alerts").default(sql`'[]'::jsonb`), // Array of trade alerts
  marketInsights: jsonb("market_insights"), // Market summary, bias, key levels
  orderflowData: jsonb("orderflow_data"), // OI, Funding, L/S ratio snapshot
  elliottAnalysis: jsonb("elliott_analysis"), // Elliott Wave AI analysis result
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCryptoAiAnalysisSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  interval: z.string(),
  alerts: z.any().optional().default([]),
  marketInsights: z.any().optional().nullable(),
  orderflowData: z.any().optional().nullable(),
  elliottAnalysis: z.any().optional().nullable(),
});

export type InsertCryptoAiAnalysis = z.infer<typeof insertCryptoAiAnalysisSchema>;
export type CryptoAiAnalysis = typeof cryptoAiAnalyses.$inferSelect;

// Dedicated Crypto Preferences types (subset of CryptoSubscription for alert settings)
export const cryptoPreferencesSchema = z.object({
  selectedTickers: z.array(z.string()).max(3).default([]),
  alertGrades: z.array(z.string()).default(['A+', 'A']),
  alertTimeframes: z.array(z.string()).default(['15m', '1h', '4h']),
  alertTypes: z.array(z.string()).default(['bos', 'choch', 'fvg', 'liquidation']),
  alertsEnabled: z.boolean().default(false),
  hlineAlertsEnabled: z.boolean().default(true),
  elliottAlertsEnabled: z.boolean().default(true),
  aiTradeAlertsEnabled: z.boolean().default(true),
  indicatorAlertsEnabled: z.boolean().default(true),
  pushSubscription: z.any().nullable().default(null),
  aiTraderMode: z.string().default('smc'),
  aiHigherTimeframe: aiTimeframeSchema.default('1d'),
  aiLowerTimeframe: aiTimeframeSchema.default('15m'),
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
  lastRsi: decimal("last_rsi", { precision: 10, scale: 2 }), // Last RSI value
  lastMacd: decimal("last_macd", { precision: 18, scale: 8 }), // Last MACD line value
  lastMacdSignal: decimal("last_macd_signal", { precision: 18, scale: 8 }), // Last MACD signal value
  lastStochK: decimal("last_stoch_k", { precision: 10, scale: 2 }), // Last Stochastic K value
  lastStochD: decimal("last_stoch_d", { precision: 10, scale: 2 }), // Last Stochastic D value
  lastEma9: decimal("last_ema9", { precision: 18, scale: 8 }), // Last EMA 9 value
  lastEma21: decimal("last_ema21", { precision: 18, scale: 8 }), // Last EMA 21 value
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
  lastRsi: z.union([z.string(), z.number()]).optional().nullable(),
  lastMacd: z.union([z.string(), z.number()]).optional().nullable(),
  lastMacdSignal: z.union([z.string(), z.number()]).optional().nullable(),
  lastStochK: z.union([z.string(), z.number()]).optional().nullable(),
  lastStochD: z.union([z.string(), z.number()]).optional().nullable(),
  lastEma9: z.union([z.string(), z.number()]).optional().nullable(),
  lastEma21: z.union([z.string(), z.number()]).optional().nullable(),
});

export type InsertIndicatorAlertState = z.infer<typeof insertIndicatorAlertStateSchema>;
export type IndicatorAlertState = typeof indicatorAlertState.$inferSelect;

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

// Saved projection lines for Elliott Wave predictions
export const savedProjectionLines = pgTable("saved_projection_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: varchar("symbol").notNull(),
  timeframe: varchar("timeframe").notNull(),
  structureId: varchar("structure_id").notNull(), // Links to the wave structure
  levelLabel: varchar("level_label").notNull(), // e.g., "W3 100%", "C 127%"
  price: doublePrecision("price").notNull(),
  color: varchar("color").notNull().default("#00CED1"),
  waveType: varchar("wave_type").notNull(), // 'impulse' or 'correction'
  alertEnabled: boolean("alert_enabled").notNull().default(false),
  alertTriggered: boolean("alert_triggered").notNull().default(false),
  lastCheckedPrice: doublePrecision("last_checked_price"), // For detecting price crossings
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedProjectionLineSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  structureId: z.string(),
  levelLabel: z.string(),
  price: z.number(),
  color: z.string().optional().default("#00CED1"),
  waveType: z.string(),
  alertEnabled: z.boolean().optional().default(false),
});

export type InsertSavedProjectionLine = z.infer<typeof insertSavedProjectionLineSchema>;
export type SavedProjectionLine = typeof savedProjectionLines.$inferSelect;

// Chart drawings for manual drawing tools (trend lines, fibs, rectangles, etc.)
export const chartDrawings = pgTable("chart_drawings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  symbol: varchar("symbol").notNull(),
  timeframe: varchar("timeframe").notNull(),
  drawingType: varchar("drawing_type").notNull(), // 'trendline', 'horizontal', 'rectangle', 'fib_retracement', 'trend_fib', 'channel'
  coordinates: jsonb("coordinates").notNull().$type<{
    points: { time: number; price: number }[];
    levels?: number[]; // For fib tools
  }>(),
  style: jsonb("style").$type<{
    color?: string;
    lineWidth?: number;
    lineStyle?: number;
    fillColor?: string;
    showLabels?: boolean;
    label?: string;
    labelPosition?: 'left' | 'right';
    hiddenLevels?: number[];
    alertActive?: boolean;  // For horizontal line price alerts (legacy)
    alertTriggered?: boolean;  // Track if alert has been triggered (legacy)
    lastCheckedPrice?: number;  // Track last price to detect crossings (legacy)
    
    // UNIVERSAL ALERT FIELDS (all drawing types)
    alertsEnabled?: boolean;  // Master toggle for alerts
    
    // LEVEL-BASED ALERTS (fibs, channels, trend fibs, rectangles)
    levelAlerts?: {
      [level: string]: {  // e.g., "0.618", "0.5", "top", "bottom"
        enabled: boolean;
        crossUpEnabled: boolean;  // Alert on price crossing up
        crossDownEnabled: boolean;  // Alert on price crossing down
        lastCheckedPrice?: number;  // Track last price for crossing detection
        triggered?: boolean;  // Has alert fired?
        triggerTime?: number;  // When it fired (timestamp)
      };
    };
    
    // TRENDLINE ALERTS (single line)
    trendlineAlert?: {
      enabled: boolean;
      crossUpEnabled: boolean;
      crossDownEnabled: boolean;
      lastCheckedPrice?: number;
      triggered?: boolean;
      triggerTime?: number;
    };
  }>(),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertChartDrawingSchema = z.object({
  userId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  drawingType: z.enum(['trendline', 'horizontal', 'rectangle', 'fib_retracement', 'trend_fib', 'channel']),
  coordinates: z.object({
    points: z.array(z.object({
      time: z.number(),
      price: z.number(),
    })),
    levels: z.array(z.number()).optional(),
  }),
  style: z.object({
    color: z.string().optional(),
    lineWidth: z.number().optional(),
    lineStyle: z.number().optional(),
    fillColor: z.string().optional(),
    showLabels: z.boolean().optional(),
    label: z.string().optional(),
    labelPosition: z.enum(['left', 'right']).optional(),
    hiddenLevels: z.array(z.number()).optional(),
    customLabels: z.record(z.string(), z.string()).optional(),
    autoColor: z.boolean().optional(),
    alertActive: z.boolean().optional(),
    alertTriggered: z.boolean().optional(),
    lastCheckedPrice: z.number().optional(),
    
    // Universal alert fields
    alertsEnabled: z.boolean().optional(),
    
    // Level-based alerts
    levelAlerts: z.record(z.string(), z.object({
      enabled: z.boolean(),
      crossUpEnabled: z.boolean(),
      crossDownEnabled: z.boolean(),
      lastCheckedPrice: z.number().optional(),
      triggered: z.boolean().optional(),
      triggerTime: z.number().optional(),
    })).optional(),
    
    // Trendline alerts
    trendlineAlert: z.object({
      enabled: z.boolean(),
      crossUpEnabled: z.boolean(),
      crossDownEnabled: z.boolean(),
      lastCheckedPrice: z.number().optional(),
      triggered: z.boolean().optional(),
      triggerTime: z.number().optional(),
    }).optional(),
  }).optional(),
  isLocked: z.boolean().optional().default(false),
});

export type InsertChartDrawing = z.infer<typeof insertChartDrawingSchema>;
export type ChartDrawing = typeof chartDrawings.$inferSelect;

// ========== ANALYTICS TABLES ==========
// Track user events (clicks, feature usage, page views)
export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Optional - can track anonymous users
  userEmail: varchar("user_email"), // For quick reference
  eventType: varchar("event_type").notNull(), // 'page_view', 'click', 'feature_usage', 'api_call'
  eventName: varchar("event_name").notNull(), // 'symbol_change', 'indicator_toggle', etc.
  eventData: jsonb("event_data"), // Additional event-specific data
  page: varchar("page"), // Current page/route
  symbol: varchar("symbol"), // Current crypto symbol if applicable
  timeframe: varchar("timeframe"), // Current timeframe if applicable
  userTier: varchar("user_tier"), // Subscription tier at time of event
  sessionId: varchar("session_id"), // Group events by session
  userAgent: varchar("user_agent"), // Browser/device info
  createdAt: timestamp("created_at").defaultNow(),
});

// Track API usage and costs
export const apiUsageLog = pgTable("api_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  userEmail: varchar("user_email"),
  apiType: varchar("api_type").notNull(), // 'ai_analysis', 'yahoo_finance', 'binance', 'coinglass', etc.
  endpoint: varchar("endpoint"), // Specific endpoint called
  symbol: varchar("symbol"),
  interval: varchar("interval"),
  tokensUsed: integer("tokens_used"), // For AI calls
  estimatedCost: doublePrecision("estimated_cost"), // Estimated cost in USD
  responseTime: integer("response_time"), // Response time in ms
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily aggregated stats for dashboard
export const analyticsDailyStats = pgTable("analytics_daily_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  totalPageViews: integer("total_page_views").default(0),
  uniqueUsers: integer("unique_users").default(0),
  totalClicks: integer("total_clicks").default(0),
  totalApiCalls: integer("total_api_calls").default(0),
  totalAiCalls: integer("total_ai_calls").default(0),
  totalAiTokens: integer("total_ai_tokens").default(0),
  estimatedAiCost: doublePrecision("estimated_ai_cost").default(0),
  topSymbols: jsonb("top_symbols"), // Array of {symbol, count}
  topFeatures: jsonb("top_features"), // Array of {feature, count}
  topPages: jsonb("top_pages"), // Array of {page, count}
  tierBreakdown: jsonb("tier_breakdown"), // {free: X, beginner: Y, ...}
  createdAt: timestamp("created_at").defaultNow(),
});

// ========== MULTI-EXCHANGE CVD CACHE ==========
// Cache for multi-exchange CVD/footprint data to avoid redundant API calls
export const multiExchangeCvdCache = pgTable("multi_exchange_cvd_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol").notNull(), // e.g., 'BTCUSDT'
  interval: varchar("interval").notNull(), // e.g., '1h', '15m'
  timestamp: integer("timestamp").notNull(), // Unix timestamp (seconds)
  delta: doublePrecision("delta").notNull(), // CVD delta value
  cvd: doublePrecision("cvd").notNull(), // Cumulative CVD
  volume: doublePrecision("volume"), // Total volume
  buyVolume: doublePrecision("buy_volume"), // Buy volume estimate
  sellVolume: doublePrecision("sell_volume"), // Sell volume estimate
  exchangeCount: integer("exchange_count").notNull(), // Number of exchanges that responded
  exchangesResponded: text("exchanges_responded").array(), // Array of exchange IDs that contributed
  bullishExchanges: integer("bullish_exchanges"), // How many exchanges showed bullish delta
  bearishExchanges: integer("bearish_exchanges"), // How many exchanges showed bearish delta
  isComplete: boolean("is_complete").notNull().default(false), // True if all 6 exchanges responded
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMultiExchangeCvdCacheSchema = z.object({
  symbol: z.string(),
  interval: z.string(),
  timestamp: z.number().int(),
  delta: z.number(),
  cvd: z.number(),
  volume: z.number().optional().nullable(),
  buyVolume: z.number().optional().nullable(),
  sellVolume: z.number().optional().nullable(),
  exchangeCount: z.number().int(),
  exchangesResponded: z.array(z.string()).optional().nullable(),
  bullishExchanges: z.number().int().optional().nullable(),
  bearishExchanges: z.number().int().optional().nullable(),
  isComplete: z.boolean().optional().default(false),
});

export type InsertMultiExchangeCvdCache = z.infer<typeof insertMultiExchangeCvdCacheSchema>;
export type MultiExchangeCvdCache = typeof multiExchangeCvdCache.$inferSelect;

// Insert schemas for analytics
export const insertAnalyticsEventSchema = z.object({
  userId: z.string().optional().nullable(),
  userEmail: z.string().optional().nullable(),
  eventType: z.string(),
  eventName: z.string(),
  eventData: z.any().optional().nullable(),
  page: z.string().optional().nullable(),
  symbol: z.string().optional().nullable(),
  timeframe: z.string().optional().nullable(),
  userTier: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
});

export const insertApiUsageLogSchema = z.object({
  userId: z.string().optional().nullable(),
  userEmail: z.string().optional().nullable(),
  apiType: z.string(),
  endpoint: z.string().optional().nullable(),
  symbol: z.string().optional().nullable(),
  interval: z.string().optional().nullable(),
  tokensUsed: z.number().int().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  responseTime: z.number().int().optional().nullable(),
  success: z.boolean().optional().default(true),
  errorMessage: z.string().optional().nullable(),
});

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;
export type ApiUsageLog = typeof apiUsageLog.$inferSelect;
export type AnalyticsDailyStats = typeof analyticsDailyStats.$inferSelect;

// ========== USER SETTINGS TABLES ==========

// User Settings - general application settings per user
export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }).unique(),
  // Chart preferences
  defaultTimeframe: varchar("default_timeframe").notNull().default("1h"),
  chartType: varchar("chart_type").notNull().default("candlestick"), // 'candlestick' | 'line' | 'area'
  // UI preferences
  sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
  theme: varchar("theme").notNull().default("dark"),
  // Last state
  lastSymbol: varchar("last_symbol").notNull().default("BTCUSDT"),
  lastTimeframe: varchar("last_timeframe").notNull().default("1h"),
  // Drawing defaults/preferences
  drawingDefaults: jsonb("drawing_defaults"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSettingsSchema = z.object({
  userId: z.string(),
  defaultTimeframe: z.string().optional().default("1h"),
  chartType: z.enum(["candlestick", "line", "area"]).optional().default("candlestick"),
  sidebarCollapsed: z.boolean().optional().default(false),
  theme: z.string().optional().default("dark"),
  lastSymbol: z.string().optional().default("BTCUSDT"),
  lastTimeframe: z.string().optional().default("1h"),
  drawingDefaults: z.any().optional().nullable(),
});

export const userSettingsResponseSchema = z.object({
  defaultTimeframe: z.string(),
  chartType: z.enum(["candlestick", "line", "area"]),
  sidebarCollapsed: z.boolean(),
  theme: z.string(),
  lastSymbol: z.string(),
  lastTimeframe: z.string(),
  drawingDefaults: z.any().optional().nullable(),
});

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;

// User Indicator Settings - SMC indicator configurations per user
export const userIndicatorSettings = pgTable("user_indicator_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }).unique(),
  // All SMC indicator settings stored as JSONB for flexibility
  fvgSettings: jsonb("fvg_settings"),       // FVGSettings
  orderBlockSettings: jsonb("order_block_settings"), // OrderBlockSettings
  liquiditySettings: jsonb("liquidity_settings"),    // LiquiditySettings
  pdZoneSettings: jsonb("pd_zone_settings"),          // PDZoneSettings
  bosSettings: jsonb("bos_settings"),                 // BOSSettings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserIndicatorSettingsSchema = z.object({
  userId: z.string(),
  fvgSettings: z.any().optional().nullable(),
  orderBlockSettings: z.any().optional().nullable(),
  liquiditySettings: z.any().optional().nullable(),
  pdZoneSettings: z.any().optional().nullable(),
  bosSettings: z.any().optional().nullable(),
});

export const userIndicatorSettingsResponseSchema = z.object({
  fvgSettings: z.any().nullable(),
  orderBlockSettings: z.any().nullable(),
  liquiditySettings: z.any().nullable(),
  pdZoneSettings: z.any().nullable(),
  bosSettings: z.any().nullable(),
});

export type InsertUserIndicatorSettings = z.infer<typeof insertUserIndicatorSettingsSchema>;
export type UserIndicatorSettings = typeof userIndicatorSettings.$inferSelect;
export type UserIndicatorSettingsResponse = z.infer<typeof userIndicatorSettingsResponseSchema>;

// User Positions - tracked positions and portfolio data per user
export const userPositions = pgTable("user_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }).unique(),
  positions: jsonb("positions").notNull().default(sql`'[]'::jsonb`), // Array of position objects
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userPositionEntrySchema = z.object({
  id: z.string(),
  symbol: z.string(),
  direction: z.enum(["long", "short"]),
  entryPrice: z.number(),
  quantity: z.number(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  openedAt: z.number(), // Unix timestamp
});

export const insertUserPositionsSchema = z.object({
  userId: z.string(),
  positions: z.array(userPositionEntrySchema).default([]),
});

export type InsertUserPositions = z.infer<typeof insertUserPositionsSchema>;
export type UserPositions = typeof userPositions.$inferSelect;
export type UserPositionEntry = z.infer<typeof userPositionEntrySchema>;

// Trading System Alerts - Monitors activated trading systems and alerts on entry conditions
export const tradingSystemAlerts = pgTable("trading_system_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => cryptoUsers.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(), // e.g., "trend-following-pro"
  systemName: varchar("system_name").notNull(), // Display name
  symbol: varchar("symbol").notNull(), // e.g., "BTCUSDT"
  timeframe: varchar("timeframe").notNull(), // e.g., "15m", "1h"
  activeConditions: text("active_conditions").array().notNull().default(sql`ARRAY[]::text[]`), // Alert conditions to monitor
  lastIndicatorState: jsonb("last_indicator_state").$type<{
    rsi?: number;
    macd?: number;
    macdSignal?: number;
    stochK?: number;
    stochD?: number;
    cci?: number;
    adx?: number;
    mfi?: number;
    superTrendDirection?: 'bullish' | 'bearish';
    sqzMomentum?: number;
    ema9?: number;
    ema21?: number;
    ema50?: number;
    sma200?: number;
  }>(),
  lastChecked: timestamp("last_checked").defaultNow(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTradingSystemAlertSchema = z.object({
  userId: z.string(),
  systemId: z.string(),
  systemName: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  activeConditions: z.array(z.string()).default([]),
  lastIndicatorState: z.any().optional().nullable(),
  active: z.boolean().optional().default(true),
});

export type InsertTradingSystemAlert = z.infer<typeof insertTradingSystemAlertSchema>;
export type TradingSystemAlert = typeof tradingSystemAlerts.$inferSelect;

// ─── Liquidation Heatmap Tables ───────────────────────────────────────────────

// Which symbols the cron should collect data for
export const liqTrackedSymbols = pgTable("liq_tracked_symbols", {
  symbol: text("symbol").primaryKey(),
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(0),
  addedAt: timestamp("added_at").defaultNow(),
});

// Periodic market-state snapshots (1 row per symbol per minute)
export const liqMarketSnapshots = pgTable("liq_market_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  snapshotTime: timestamp("snapshot_time").notNull(),
  price: doublePrecision("price"),
  openInterestUsd: doublePrecision("open_interest_usd"),
  fundingRate: doublePrecision("funding_rate"),
  longShortRatio: doublePrecision("long_short_ratio"),
  depthBids: jsonb("depth_bids"),
  depthAsks: jsonb("depth_asks"),
  source: text("source").default("bybit"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual liquidation events
export const liqForceOrders = pgTable("liq_force_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: doublePrecision("price").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  exchange: text("exchange").notNull(),
  eventTime: timestamp("event_time").notNull(),
  valueUsd: doublePrecision("value_usd"),
  capturedAt: timestamp("captured_at").defaultNow(),
});

// Pre-computed heatmap profiles (1 row per symbol/range/interval combo)
export const liqComputedProfiles = pgTable("liq_computed_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  range: text("range").notNull(),
  chartInterval: text("chart_interval").notNull(),
  levelsJson: jsonb("levels_json"),
  metaJson: jsonb("meta_json"),
  computedAt: timestamp("computed_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type LiqTrackedSymbol = typeof liqTrackedSymbols.$inferSelect;
export type LiqMarketSnapshot = typeof liqMarketSnapshots.$inferSelect;
export type LiqForceOrder = typeof liqForceOrders.$inferSelect;
export type LiqComputedProfile = typeof liqComputedProfiles.$inferSelect;

// ─── Atomic Swap Tables ──────────────────────────────────────────────────────

/**
 * Sell / buy offers.  Originally QBTC↔USDC only; extended in migration 003
 * to support any of the 20 supported trading pairs.
 *
 * Backward-compatible: the legacy QBTC/USDC-specific columns remain.  New
 * multi-chain offers also populate the generic base_* / quote_* columns.
 */
export const swapOffers = pgTable("swap_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Anti-enumeration external ID (migration 002) */
  publicId: varchar("public_id").default(sql`gen_random_uuid()`),

  // ── Pair dimension (migration 003) ─────────────────────────────────────────
  /** Chain being sold / offered (base asset).  Defaults to 'QBTC' for legacy rows. */
  baseChain: varchar("base_chain", { length: 16 }).notNull().default("QBTC"),
  /** Chain being requested (quote asset).  Defaults to 'USDC' for legacy rows. */
  quoteChain: varchar("quote_chain", { length: 16 }).notNull().default("USDC"),
  /** Generic base amount (mirrors qbtcAmount for QBTC pairs) */
  baseAmount: text("base_amount"),
  /** Generic quote amount (mirrors usdcAmountRequested for USDC pairs) */
  quoteAmount: text("quote_amount"),
  /** Maker's address on the base chain (non-QBTC pairs) */
  makerChainAddress: text("maker_chain_address"),
  /** Where the maker wants to receive the quote asset (non-USDC EVM pairs) */
  takerChainAddress: text("taker_chain_address"),

  // ── Legacy QBTC/USDC columns (preserved for backward compatibility) ────────
  /** ASK (seller posts QBTC) | BID (buyer posts USDC) */
  offerType: text("offer_type").default("ASK"),
  /** qbtct1… / qbtc1… address of the seller */
  sellerQbtcAddress: text("seller_qbtc_address"),
  /** EVM address where the seller will receive USDC */
  sellerEvmAddress: text("seller_evm_address"),
  /** ECDSA compressed public key of the seller (hex, 33 bytes) */
  sellerPubKeyHex: text("seller_pub_key_hex"),
  buyerQbtcAddress: text("buyer_qbtc_address"),
  buyerEvmAddress: text("buyer_evm_address"),
  buyerPubKeyHex: text("buyer_pub_key_hex"),
  /** QBTC amount being offered */
  qbtcAmount: text("qbtc_amount"),
  /** USDC amount requested */
  usdcAmountRequested: text("usdc_amount_requested"),
  /** SHA-256 secret hash embedded in the HTLC */
  secretHash: text("secret_hash"),
  /** QBTC HTLC locktime (Unix timestamp) */
  qbtcLocktime: integer("qbtc_locktime"),
  /** OPEN | MATCHED | CANCELLED | LOCKED */
  status: text("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Active or completed atomic swaps.
 *
 * State machine:
 *   PENDING_QBTC_LOCK → QBTC_LOCKED → EVM_LOCKED → COMPLETE   (legacy QBTC/USDC)
 *   PENDING_SIDE_A    → SIDE_A_LOCKED → SIDE_B_LOCKED → COMPLETE  (multi-chain)
 *                    ↘ EXPIRED / REFUNDED
 *
 * The legacy columns (qbtc_htlc_txid, evm_contract_id, …) are preserved.
 * New swaps use the generic side_a_* / side_b_* columns.  Monitors read
 * both sets via COALESCE so both old and new swaps are handled.
 */
export const atomicSwaps = pgTable("atomic_swaps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Anti-enumeration external ID (migration 002) */
  publicId: varchar("public_id").default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").notNull().references(() => swapOffers.id),

  // ── Pair dimension (migration 003) ─────────────────────────────────────────
  baseChain:  varchar("base_chain",  { length: 16 }).notNull().default("QBTC"),
  quoteChain: varchar("quote_chain", { length: 16 }).notNull().default("USDC"),

  // ── Generic lock columns (migration 003) ───────────────────────────────────
  /** Amount of base asset (mirrors qbtcAmount for QBTC pairs) */
  sideAAmount: text("side_a_amount"),
  /** Amount of quote asset (mirrors usdcAmount for USDC pairs) */
  sideBAmount: text("side_b_amount"),
  /** Lock identifier on base chain — txid:vout (Bitcoin), 0xcontractId (EVM), account:seq (XRP) */
  sideALockId:      text("side_a_lock_id"),
  sideALockAddress: text("side_a_lock_address"),
  /** Unix timestamp after which maker can reclaim base-chain funds */
  sideALocktime: integer("side_a_locktime"),
  /** Lock identifier on quote chain */
  sideBLockId:  text("side_b_lock_id"),
  /** Unix timestamp after which taker can reclaim quote-chain funds */
  sideBLocktime: integer("side_b_locktime"),

  // ── Parties ───────────────────────────────────────────────────────────────
  sellerQbtcAddress: text("seller_qbtc_address").notNull(),
  sellerEvmAddress:  text("seller_evm_address").notNull(),
  sellerPubKeyHex:   text("seller_pub_key_hex").notNull(),
  buyerQbtcAddress:  text("buyer_qbtc_address").notNull(),
  buyerEvmAddress:   text("buyer_evm_address").notNull(),
  /** ECDSA compressed public key of the buyer (hex, 33 bytes) */
  buyerPubKeyHex: text("buyer_pub_key_hex").notNull(),

  // ── Amounts (legacy QBTC/USDC) ────────────────────────────────────────────
  qbtcAmount: text("qbtc_amount").notNull(),
  usdcAmount: text("usdc_amount").notNull(),

  // ── Secret / hash ─────────────────────────────────────────────────────────
  secretHash: text("secret_hash").notNull(),
  secret: text("secret"),

  // ── QBTC chain (legacy) ───────────────────────────────────────────────────
  qbtcHtlcTxid:    text("qbtc_htlc_txid"),
  qbtcHtlcAddress: text("qbtc_htlc_address"),
  qbtcLocktime:    integer("qbtc_locktime"),

  // ── EVM chain (legacy) ────────────────────────────────────────────────────
  evmContractId: text("evm_contract_id"),
  evmLocktime:   integer("evm_locktime"),

  /** Buyer claim txid (migration 001) */
  buyerQbtcClaimTxid: text("buyer_qbtc_claim_txid"),

  // ── State ─────────────────────────────────────────────────────────────────
  status: text("status").notNull().default("PENDING_QBTC_LOCK"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SwapOffer = typeof swapOffers.$inferSelect;
export type NewSwapOffer = typeof swapOffers.$inferInsert;
export type AtomicSwap = typeof atomicSwaps.$inferSelect;
export type NewAtomicSwap = typeof atomicSwaps.$inferInsert;

/** Chain IDs supported by the multi-chain swap marketplace */
export const SWAP_CHAIN_IDS = ['QBTC', 'BTC', 'ETH', 'BNB', 'USDC', 'XRP'] as const;
export type SwapChainId = typeof SWAP_CHAIN_IDS[number];

/** Legacy QBTC/USDC offer schema (backward-compatible) */
export const insertSwapOfferSchema = z.object({
  sellerQbtcAddress: z.string().min(1),
  sellerEvmAddress: z.string().min(1),
  sellerPubKeyHex: z.string().length(66), // 33 bytes compressed pubkey = 66 hex chars
  qbtcAmount: z.string().min(1),
  usdcAmountRequested: z.string().min(1),
});

/** Multi-chain offer schema (Phase 2+) */
export const insertMultiChainOfferSchema = z.object({
  baseChain:  z.enum(SWAP_CHAIN_IDS),
  quoteChain: z.enum(SWAP_CHAIN_IDS),
  baseAmount:          z.string().min(1),
  quoteAmount:         z.string().min(1),
  secretHash:          z.string().regex(/^[0-9a-fA-F]{64}$/, '32-byte hex'),
  /** Maker's locktime (unix timestamp, must be in the future) */
  makerLocktime:       z.number().int().positive(),
  /** Maker's address on the base chain */
  makerChainAddress:   z.string().min(1),
  /** Where maker receives quote asset */
  takerChainAddress:   z.string().optional(),
  /** Maker's compressed public key (ECDSA, 33 bytes, hex) */
  makerPubKeyHex:      z.string().length(66),
  /** EVM signing address for authentication (required for EVM-side makers) */
  makerEvmAddress:     z.string().optional(),
  signature:           z.string().min(1),
  timestamp:           z.number().int(),
});

export const acceptSwapOfferSchema = z.object({
  buyerQbtcAddress: z.string().min(1),
  buyerEvmAddress: z.string().min(1),
  buyerPubKeyHex: z.string().length(66),
});
