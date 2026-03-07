import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SystemEvaluation } from '@/types/systemScoring';
import type { ScoringInput } from '@/lib/tradingSystemScoring';

interface SMCDebugTableProps {
  evaluation: SystemEvaluation;
  scoringInput: ScoringInput;
}

export function SMCDebugTable({ evaluation, scoringInput }: SMCDebugTableProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        {/* SMC Structure Shift */}
        <ConditionDebug
          title="SMC Structure Shift"
          score={evaluation.conditions.find(c => c.id === 'structureShift')?.score ?? 0}
          details={getStructureShiftDetails(scoringInput)}
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
  details: React.ReactNode;
}

function ConditionDebug({ title, score, details }: ConditionDebugProps) {
  const scoreColor =
    score > 60 ? 'text-green-400' :
    score > 20 ? 'text-yellow-400' :
    score < -60 ? 'text-red-400' :
    score < -20 ? 'text-orange-400' :
    'text-slate-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">{title}</span>
        <span className={`font-mono ${scoreColor}`}>
          {score > 0 ? '+' : ''}{score} / 100
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
  const breakers = input.orderBlocks?.filter(ob => ob.breaker === true && ob.mitigated !== true) ?? [];

  if (breakers.length === 0) {
    return <div>└─ Status: ⚠️ NO ACTIVE BREAKERS</div>;
  }

  const nearest = breakers
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

  const candlesSinceConversion =
    input.currentCandleIndex !== undefined && nearest.ob.conversionIndex !== undefined
      ? input.currentCandleIndex - nearest.ob.conversionIndex
      : 'Unknown';

  const originalObAge =
    input.currentCandleIndex !== undefined && nearest.ob.conversionIndex !== undefined
      ? nearest.ob.conversionIndex
      : 'Unknown';

  return (
    <>
      <div>├─ Type: {nearest.ob.breakerType === 'bullish' ? 'Bullish' : 'Bearish'} Breaker (was {nearest.ob.type === 'bullish' ? 'Bullish' : 'Bearish'} OB)</div>
      <div>├─ Range: {nearest.ob.low.toFixed(4)} - {nearest.ob.high.toFixed(4)}</div>
      <div>├─ Distance: {nearest.isInside ? '0.00% (INSIDE ZONE)' : `${nearest.distPct.toFixed(2)}%`}</div>
      <div>├─ Converted: {candlesSinceConversion} candles ago{nearest.ob.conversionPrice !== undefined ? ` at ${nearest.ob.conversionPrice.toFixed(4)}` : ''}</div>
      <div>├─ Original OB age: {originalObAge} candles</div>
      <div>├─ Status: ✅ ACTIVE BREAKER</div>
      <div>└─ Total Breakers: {breakers.length}</div>
    </>
  );
}

function getStructureShiftDetails(input: ScoringInput) {
  const recentMSS = input.structureBreaks
    ?.filter(sb => sb.type === 'mss')
    .sort((a, b) => b.breakTime - a.breakTime)[0];

  if (!recentMSS) {
    return <div>└─ Status: ⚠️ NO MSS DETECTED</div>;
  }

  const age = input.currentCandleIndex !== undefined && recentMSS.breakIndex !== undefined
    ? input.currentCandleIndex - recentMSS.breakIndex
    : 'Unknown';

  return (
    <>
      <div>├─ Active MSS: {recentMSS.direction === 'bullish' ? 'Bullish MSS ↑' : 'Bearish MSS ↓'}</div>
      <div>├─ MSS Price: {recentMSS.brokenLevel?.toFixed(4) ?? 'N/A'}</div>
      <div>├─ MSS Age: {age} candles</div>
      <div>└─ Status: ✅ ACTIVE</div>
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
  const sweeps = input.structureBreaks?.filter(sb => sb.swept === true) ?? [];

  if (sweeps.length === 0) {
    return <div>└─ Status: ⚠️ NO SWEEPS DETECTED</div>;
  }

  const nearest = sweeps
    .map(sweep => {
      const dist = Math.abs(currentPrice - (sweep.brokenLevel ?? 0));
      const distPct = currentPrice > 0 ? (dist / currentPrice) * 100 : 0;
      const age = input.currentCandleIndex !== undefined && sweep.breakIndex !== undefined
        ? input.currentCandleIndex - sweep.breakIndex
        : 0;
      return { sweep, dist, distPct, age };
    })
    .sort((a, b) => a.dist - b.dist)[0];

  const isActive = nearest.distPct <= 10;

  return (
    <>
      <div>├─ Nearest: {nearest.sweep.direction === 'bullish' ? 'Low' : 'High'} swept at {nearest.sweep.brokenLevel?.toFixed(4)}</div>
      <div>├─ Distance: {nearest.distPct.toFixed(2)}% ({nearest.dist.toFixed(4)} USDT)</div>
      <div>├─ Sweep Age: {nearest.age} candles</div>
      <div>├─ Status: {isActive ? '✅ ACTIVE (within 10%)' : '❌ INVALIDATED (>10% away)'}</div>
      <div>└─ Total Sweeps: {sweeps.length}</div>
    </>
  );
}

function getDivergenceDetails(input: ScoringInput) {
  const bullishDivs = input.divergencePoints?.filter(d => d.type === 'bullish') ?? [];
  const bearishDivs = input.divergencePoints?.filter(d => d.type === 'bearish') ?? [];
  const rsiMin = input.rsiHistory && input.rsiHistory.length > 0 ? Math.min(...input.rsiHistory) : 0;
  const rsiMax = input.rsiHistory && input.rsiHistory.length > 0 ? Math.max(...input.rsiHistory) : 0;

  return (
    <>
      <div>├─ Bullish Divs: {bullishDivs.length} detected</div>
      <div>├─ Bearish Divs: {bearishDivs.length} detected</div>
      <div>├─ Lookback: {input.rsiHistory?.length ?? 0} candles</div>
      <div>├─ RSI Range: {rsiMin.toFixed(1)} - {rsiMax.toFixed(1)}</div>
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
