import { useMemo } from 'react';
import { scoreSystem, type ScoringInput } from '@/lib/tradingSystemScoring';
import type { SystemEvaluation } from '@/types/systemScoring';

export function useSMCTrendScore(scoringInput: ScoringInput | null): SystemEvaluation | null {
  return useMemo(() => {
    if (!scoringInput) return null;
    return scoreSystem('smc-trend-engine', scoringInput);
  }, [scoringInput]);
}

