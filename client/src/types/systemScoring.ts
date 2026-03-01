/**
 * TypeScript interfaces for the graduated trading system scoring system.
 * Scores range from -100 (strong bearish) to +100 (strong bullish).
 */

export interface ScoredCondition {
  id?: string;
  name: string;
  met: boolean;
  weight: number;
  score?: number;
  userWeight?: 0 | 1 | 2 | 3;
  weightedScore?: number;
  description?: string;
  /** Optional human-readable value for display (e.g. "RSI: 28.4") */
  value?: string;
}

export interface SystemEvaluation {
  systemId: string;
  /** Continuous score: -100 (strong bearish) to +100 (strong bullish) */
  score: number;
  /** Certainty of the evaluation: 0-100 */
  confidence: number;
  conditions: ScoredCondition[];
  /** Human-readable status label derived from score */
  signalLabel: SignalLabel;
  /** Tailwind/hex color for the label */
  signalColor: string;
  /** Top reasons extracted from strongest condition scores */
  reasoning?: string[];
  /** Unix ms timestamp of when this evaluation was computed */
  timestamp?: number;
}

export type SignalLabel =
  | 'BUY SIGNAL'
  | 'BUILDING BUY'
  | 'WEAK BULLISH'
  | 'NEUTRAL'
  | 'WEAK BEARISH'
  | 'BEARISH SETUP'
  | 'SELL SIGNAL';

export interface MarkerSettings {
  /** Show percentage score badges on candles at interval */
  showRollingScores: boolean;
  /** Show a badge every N candles (1, 5, 10, 20) */
  rollingScoreInterval: number;
  /** Only show ±threshold% signal arrows, no rolling badges */
  showSignalsOnly: boolean;
  /** Threshold for buy/sell signal arrows (0-100) */
  signalThreshold: number;
}

export const DEFAULT_MARKER_SETTINGS: MarkerSettings = {
  showRollingScores: false,
  rollingScoreInterval: 10,
  showSignalsOnly: true,
  signalThreshold: 80,
};
