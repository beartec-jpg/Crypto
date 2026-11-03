// AI Trader Modes — self-contained copy for Vercel serverless functions.
//
// This mirrors shared/aiTraderModes.ts. It is duplicated here (rather than imported
// from ../../shared) so each Vercel function bundles cleanly via includeFiles
// ("api/_lib/**"). Keep this file in sync with shared/aiTraderModes.ts.
//
// These modes are an AI-only concept and are intentionally SEPARATE from the manual
// chart 9-system engine.

export type AiTraderModeId =
  | 'indicator'
  | 'smc'
  | 'scalping'
  | 'divergence'
  | 'volume-profile';

export type AiTraderToolName =
  | 'getIndicators'
  | 'getSmcStructures'
  | 'getVolumeProfile'
  | 'getInstitutional';

export interface AiTraderMode {
  id: AiTraderModeId;
  label: string;
  description: string;
  enabled: boolean;
  systemPrompt: string;
  validityCriteria: string;
  preferredTools: AiTraderToolName[];
}

/**
 * Compliance wording rules appended to every mode's system prompt so all AI output reads as
 * general, non-personalised technical analysis (conditional scenarios, illustrative R:R only).
 */
export const SCENARIO_LANGUAGE_RULES =
  'LANGUAGE RULES: Output is general, non-personalised technical analysis, not a recommendation. Describe every ' +
  'setup as a conditional chart scenario, e.g. "a long setup appears if price holds above X; invalidated below Y". ' +
  'Never use imperative or second-person directives (no "buy", "sell", "you should", "enter now", "go long"). ' +
  'Present risk/reward only as an illustrative ratio derived from entry, stop and target levels (e.g. "an entry at X ' +
  'with a stop at Y and target Z gives about 1:3"). Never mention position sizing, leverage amounts or a percentage of ' +
  'an account/portfolio. No hype, "hot picks", urgency, guarantees or performance claims. Use neutral third-person wording.';

export const DEFAULT_AI_TRADER_MODE: AiTraderModeId = 'smc';

export const AI_TRADER_MODES: AiTraderMode[] = [
  {
    id: 'indicator',
    label: 'Indicator',
    description: 'Momentum, trend, reversal & breakout via RSI/MACD/Stoch/ADX/BB/volume.',
    enabled: true,
    systemPrompt:
      'You are a technical/indicator analyst producing general, non-personalised chart scenarios. Your method is reading momentum and trend through classic ' +
      'indicators — RSI, MACD, Stochastic, ADX/DI, Bollinger Bands, CCI, MFI, CMF, OBV and volume. You judge the ' +
      "market by indicator confluence and triggers (crossovers, overbought/oversold reversals, squeeze breakouts, " +
      'divergences), NOT by Smart-Money structures. You do not require an FVG or order block to justify a read. ' +
      'You pull the data you need via the provided tools rather than assuming it. When a full scenario does not qualify, ' +
      'you still give a clear live indicator read (the dashboard status and what would need to change). ' +
      'Return ONLY valid JSON, no markdown. ' +
      SCENARIO_LANGUAGE_RULES,
    validityCriteria:
      'A valid INDICATOR setup requires aligned indicator confluence plus a concrete trigger: e.g. RSI/Stoch ' +
      'reversal from an extreme, a MACD crossover/histogram flip with trend agreement, an ADX-confirmed trend ' +
      'continuation, or a Bollinger squeeze/expansion breakout — supported by volume (OBV/CMF/MFI). Do NOT invent ' +
      'FVG/order-block justifications. If indicators are mixed or flat, output 0 alerts but still populate ' +
      'marketInsights with the live indicator dashboard read (per-indicator status and the bias).',
    preferredTools: ['getIndicators', 'getVolumeProfile', 'getInstitutional', 'getSmcStructures'],
  },
  {
    id: 'smc',
    label: 'SMC / ICT',
    description: 'FVGs, order blocks, liquidity sweeps, BOS/CHoCH & key levels.',
    enabled: true,
    systemPrompt:
      'You are a Smart-Money / ICT analyst producing general, non-personalised chart scenarios. Your method maps moves FROM a structural level TO a level: ' +
      'unmitigated Fair Value Gaps, order blocks, liquidity sweeps/grabs, BOS/CHoCH shifts and displacement. ' +
      'A scenario activates only if price pulls back into a high-quality entry zone (unmitigated FVG or order block); the ' +
      'invalidation sits behind the structure and the target is the next major level. Entry levels are never guessed at current price — every ' +
      'entry level has a specific structural justification. You pull the structures you need via the provided tools rather ' +
      'than assuming them. Return ONLY valid JSON, no markdown. ' +
      SCENARIO_LANGUAGE_RULES,
    validityCriteria:
      'A valid SMC setup requires price to be at or approaching a high-quality entry zone (unmitigated FVG, order ' +
      'block, or key swing) with structural confluence (BOS/CHoCH agreement, liquidity sweep, displacement). Entry ' +
      'inside the FVG/OB; stop behind the structure; targets at opposing structural levels. If price is mid-range ' +
      'with no clean unmitigated zone nearby, output 0 alerts and report the nearest unmitigated FVG/OB and the ' +
      'distance to it in marketInsights.',
    preferredTools: ['getSmcStructures', 'getVolumeProfile', 'getInstitutional', 'getIndicators'],
  },
  {
    id: 'scalping',
    label: 'Scalping',
    description: 'Fast intrabar momentum & liquidity scalps (coming soon).',
    enabled: false,
    systemPrompt:
      'You are a low-timeframe analyst describing fast momentum and liquidity scenarios. Return ONLY valid JSON. ' + SCENARIO_LANGUAGE_RULES,
    validityCriteria:
      'A valid scalp requires an immediate momentum/liquidity trigger with tight structural invalidation.',
    preferredTools: ['getIndicators', 'getSmcStructures'],
  },
  {
    id: 'divergence',
    label: 'Divergence',
    description: 'Regular & hidden oscillator divergences (coming soon).',
    enabled: false,
    systemPrompt:
      'You are a divergence analyst describing regular and hidden divergences across RSI, MACD, MFI, OBV and CVD. ' +
      'Return ONLY valid JSON. ' + SCENARIO_LANGUAGE_RULES,
    validityCriteria:
      'A valid divergence setup requires a confirmed regular/hidden divergence with a momentum trigger.',
    preferredTools: ['getIndicators', 'getVolumeProfile'],
  },
  {
    id: 'volume-profile',
    label: 'Volume Profile',
    description: 'POC / VAH / VAL and value-area rotations (coming soon).',
    enabled: false,
    systemPrompt:
      'You are a volume-profile analyst describing POC, value area (VAH/VAL), and value-area rotations. ' +
      'Return ONLY valid JSON. ' + SCENARIO_LANGUAGE_RULES,
    validityCriteria:
      'A valid setup requires price interacting with POC/VAH/VAL with acceptance/rejection confirmation.',
    preferredTools: ['getVolumeProfile', 'getInstitutional', 'getIndicators'],
  },
];

export const ENABLED_AI_TRADER_MODES: AiTraderMode[] = AI_TRADER_MODES.filter((m) => m.enabled);

export function isAiTraderModeId(value: unknown): value is AiTraderModeId {
  return typeof value === 'string' && AI_TRADER_MODES.some((m) => m.id === value);
}

export function getAiTraderMode(id?: string | null): AiTraderMode {
  const found = AI_TRADER_MODES.find((m) => m.id === id && m.enabled);
  if (found) return found;
  return (
    AI_TRADER_MODES.find((m) => m.id === DEFAULT_AI_TRADER_MODE) ?? AI_TRADER_MODES[0]
  );
}
