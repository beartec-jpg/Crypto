import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { ScoringInput } from '@/lib/tradingSystemScoring';
import { getTrendStrengthMultiplier, getConsecutiveMSSCount, getStructureLookbackCandles } from '@/lib/tradingSystemScoring';

interface SMCDebugTableProps {
  evaluation: SystemEvaluation;
  scoringInput: ScoringInput;
}

export function SMCDebugTable({ evaluation, scoringInput }: SMCDebugTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const trendCondition = evaluation.conditions.find(c => c.id === 'trendStrength');

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-2 px-3 flex items-center justify-between text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 rounded transition-colors"
      >
        <span>🔍 Show Debug Info</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="border-t border-slate-700 mt-2 pt-2">
      <button
        onClick={() => setIsOpen(false)}
        className="w-full py-2 px-3 flex items-center justify-between text-xs text-slate-300 hover:bg-slate-800/50 rounded transition-colors"
      >
        <span className="font-semibold">🔍 DEBUG INFO</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      <div className="mt-3 space-y-4 text-xs px-3">
        {/* Overall Score with tier display */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-700">
          <span className="font-semibold text-slate-300">📊 FINAL SCORE</span>
          <span className={`font-mono text-sm ${getScoreTierColor(evaluation.score)}`}>
            {evaluation.score > 0 ? '+' : ''}{evaluation.score}
            {Math.abs(evaluation.score) >= 120 && <span className="ml-1">🔥</span>}
          </span>
        </div>

        {/* Trend Strength Multiplier */}
        <ConditionDebug
          title="Trend Strength Multiplier"
          score={trendCondition?.score ?? 0}
          scoreLabel={
            trendCondition?.value
              ? `${trendCondition.value} (${(trendCondition.score ?? 0) > 0 ? '+' : ''}${trendCondition.score ?? 0}/100)`
              : undefined
          }
          details={getTrendStrengthDetails(scoringInput)}
        />

        {/* Breaker Block Proximity */}
        <ConditionDebug
          title="Breaker Block Proximity"
          score={evaluation.conditions.find(c => c.id === 'breakerBlockProximity')?.score ?? 0}
          details={getBreakerBlockDetails(scoringInput)}
        />

        {/* FVG Proximity */}
        <ConditionDebug
          title="FVG Proximity"
          score={evaluation.conditions.find(c => c.id === 'fvgProximity')?.score ?? 0}
          details={getFVGDetails(scoringInput)}
        />

        {/* Order Block Proximity */}
        <ConditionDebug
          title="Order Block Proximity"
          score={evaluation.conditions.find(c => c.id === 'orderBlockTouch')?.score ?? 0}
          details={getOrderBlockDetails(scoringInput)}
        />

        {/* Liquidity Sweep */}
        <ConditionDebug
          title="Liquidity Sweep"
          score={evaluation.conditions.find(c => c.id === 'liquiditySweep')?.score ?? 0}
          details={getLiquiditySweepDetails(scoringInput)}
        />

        {/* Divergence */}
        <ConditionDebug
          title="Divergence Confluence"
          score={evaluation.conditions.find(c => c.id === 'divergenceConfluence')?.score ?? 0}
          details={getDivergenceDetails(scoringInput)}
        />

        {/* Auto-Fib */}
        <ConditionDebug
          title="Auto-Fib Confluence"
          score={evaluation.conditions.find(c => c.id === 'autoFibConfluence')?.score ?? 0}
          details={getAutoFibDetails(scoringInput)}
        />

        {/* Market Context */}
                {/* Inducement Sequence */}
                <ConditionDebug
                  title="Inducement Sequence"
                  score={evaluation.conditions.find(c => c.id === 'inducementSequence')?.score ?? 0}
                  details={getInducementDetails(scoringInput)}
                />

                {/* Market Context */}
        <div className="pt-3 border-t border-slate-700">
          <div className="font-semibold text-slate-300 mb-2">📈 MARKET CONTEXT</div>
          <div className="space-y-1 text-slate-400 ml-3">
            <div>├─ Current Price: {scoringInput.latestClose?.toFixed(4) ?? 'N/A'} USDT</div>
            <div>├─ Current Candle: #{scoringInput.currentCandleIndex ?? 'N/A'}</div>
            <div>├─ Timeframe: {scoringInput.timeframe ?? 'N/A'}</div>
            <div>└─ Last Update: {new Date().toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConditionDebugProps {
  title: string;
  score: number;
  scoreLabel?: string;
  details: React.ReactNode;
}

function getScoreTierColor(score: number): string {
  const abs = Math.abs(score);
  if (abs >= 150) return 'text-emerald-400 font-extrabold animate-pulse';
  if (abs >= 120) return 'text-teal-400 font-bold';
  if (abs >= 100) return 'text-green-400 font-semibold';
  if (abs >= 80) return 'text-green-500';
  if (abs >= 50) return 'text-lime-500';
  if (abs >= 20) return 'text-yellow-400';
  return 'text-slate-400';
}

function ConditionDebug({ title, score, scoreLabel, details }: ConditionDebugProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">{title}</span>
        <span className={`font-mono ${getScoreTierColor(score)}`}>
          {scoreLabel ?? `${score > 0 ? '+' : ''}${score}${Math.abs(score) <= 100 ? ' / 100' : ''}`}
          {Math.abs(score) >= 120 && <span className="ml-1 text-xs">🔥</span>}
        </span>
      </div>
      <div className="ml-3 space-y-1 text-slate-400">
        {details}
      </div>
    </div>
  );
}

function getBreakerBlockDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const activeBreakers = (input.breakers ?? []).filter(b => b.mitigated !== true);

  if (activeBreakers.length === 0) {
    return <div>└─ Status: ⚠️ NO ACTIVE BREAKERS</div>;
  }

  const nearest = activeBreakers
    .map(b => {
      let dist: number;
      let distPct: number;
      let isInside: boolean;

      if (currentPrice >= b.low && currentPrice <= b.high) {
        dist = 0;
        distPct = 0;
        isInside = true;
      } else {
        const distanceFromTop = currentPrice > b.high ? currentPrice - b.high : 0;
        const distanceFromBottom = currentPrice < b.low ? b.low - currentPrice : 0;
        dist = Math.max(distanceFromTop, distanceFromBottom);
        distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
        isInside = false;
      }

      return { b, dist, distPct, isInside };
    })
    .sort((a, b) => a.dist - b.dist)[0];

  const candlesSinceConversion =
    input.currentCandleIndex !== undefined && nearest.b.conversionIndex !== undefined
      ? input.currentCandleIndex - nearest.b.conversionIndex
      : 'Unknown';

  return (
    <>
      <div>├─ Type: {nearest.b.type === 'bullish' ? 'Bullish' : 'Bearish'} Breaker</div>
      <div>├─ Range: {nearest.b.low.toFixed(4)} - {nearest.b.high.toFixed(4)}</div>
      <div>├─ Distance: {nearest.isInside ? '0.00% (INSIDE ZONE)' : `${nearest.distPct.toFixed(2)}%`}</div>
      <div>├─ Converted: {candlesSinceConversion} candles ago{nearest.b.conversionPrice !== undefined ? ` at ${nearest.b.conversionPrice.toFixed(4)}` : ''}</div>
      <div>├─ Status: ✅ ACTIVE BREAKER</div>
      <div>└─ Total Breakers: {activeBreakers.length}</div>
    </>
  );
}

function getTrendStrengthDetails(input: ScoringInput) {
  if (!input.structureBreaks || input.structureBreaks.length === 0) {
    return <div>└─ Status: ⚠️ NO STRUCTURE BREAKS</div>;
  }

  // Determine current structure direction (mirrors scoreSmartMoney logic)
  const lookbackCandles = getStructureLookbackCandles(input.timeframe);
  const recentBreaks = input.structureBreaks.filter(sb => {
    if (sb.breakIndex !== undefined && input.currentCandleIndex !== undefined) {
      return sb.breakIndex >= input.currentCandleIndex - lookbackCandles;
    }
    return true;
  });

  const recentMSS = input.structureBreaks
    .filter(sb => sb.type === 'mss' || sb.type === 'choch')
    .sort((a, b) => b.breakTime - a.breakTime)[0];

  const recentStructureBreak = recentMSS ?? recentBreaks.sort((a, b) => b.breakTime - a.breakTime)[0];
  const direction = recentStructureBreak?.direction ?? 'bullish';

  const multiplier = getTrendStrengthMultiplier(
    input.structureBreaks,
    direction,
    input.currentTime ?? 0,
    lookbackCandles,
  );
  const count = getConsecutiveMSSCount(
    input.structureBreaks,
    direction,
    input.currentTime ?? 0,
    lookbackCandles,
  );

  const allMSSCHoCH = input.structureBreaks
    .filter(sb => sb.type === 'mss' || sb.type === 'choch')
    .sort((a, b) => b.breakTime - a.breakTime)
    .slice(0, 6);

  return (
    <>
      <div>├─ Direction: {direction === 'bullish' ? 'Bullish ↑' : 'Bearish ↓'}</div>
      <div>├─ Consecutive {direction} MSS/CHoCH: {count}</div>
      <div>├─ Multiplier: {multiplier.toFixed(2)}x ({count === 0 ? 'No trend' : count === 1 ? 'Baseline' : `+${Math.round((multiplier - 1) * 100)}% boost`})</div>
      <div>├─ Recent MSS/CHoCH (newest first):</div>
      {allMSSCHoCH.slice(0, 4).map((sb, i, arr) => (
        <div key={i} className="ml-3">
          {i === arr.length - 1 ? '└' : '├'}─ {sb.type?.toUpperCase()} {sb.direction === 'bullish' ? '↑' : '↓'} {sb.direction === direction ? '✅' : '⛔'}
        </div>
      ))}
      <div>└─ Status: {count > 0 ? `✅ ${multiplier.toFixed(2)}x TREND STRENGTH` : '⚠️ NO CONSECUTIVE TREND'}</div>
    </>
  );
}

function getFVGDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const activeFVGs = input.fvgs?.filter(fvg => !fvg.filled) ?? [];

  if (activeFVGs.length === 0) {
    return <div>└─ Status: ⚠️ NO UNFILLED FVG</div>;
  }

  const nearest = activeFVGs
    .map(fvg => {
      let dist: number;
      let distPct: number;
      let isInside: boolean;

      if (currentPrice >= fvg.low && currentPrice <= fvg.high) {
        dist = 0;
        distPct = 0;
        isInside = true;
      } else {
        const distanceFromTop = currentPrice > fvg.high ? currentPrice - fvg.high : 0;
        const distanceFromBottom = currentPrice < fvg.low ? fvg.low - currentPrice : 0;
        dist = Math.max(distanceFromTop, distanceFromBottom);
        distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
        isInside = false;
      }

      return { fvg, dist, distPct, isInside };
    })
    .sort((a, b) => a.dist - b.dist)[0];

  return (
    <>
      <div>├─ Nearest: {nearest.fvg.type === 'bullish' ? 'Bullish' : 'Bearish'} FVG</div>
      <div>├─ FVG Range: {nearest.fvg.low.toFixed(4)} - {nearest.fvg.high.toFixed(4)}</div>
      <div>├─ Distance: {nearest.isInside ? '0.00% (INSIDE ZONE)' : `${nearest.distPct.toFixed(2)}% (${nearest.dist.toFixed(4)} USDT)`}</div>
      <div>├─ Status: ✅ UNFILLED</div>
      <div>└─ Total Active: {activeFVGs.length} FVGs</div>
    </>
  );
}

function getOrderBlockDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const activeOBs = input.orderBlocks ?? [];

  if (activeOBs.length === 0) {
    return <div>└─ Status: ⚠️ NO ORDER BLOCKS</div>;
  }

  const nearest = activeOBs
    .map(ob => {
      let dist: number;
      let distPct: number;
      let isInside: boolean;

      if (currentPrice >= ob.low && currentPrice <= ob.high) {
        dist = 0;
        distPct = 0;
        isInside = true;
      } else {
        const distanceFromTop = currentPrice > ob.high ? currentPrice - ob.high : 0;
        const distanceFromBottom = currentPrice < ob.low ? ob.low - currentPrice : 0;
        dist = Math.max(distanceFromTop, distanceFromBottom);
        distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
        isInside = false;
      }

      return { ob, dist, distPct, isInside };
    })
    .sort((a, b) => a.dist - b.dist)[0];

  return (
    <>
      <div>├─ Nearest: {nearest.ob.type === 'bullish' ? 'Bullish' : 'Bearish'} OB</div>
      <div>├─ OB Range: {nearest.ob.low.toFixed(4)} - {nearest.ob.high.toFixed(4)}</div>
      <div>├─ Distance: {nearest.isInside ? '0.00% (INSIDE ZONE)' : `${nearest.distPct.toFixed(2)}% (${nearest.dist.toFixed(4)} USDT)`}</div>
      <div>├─ Status: ✅ ACTIVE</div>
      <div>└─ Total: {activeOBs.length} OBs</div>
    </>
  );
}

function getLiquiditySweepDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const currentCandleIndex = input.currentCandleIndex;

  if (!currentCandleIndex) {
    return (
      <div className="flex items-start gap-1">
        <span className="text-slate-500">└─</span>
        <span>Status: ⚠️ NO ACTIVE SWEEPS</span>
      </div>
    );
  }

  // Find the most recent valid sweep (mirrors scoreLiquiditySweepProximity logic)
  let bestSweepIndex = -1;
  let bestAge = 0;
  let bestType: 'high' | 'low' | null = null;
  let bestScore = 0;
  let bestSource: 'LZ' | 'FVG' | 'OB' | null = null;

  if (input.liquidityZones) {
    for (const lz of input.liquidityZones) {
      if (!lz.swept) continue;
      const sweptIdx = lz.sweptIndex ?? lz.sweepIndex;
      if (sweptIdx === undefined) continue;
      const age = currentCandleIndex - sweptIdx;
      if (age > 10) continue;
      if (lz.type === 'high' && currentPrice < lz.price) continue;
      if (lz.type === 'low' && currentPrice > lz.price) continue;
      if (sweptIdx > bestSweepIndex) {
        bestSweepIndex = sweptIdx;
        bestAge = age;
        bestType = lz.type;
        bestSource = 'LZ';
        const decay = Math.max(0, 100 - (age * 10));
        bestScore = lz.type === 'high' ? -decay : decay;
      }
    }
  }

  const sbSweeps = input.structureBreaks?.filter(sb => sb.swept === true) ?? [];
  for (const sb of sbSweeps) {
    if (sb.brokenLevel === undefined || sb.breakIndex === undefined) continue;
    const age = currentCandleIndex - sb.breakIndex;
    if (age > 10) continue;
    if (sb.direction === 'bullish' && currentPrice < sb.brokenLevel) continue;
    if (sb.direction === 'bearish' && currentPrice > sb.brokenLevel) continue;
    if (sb.breakIndex > bestSweepIndex) {
      bestSweepIndex = sb.breakIndex;
      bestAge = age;
      bestType = sb.direction === 'bullish' ? 'low' : 'high';
      bestSource = 'LZ';
      const decay = Math.max(0, 100 - (age * 10));
      bestScore = sb.direction === 'bullish' ? decay : -decay;
    }
  }

  // Check FVG sweeps
  if (input.fvgs) {
    for (const fvg of input.fvgs) {
      if (!fvg.swept || fvg.sweepIndex === undefined) continue;
      const age = currentCandleIndex - fvg.sweepIndex;
      if (age < 0 || age > 10) continue;
      if (fvg.sweepPrice !== undefined) {
        if (fvg.type === 'bullish' && currentPrice < fvg.sweepPrice) continue;
        if (fvg.type === 'bearish' && currentPrice > fvg.sweepPrice) continue;
      }
      if (fvg.sweepIndex > bestSweepIndex) {
        bestSweepIndex = fvg.sweepIndex;
        bestAge = age;
        bestType = fvg.type === 'bullish' ? 'low' : 'high';
        bestSource = 'FVG';
        const decay = Math.max(0, 100 - (age * 10));
        bestScore = fvg.type === 'bullish' ? -decay : decay;
      }
    }
  }

  // Check Order Block sweeps
  if (input.orderBlocks) {
    for (const ob of input.orderBlocks) {
      if (!ob.swept || ob.sweepIndex === undefined) continue;
      const age = currentCandleIndex - ob.sweepIndex;
      if (age < 0 || age > 10) continue;
      if (ob.sweepPrice !== undefined) {
        if (ob.type === 'bullish' && currentPrice < ob.sweepPrice) continue;
        if (ob.type === 'bearish' && currentPrice > ob.sweepPrice) continue;
      }
      if (ob.sweepIndex > bestSweepIndex) {
        bestSweepIndex = ob.sweepIndex;
        bestAge = age;
        bestType = ob.type === 'bullish' ? 'low' : 'high';
        bestSource = 'OB';
        const decay = Math.max(0, 100 - (age * 10));
        bestScore = ob.type === 'bullish' ? -decay : decay;
      }
    }
  }

  if (bestType === null) {
    return (
      <div className="flex items-start gap-1">
        <span className="text-slate-500">└─</span>
        <span>Status: ⚠️ NO ACTIVE SWEEPS</span>
      </div>
    );
  }

  const isBearish = bestType === 'high';
  const liquidityScore = bestScore;
  const candlesSinceSweep = bestAge;
  const sourceLabel = bestSource === 'FVG' ? ' (FVG ⚡)' : bestSource === 'OB' ? ' (OB ⚡)' : '';

  return (
    <div className="pl-4 space-y-0.5 text-xs text-slate-400">
      <div className="flex items-start gap-1">
        <span className="text-slate-500">├─</span>
        <span>Type: {isBearish ? `High Sweep (BEARISH)${sourceLabel}` : `Low Sweep (BULLISH)${sourceLabel}`}</span>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-slate-500">├─</span>
        <span>Age: {candlesSinceSweep} candles</span>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-slate-500">├─</span>
        <span>Decay: {Math.abs(liquidityScore)}% strength</span>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-slate-500">├─</span>
        <span>Expires: {10 - candlesSinceSweep} candles remaining</span>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-slate-500">├─</span>
        <span>Expected: {isBearish ? '⬇️ Bearish Reversal' : '⬆️ Bullish Reversal'}</span>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-slate-500">└─</span>
        <span>Score: {liquidityScore > 0 ? '+' : ''}{liquidityScore}</span>
      </div>
    </div>
  );
}

function getDivergenceDetails(input: ScoringInput) {
  const bullishDivs = input.divergencePoints?.filter(d => d.type === 'bullish') ?? [];
  const bearishDivs = input.divergencePoints?.filter(d => d.type === 'bearish') ?? [];
  const rsiMin = input.rsiHistory && input.rsiHistory.length > 0 ? Math.min(...input.rsiHistory) : 0;
  const rsiMax = input.rsiHistory && input.rsiHistory.length > 0 ? Math.max(...input.rsiHistory) : 0;

  const tfMinutesMap: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  const tfKey = input.timeframe ?? '15m';
  const tfMinutes = tfMinutesMap[tfKey] ?? 15;
  const barSeconds = tfMinutes * 60;
  const currentTime = input.currentTime;

  const recentPoints = (input.divergencePoints ?? [])
    .filter(p => currentTime === undefined || p.time <= currentTime)
    .sort((a, b) => b.time - a.time)
    .slice(0, 4);

  return (
    <>
      <div>├─ Bullish Divs: {bullishDivs.length} detected</div>
      <div>├─ Bearish Divs: {bearishDivs.length} detected</div>
      <div>├─ Lookback: {input.rsiHistory?.length ?? 0} candles</div>
      <div>├─ RSI Range: {rsiMin.toFixed(1)} - {rsiMax.toFixed(1)}</div>
      <div>├─ Recent Points Used:</div>
      {recentPoints.length === 0 ? (
        <div className="ml-3">│  └─ None in current scoring window</div>
      ) : (
        recentPoints.map((point, idx) => {
          const ageBars = currentTime !== undefined
            ? Math.max(0, Math.round((currentTime - point.time) / barSeconds))
            : 0;
          const sign = point.type === 'bullish' ? '+' : '-';
          const indicatorList = point.indicators.join(', ');
          const smtText = point.smtScore ? ` | SMT ${Math.round(point.smtScore)}` : '';
          const branch = idx === recentPoints.length - 1 ? '└' : '├';
          return (
            <div key={`${point.time}-${point.type}-${idx}`} className="ml-3">
              {`│  ${branch}─ ${new Date(point.time * 1000).toLocaleString()} | ${point.type.toUpperCase()} | ${sign}${point.count}/7 | age ${ageBars} bars${smtText}`}
              <div className="ml-4 text-[10px] text-slate-500">{`Indicators: ${indicatorList}`}</div>
            </div>
          );
        })
      )}
      <div>└─ Status: {bullishDivs.length + bearishDivs.length > 0 ? '✅ DIVERGENCE FOUND' : '⚠️ NO DIVERGENCE'}</div>
    </>
  );
}

function getAutoFibDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const autoFibResult = input.autoFibResult;

  if (!autoFibResult || (!autoFibResult.primary && !autoFibResult.secondary)) {
    return <div>└─ Status: ⚠️ NO FIBS DETECTED</div>;
  }

  const allLevels: Array<{
    source: 'Primary' | 'Secondary';
    level: string;
    price: number;
    isFrozen: boolean;
    isGolden: boolean;
    dist: number;
    distPct: number;
  }> = [];

  if (autoFibResult.primary) {
    autoFibResult.primary.levels.forEach(l => {
      const dist = Math.abs(currentPrice - l.price);
      const distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
      allLevels.push({ source: 'Primary', level: l.percentage, price: l.price, isFrozen: l.isFrozen, isGolden: l.isGolden, dist, distPct });
    });
  }

  if (autoFibResult.secondary) {
    autoFibResult.secondary.levels.forEach(l => {
      const dist = Math.abs(currentPrice - l.price);
      const distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
      allLevels.push({ source: 'Secondary', level: l.percentage, price: l.price, isFrozen: l.isFrozen, isGolden: l.isGolden, dist, distPct });
    });
  }

  allLevels.sort((a, b) => a.dist - b.dist);

  const nearestActive = allLevels.find(l => !l.isFrozen);
  const nearestFrozen = allLevels.find(l => l.isFrozen);
  const top3 = allLevels.slice(0, 3);

  const hasFVGConf = input.fvgs?.some(fvg =>
    !fvg.filled && allLevels.some(l =>
      currentPrice > 0 && Math.abs(l.price - (fvg.high + fvg.low) / 2) / currentPrice * 100 < 0.5
    )
  );

  const hasOBConf = input.orderBlocks?.some(ob =>
    allLevels.some(l =>
      currentPrice > 0 && Math.abs(l.price - (ob.high + ob.low) / 2) / currentPrice * 100 < 0.5
    )
  );

  return (
    <>
      <div>├─ Scoring Mode: Primary Fib Only</div>
      <div>├─ Primary Fibs: {autoFibResult.primary?.levels.length ?? 0} levels</div>
      {top3.filter(l => l.source === 'Primary').slice(0, 2).map((l, i, arr) => (
        <div key={i} className="ml-3">
          │  {i === arr.length - 1 ? '└' : '├'}─ {l.level} at {l.price.toFixed(4)} (dist: {l.distPct.toFixed(2)}%){l.isGolden ? ' ✨' : ''}{l.isFrozen ? ' ❄️ FROZEN' : ''}
        </div>
      ))}
      <div>├─ Secondary Fibs: {autoFibResult.secondary?.levels.length ?? 0} levels</div>
      {top3.filter(l => l.source === 'Secondary').slice(0, 2).map((l, i, arr) => (
        <div key={i} className="ml-3">
          │  {i === arr.length - 1 ? '└' : '├'}─ {l.level} at {l.price.toFixed(4)} (dist: {l.distPct.toFixed(2)}%){l.isGolden ? ' ✨' : ''}{l.isFrozen ? ' ❄️ FROZEN' : ''}
        </div>
      ))}
      {nearestActive && (
        <div>├─ Nearest Active: {nearestActive.source} {nearestActive.level} at {nearestActive.price.toFixed(4)} ({nearestActive.distPct.toFixed(2)}%)</div>
      )}
      {nearestFrozen && (
        <div>├─ Nearest Frozen: {nearestFrozen.source} {nearestFrozen.level} at {nearestFrozen.price.toFixed(4)} ({nearestFrozen.distPct.toFixed(2)}%)</div>
      )}
      <div>├─ FVG Confluence: {hasFVGConf ? '✅ YES' : '❌ NO'}</div>
      <div>├─ OB Confluence: {hasOBConf ? '✅ YES' : '❌ NO'}</div>
      <div>└─ Status: {nearestActive && nearestActive.distPct < 2 ? '✅ NEAR ACTIVE FIB' : '⚠️ ALL ACTIVE FIBS TOO FAR'}</div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FVG-Only Section
// A self-contained display used when FVG-Only mode is toggled in the chart.
// Reuses the same monospace debug-table style as the rest of this file.
// ─────────────────────────────────────────────────────────────────────────────

function getInducementDetails(input: ScoringInput) {
  const currentPrice = input.latestClose ?? 0;
  const liquidityZones = input.liquidityZones ?? [];
  const structureBreaks = input.structureBreaks ?? [];
  const currentIdx = input.currentCandleIndex ?? 0;

  const recentSweeps = liquidityZones
    .filter(lz => lz.swept && (lz.sweptIndex !== undefined || lz.sweepIndex !== undefined))
    .sort((a, b) => (b.sweptIndex ?? b.sweepIndex ?? 0) - (a.sweptIndex ?? a.sweepIndex ?? 0));

  if (recentSweeps.length === 0) {
    return (
      <div className="pl-4 space-y-0.5 text-xs text-slate-400">
        <div className="flex items-start gap-1"><span className="text-slate-500">└─</span><span>Status: ⚠️ NO SWEEPS FOUND</span></div>
      </div>
    );
  }

  const latestSweep = recentSweeps[0];
  const sweepIdx = latestSweep.sweptIndex ?? latestSweep.sweepIndex ?? 0;
  const sweepAge = currentIdx - sweepIdx;
  const expectBullish = latestSweep.type === 'low';

  const mssAfterSweep = structureBreaks
    .filter(sb => (sb.type === 'mss' || sb.type === 'choch') && sb.confirmed !== false)
    .filter(sb => sb.breakIndex === undefined || sb.breakIndex > sweepIdx)
    .sort((a, b) => (b.breakIndex ?? 0) - (a.breakIndex ?? 0))[0];

  const mssDirectionMatch = mssAfterSweep
    ? (expectBullish ? mssAfterSweep.direction === 'bullish' : mssAfterSweep.direction === 'bearish')
    : false;

  const zoneScan = 0.01;
  let zoneType = 'none';
  if (mssAfterSweep && mssDirectionMatch) {
    const dir = mssAfterSweep.direction;
    if (input.orderBlocks?.some(ob => !ob.mitigated && ob.type === dir &&
        currentPrice >= ob.low * (1 - zoneScan) && currentPrice <= ob.high * (1 + zoneScan))) {
      zoneType = 'OB';
    } else if (input.fvgs?.some(fvg => !fvg.filled && fvg.type === dir &&
        currentPrice >= fvg.low * (1 - zoneScan) && currentPrice <= fvg.high * (1 + zoneScan))) {
      zoneType = 'FVG';
    } else if (input.breakers?.some(br => !br.mitigated && br.type === dir &&
        currentPrice >= br.low * (1 - zoneScan) && currentPrice <= br.high * (1 + zoneScan))) {
      zoneType = 'Breaker';
    }
  }

  const allConfirmed = !!mssAfterSweep && mssDirectionMatch && zoneType !== 'none';

  return (
    <div className="pl-4 space-y-0.5 text-xs text-slate-400">
      <div className="flex items-start gap-1"><span className="text-slate-500">├─</span><span>Sweep: {latestSweep.type === 'low' ? '⬇️ Low Sweep (expect bullish)' : '⬆️ High Sweep (expect bearish)'}</span></div>
      <div className="flex items-start gap-1"><span className="text-slate-500">├─</span><span>Sweep Age: {sweepAge} candles ago</span></div>
      <div className="flex items-start gap-1"><span className="text-slate-500">├─</span><span>MSS/CHoCH after sweep: {mssAfterSweep ? `✅ ${mssAfterSweep.direction} (dir match: ${mssDirectionMatch ? '✅' : '❌'})` : '❌ NONE'}</span></div>
      <div className="flex items-start gap-1"><span className="text-slate-500">├─</span><span>Zone Alignment: {zoneType !== 'none' ? `✅ In ${zoneType}` : '❌ Not in zone'}</span></div>
      <div className="flex items-start gap-1"><span className="text-slate-500">└─</span><span>Status: {allConfirmed ? `✅ SEQUENCE CONFIRMED (+25% boost)` : '⚠️ INCOMPLETE'}</span></div>
    </div>
  );
}

interface FVGData {
  /** lower bound of the gap */
  lower: number;
  /** upper bound of the gap */
  upper: number;
  type: 'bullish' | 'bearish';
  /** whether this FVG has been fully mitigated / filled */
  filled?: boolean;
}

interface FVGOnlySectionProps {
  /** Last close price (current price) */
  currentPrice: number;
  /** Active (unfilled) FVGs to analyse */
  fvgs: FVGData[];
}

export function FVGOnlySection({ currentPrice, fvgs }: FVGOnlySectionProps) {
  const activeFVGs = fvgs.filter(fvg => !fvg.filled);

  let nearestRow: JSX.Element;

  if (activeFVGs.length === 0) {
    nearestRow = <div className="text-slate-400 ml-3">└─ Status: ⚠️ NO ACTIVE FVGs</div>;
  } else {
    // Find nearest FVG (by distance from current price to the closest edge)
    const withDist = activeFVGs.map(fvg => {
      let status: 'inside' | 'above' | 'below';
      let dist: number;
      let nearEdge: number;

      if (currentPrice >= fvg.lower && currentPrice <= fvg.upper) {
        status = 'inside';
        dist = 0;
        nearEdge = currentPrice;
      } else if (currentPrice > fvg.upper) {
        status = 'above';
        dist = currentPrice - fvg.upper;
        nearEdge = fvg.upper;
      } else {
        status = 'below';
        dist = fvg.lower - currentPrice;
        nearEdge = fvg.lower;
      }

      const distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
      return { fvg, status, dist, distPct, nearEdge };
    });

    withDist.sort((a, b) => a.dist - b.dist);
    const n = withDist[0];

    const statusIcon =
      n.status === 'inside' ? '🟡 INSIDE FVG' :
      n.status === 'above'  ? '🟢 ABOVE FVG' :
                              '🔴 BELOW FVG';

    const distLabel =
      n.status === 'inside'
        ? 'In zone'
        : `$${n.dist.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} (${n.distPct.toFixed(2)}%)`;

    nearestRow = (
      <>
        <div className="text-slate-400 ml-3">├─ Nearest: {n.fvg.type === 'bullish' ? 'Bullish' : 'Bearish'} FVG</div>
        <div className="text-slate-400 ml-3">├─ Top: {n.fvg.upper.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
        <div className="text-slate-400 ml-3">├─ Bottom: {n.fvg.lower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</div>
        <div className="text-slate-400 ml-3">├─ Distance: {distLabel}</div>
        <div className="text-slate-400 ml-3">├─ Status: {statusIcon}</div>
        <div className="text-slate-400 ml-3">└─ Total Active: {activeFVGs.length} FVGs</div>
      </>
    );
  }

  return (
    <div className="space-y-2 text-xs px-3 py-2">
      {/* Current price row */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">📍 CURRENT PRICE</span>
        <span className="font-mono text-white">
          {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
        </span>
      </div>

      {/* Nearest FVG rows */}
      <div className="pt-1 border-t border-slate-700">
        <div className="font-semibold text-slate-300 mb-1">📊 NEAREST FVG</div>
        {nearestRow}
      </div>
    </div>
  );
}
