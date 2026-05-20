/**
 * Market pattern detection for the Multi-System Confluence Monitor.
 * Analyses relationships between available trading system scores to identify
 * actionable market conditions.
 */

export interface MarketPattern {
  type: 'strong_signal' | 'warning' | 'opportunity' | 'neutral' | 'conflict' | 'transition' | 'caution';
  icon: string;
  title: string;
  description: string;
  recommendation: string;
  priority: number; // 1-10, higher = more important
  color: {
    bg: string;
    border: string;
    text: string;
  };
}

interface SystemScore {
  systemId: string;
  score: number;
}

/**
 * Detect the top market patterns from multi-system scores.
 *
 * @param overallScore  Average score across all systems (-100..+100)
 * @param evaluations   Individual system scores (-100..+100 each)
 * @param previousScore Previous cycle's overall score for trend detection
 */
export function detectMarketPattern(
  overallScore: number,
  evaluations: SystemScore[],
  previousScore?: number,
): MarketPattern[] {
  const patterns: MarketPattern[] = [];

  const trendScore = evaluations.find(e => e.systemId === 'trend-following')?.score ?? 0;
  const meanReversionScore = evaluations.find(e => e.systemId === 'mean-reversion')?.score ?? 0;
  const breakoutScore = evaluations.find(e => e.systemId === 'breakout-momentum')?.score ?? 0;
  const smartMoneyScore = evaluations.find(e => e.systemId === 'smart-money')?.score ?? 0;
  const smcTrendEngineScore = evaluations.find(e => e.systemId === 'smc-trend-engine')?.score ?? 0;
  const momentumScalperScore = evaluations.find(e => e.systemId === 'momentum-scalper')?.score ?? 0;
  const divergenceScore = evaluations.find(e => e.systemId === 'divergence-master')?.score ?? 0;
  const multiTimeframeScore = evaluations.find(e => e.systemId === 'mtf-confluence')?.score ?? 0;
  const volumeProfileScore = evaluations.find(e => e.systemId === 'volume-profile')?.score ?? 0;

  const bullishCount = evaluations.filter(e => e.score > 20).length;
  const bearishCount = evaluations.filter(e => e.score < -20).length;
  const neutralCount = evaluations.filter(e => Math.abs(e.score) <= 20).length;

  // 1. High Confluence Signals (Priority: 10)
  if (overallScore > 65 && bullishCount >= 6) {
    patterns.push({
      type: 'strong_signal',
      icon: '🚀',
      title: 'HIGH CONFLUENCE BUY SIGNAL',
      description: `${bullishCount}/${evaluations.length} systems bullish with ${overallScore.toFixed(0)}% average score`,
      recommendation: 'Strong multi-system agreement for long entry',
      priority: 10,
      color: { bg: 'bg-emerald-900/30', border: 'border-emerald-600', text: 'text-emerald-400' },
    });
  }

  if (overallScore < -65 && bearishCount >= 6) {
    patterns.push({
      type: 'strong_signal',
      icon: '📉',
      title: 'HIGH CONFLUENCE SELL SIGNAL',
      description: `${bearishCount}/${evaluations.length} systems bearish with ${overallScore.toFixed(0)}% average score`,
      recommendation: 'Strong multi-system agreement for short entry',
      priority: 10,
      color: { bg: 'bg-red-900/30', border: 'border-red-600', text: 'text-red-400' },
    });
  }

  // 1b. Moderate Buy/Sell Signals (Priority: 7.5)
  if (overallScore > 40 && overallScore <= 65 && bullishCount >= 4) {
    patterns.push({
      type: 'opportunity',
      icon: '📈',
      title: 'MODERATE BUY SIGNAL',
      description: `${bullishCount}/${evaluations.length} systems bullish with ${overallScore.toFixed(0)}% average`,
      recommendation: 'Good setup but not high confluence - consider partial position',
      priority: 7.5,
      color: { bg: 'bg-lime-900/30', border: 'border-lime-600', text: 'text-lime-400' },
    });
  }

  if (overallScore < -40 && overallScore >= -65 && bearishCount >= 4) {
    patterns.push({
      type: 'opportunity',
      icon: '📉',
      title: 'MODERATE SELL SIGNAL',
      description: `${bearishCount}/${evaluations.length} systems bearish with ${overallScore.toFixed(0)}% average`,
      recommendation: 'Good setup but not high confluence - consider partial position',
      priority: 7.5,
      color: { bg: 'bg-orange-900/30', border: 'border-orange-600', text: 'text-orange-400' },
    });
  }

  // 2. False Breakout Warning (Priority: 9)
  if (
    breakoutScore > 60 &&
    volumeProfileScore < -30 &&
    smartMoneyScore < 10 &&
    smcTrendEngineScore < 10
  ) {
    patterns.push({
      type: 'warning',
      icon: '⚠️',
      title: 'FALSE BREAKOUT WARNING',
      description: `Breakout system fired (+${breakoutScore.toFixed(0)}%) but volume very weak and smart money not confirming`,
      recommendation: 'Wait for volume or structure support before entry',
      priority: 9,
      color: { bg: 'bg-orange-900/30', border: 'border-orange-600', text: 'text-orange-400' },
    });
  }

  // 3. Bottom / Top Forming (Priority: 8)
  if (
    overallScore < -10 && overallScore > -40 &&
    divergenceScore > 40 &&
    meanReversionScore > 30 &&
    trendScore < -30
  ) {
    patterns.push({
      type: 'opportunity',
      icon: '📍',
      title: 'POTENTIAL BOTTOM FORMING',
      description: 'Reversal systems firing while trend still bearish',
      recommendation: 'Watch for trend system confirmation (SuperTrend flip)',
      priority: 8,
      color: { bg: 'bg-blue-900/30', border: 'border-blue-600', text: 'text-blue-400' },
    });
  }

  if (
    overallScore > 10 && overallScore < 40 &&
    divergenceScore < -40 &&
    meanReversionScore < -30 &&
    trendScore > 30
  ) {
    patterns.push({
      type: 'opportunity',
      icon: '🔴',
      title: 'POTENTIAL TOP FORMING',
      description: 'Reversal systems turning bearish while trend still bullish',
      recommendation: 'Consider taking profits or tightening stops',
      priority: 8,
      color: { bg: 'bg-orange-900/30', border: 'border-orange-600', text: 'text-orange-400' },
    });
  }

  // 4. Momentum Exhaustion (Priority: 7)
  if (
    overallScore > 60 &&
    meanReversionScore < -50 &&
    volumeProfileScore < -30
  ) {
    patterns.push({
      type: 'caution',
      icon: '⚠️',
      title: 'MOMENTUM EXHAUSTION',
      description: 'Strong bullish trend but reversal systems showing overbought',
      recommendation: 'Consider profit-taking or move stops to breakeven',
      priority: 7,
      color: { bg: 'bg-yellow-900/30', border: 'border-yellow-600', text: 'text-yellow-400' },
    });
  }

  if (
    overallScore < -60 &&
    meanReversionScore > 50 &&
    volumeProfileScore > 30
  ) {
    patterns.push({
      type: 'caution',
      icon: '⚠️',
      title: 'MOMENTUM EXHAUSTION',
      description: 'Strong bearish trend but reversal systems showing oversold',
      recommendation: 'Watch for potential reversal or cover shorts',
      priority: 7,
      color: { bg: 'bg-yellow-900/30', border: 'border-yellow-600', text: 'text-yellow-400' },
    });
  }

  // 5. System Divergence (Priority: 6)
  if (evaluations.length > 0) {
    const maxScore = Math.max(...evaluations.map(e => e.score));
    const minScore = Math.min(...evaluations.map(e => e.score));

    if (maxScore > 50 && minScore < -50 && (maxScore - minScore) > 80) {
      const strongest = evaluations.find(e => e.score === maxScore);
      const weakest = evaluations.find(e => e.score === minScore);

      patterns.push({
        type: 'conflict',
        icon: '⚔️',
        title: 'SYSTEM DIVERGENCE',
        description: `${(strongest?.systemId ?? '').replace(/-/g, ' ')} very bullish (+${maxScore.toFixed(0)}) while ${(weakest?.systemId ?? '').replace(/-/g, ' ')} very bearish (${minScore.toFixed(0)})`,
        recommendation: 'Wait for systems to align or trade with reduced size',
        priority: 6,
        color: { bg: 'bg-yellow-900/30', border: 'border-yellow-600', text: 'text-yellow-400' },
      });
    }
  }

  // 6. Trend Reversal Building (Priority: 5)
  if (
    previousScore !== undefined &&
    previousScore < -40 &&
    overallScore > -20 && overallScore < 20 &&
    (divergenceScore > 50 || meanReversionScore > 50)
  ) {
    patterns.push({
      type: 'transition',
      icon: '🔄',
      title: 'BULLISH REVERSAL BUILDING',
      description: 'Score improving from bearish zone, reversal systems active',
      recommendation: 'Watch for trend confirmation before entry',
      priority: 5,
      color: { bg: 'bg-cyan-900/30', border: 'border-cyan-600', text: 'text-cyan-400' },
    });
  }

  if (
    previousScore !== undefined &&
    previousScore > 40 &&
    overallScore < 20 && overallScore > -20 &&
    (divergenceScore < -50 || meanReversionScore < -50)
  ) {
    patterns.push({
      type: 'transition',
      icon: '🔄',
      title: 'BEARISH REVERSAL BUILDING',
      description: 'Score declining from bullish zone, reversal systems active',
      recommendation: 'Watch for trend confirmation before entry',
      priority: 5,
      color: { bg: 'bg-cyan-900/30', border: 'border-cyan-600', text: 'text-cyan-400' },
    });
  }

  // 7. Choppy Market (Priority: 4)
  if (Math.abs(overallScore) < 20 && neutralCount >= 3) {
    patterns.push({
      type: 'neutral',
      icon: '⏸️',
      title: 'CHOPPY MARKET',
      description: 'No clear directional bias across systems',
      recommendation: 'Wait for clearer setup or reduce position size',
      priority: 4,
      color: { bg: 'bg-slate-800/50', border: 'border-slate-600', text: 'text-slate-400' },
    });
  }

  // 8. Consolidation Pattern (Priority: 3)
  if (
    Math.abs(overallScore) < 10 &&
    neutralCount >= 5 &&
    previousScore !== undefined &&
    Math.abs(previousScore) < 15
  ) {
    patterns.push({
      type: 'neutral',
      icon: '💤',
      title: 'CONSOLIDATION',
      description: 'Market in tight range with no clear direction',
      recommendation: 'Wait for breakout or trade range boundaries',
      priority: 3,
      color: { bg: 'bg-slate-800/50', border: 'border-slate-500', text: 'text-slate-400' },
    });
  }

  // Return top 3 patterns sorted by priority
  patterns.sort((a, b) => b.priority - a.priority);
  return patterns.slice(0, 3);
}
