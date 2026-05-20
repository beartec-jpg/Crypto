import type { ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';

export interface SMCTrendEnginePanelData {
  scoringInput: ScoringInput | null;
  evaluation: SystemEvaluation | null;
}

