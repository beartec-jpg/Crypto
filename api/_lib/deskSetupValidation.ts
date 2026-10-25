/**
 * Desk (BTC/XRP Discord) setup validation — all prices recomputed in code.
 *
 * Rules (Scott, 25 Oct 2026):
 *  - Stop must sit just beyond a REAL computed swing: below a swing low for LONG,
 *    above a swing high for SHORT. No ATR / percent-based stops and no minimum
 *    distance — tight is fine if it is structurally valid.
 *  - If the model's stop doesn't match a swing (within a tiny tolerance), re-anchor
 *    to the nearest qualifying swing beyond entry; otherwise reject.
 *  - RR is recomputed from entry / structural stop / TP1 (model RR ignored).
 *  - Entry-distance cap: entry must be within ENTRY_CAP_DAILY_ATR × daily ATR of the
 *    live price (this is about entry reach, not stop placement).
 *  - Grade comes from measured confluence + stop quality, not the model.
 *  - Max one idea per symbol per run; never both directions.
 */

export type Direction = 'LONG' | 'SHORT';

export interface SwingLevels {
  highs: number[];
  lows: number[];
}

export interface DeskValidationContext {
  currentPrice: number;
  /** Daily ATR(14) — only used for the entry-distance cap. */
  dailyAtr: number;
  /** Computed swing levels from the planning timeframe(s). */
  swings: SwingLevels;
  minRiskReward: number;
  /** Other structural prices (OB/FVG edges, fib OTE bounds, EMAs) for confluence measurement. */
  structuralLevels?: number[];
  fibOte?: { low: number; high: number } | null;
  emas?: number[];
  dominantBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  /** Fractional tolerance for "stop matches swing" (default 0.1% of swing price). */
  stopTolerance?: number;
  /** Fractional buffer placed beyond the swing when re-anchoring (default 0.05%). */
  stopBuffer?: number;
  /** Entry cap in daily ATRs (default 1.25). */
  entryCapDailyAtr?: number;
}

export interface ValidatedSetup {
  ok: boolean;
  reason?: string;
  direction?: Direction;
  entry?: number;
  stopLoss?: number;
  tp1?: number;
  stopAnchor?: number;
  stopSource?: 'model' | 're-anchored';
  riskRewardRatio?: number;
  measuredConfluence?: number;
  confluenceNotes?: string[];
  grade?: 'A' | 'B' | 'C';
  score?: number;
}

export const DEFAULT_STOP_TOLERANCE = 0.001;
export const DEFAULT_STOP_BUFFER = 0.0005;
export const DEFAULT_ENTRY_CAP_DAILY_ATR = 1.25;

export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Fractal swing pivots (lookback bars either side), keeping the last `keep` of each. */
export function detectSwingLevels(
  bars: Array<{ high: number; low: number }>,
  lookback = 5,
  keep = 12,
): SwingLevels {
  const recent = bars.slice(-200);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = lookback; i < recent.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (recent[j].high > recent[i].high) isHigh = false;
      if (recent[j].low < recent[i].low) isLow = false;
    }
    if (isHigh) highs.push(recent[i].high);
    if (isLow) lows.push(recent[i].low);
  }
  return { highs: highs.slice(-keep), lows: lows.slice(-keep) };
}

export function mergeSwings(...sets: Array<SwingLevels | null | undefined>): SwingLevels {
  const highs = new Set<number>();
  const lows = new Set<number>();
  for (const s of sets) {
    s?.highs.forEach((h) => Number.isFinite(h) && h > 0 && highs.add(h));
    s?.lows.forEach((l) => Number.isFinite(l) && l > 0 && lows.add(l));
  }
  return { highs: [...highs], lows: [...lows] };
}

/**
 * Validate / re-anchor a stop to a structural swing.
 * LONG: swing low L < entry; valid stop is in [L*(1-tol-buffer), L]. Re-anchor uses the nearest
 * swing low below entry (highest L < entry) minus the buffer.
 * SHORT mirrors with swing highs.
 */
export function anchorStructuralStop(
  direction: Direction,
  entry: number,
  modelStop: number,
  swings: SwingLevels,
  tol = DEFAULT_STOP_TOLERANCE,
  buffer = DEFAULT_STOP_BUFFER,
): { ok: true; stop: number; anchor: number; source: 'model' | 're-anchored' } | { ok: false; reason: string } {
  if (!(entry > 0)) return { ok: false, reason: 'invalid entry' };
  if (direction === 'LONG') {
    const below = swings.lows.filter((l) => l < entry).sort((a, b) => b - a);
    if (!below.length) return { ok: false, reason: 'no swing low below entry' };
    if (modelStop > 0 && modelStop < entry) {
      const match = below.find((l) => modelStop <= l && modelStop >= l * (1 - tol - buffer));
      if (match != null) return { ok: true, stop: modelStop, anchor: match, source: 'model' };
    }
    const anchor = below[0];
    return { ok: true, stop: roundLike(anchor * (1 - buffer), anchor), anchor, source: 're-anchored' };
  }
  const above = swings.highs.filter((h) => h > entry).sort((a, b) => a - b);
  if (!above.length) return { ok: false, reason: 'no swing high above entry' };
  if (modelStop > entry) {
    const match = above.find((h) => modelStop >= h && modelStop <= h * (1 + tol + buffer));
    if (match != null) return { ok: true, stop: modelStop, anchor: match, source: 'model' };
  }
  const anchor = above[0];
  return { ok: true, stop: roundLike(anchor * (1 + buffer), anchor), anchor, source: 're-anchored' };
}

function roundLike(v: number, ref: number): number {
  const decimals = ref >= 1000 ? 2 : ref >= 1 ? 4 : 6;
  return parseFloat(v.toFixed(decimals));
}

export function computeRiskReward(direction: Direction, entry: number, stop: number, tp1: number): number {
  const risk = direction === 'LONG' ? entry - stop : stop - entry;
  const reward = direction === 'LONG' ? tp1 - entry : entry - tp1;
  if (!(risk > 0) || !(reward > 0)) return 0;
  return reward / risk;
}

export function entryWithinCap(entry: number, currentPrice: number, dailyAtr: number, capAtr = DEFAULT_ENTRY_CAP_DAILY_ATR): boolean {
  if (!(dailyAtr > 0) || !(currentPrice > 0)) return true; // no ATR → cannot cap; don't block
  return Math.abs(entry - currentPrice) <= capAtr * dailyAtr;
}

export function measureConfluence(
  direction: Direction,
  entry: number,
  ctx: Pick<DeskValidationContext, 'structuralLevels' | 'fibOte' | 'emas' | 'dominantBias' | 'swings'>,
  rr: number,
): { count: number; notes: string[] } {
  const notes: string[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.003;
  if ((ctx.structuralLevels || []).some((l) => near(entry, l))) notes.push('entry at OB/FVG edge');
  if ([...ctx.swings.highs, ...ctx.swings.lows].some((l) => near(entry, l))) notes.push('entry at swing pivot');
  if (ctx.fibOte && entry >= ctx.fibOte.low && entry <= ctx.fibOte.high) notes.push('entry in fib OTE');
  if ((ctx.emas || []).some((e) => e > 0 && near(entry, e))) notes.push('EMA confluence');
  if (
    (ctx.dominantBias === 'BULLISH' && direction === 'LONG') ||
    (ctx.dominantBias === 'BEARISH' && direction === 'SHORT')
  ) notes.push('with HTF bias');
  if (rr >= 2.5) notes.push('RR ≥ 2.5');
  return { count: notes.length, notes };
}

export function gradeSetup(measuredConfluence: number, stopSource: 'model' | 're-anchored', rr: number): 'A' | 'B' | 'C' {
  if (measuredConfluence >= 4 && stopSource === 'model' && rr >= 2) return 'A';
  if (measuredConfluence >= 2 && rr >= 1.5) return 'B';
  return 'C';
}

export function validateDeskSetup(trade: any, ctx: DeskValidationContext): ValidatedSetup {
  const dirRaw = String(trade?.direction || '').toUpperCase();
  if (dirRaw !== 'LONG' && dirRaw !== 'SHORT') return { ok: false, reason: 'bad direction' };
  const direction = dirRaw as Direction;
  const entry = parsePrice(trade.entry);
  const modelStop = parsePrice(trade.stopLoss);
  const targets = Array.isArray(trade.targets) ? trade.targets : [];
  const tp1 = parsePrice(targets[0]);
  if (!(entry > 0) || !(tp1 > 0)) return { ok: false, reason: 'missing entry/TP1' };
  if (direction === 'LONG' ? tp1 <= entry : tp1 >= entry) return { ok: false, reason: 'TP1 on wrong side of entry' };

  const cap = ctx.entryCapDailyAtr ?? DEFAULT_ENTRY_CAP_DAILY_ATR;
  if (!entryWithinCap(entry, ctx.currentPrice, ctx.dailyAtr, cap)) {
    return { ok: false, reason: `entry more than ${cap}× daily ATR from price` };
  }

  const anchored = anchorStructuralStop(direction, entry, modelStop, ctx.swings, ctx.stopTolerance, ctx.stopBuffer);
  if (!anchored.ok) return { ok: false, reason: anchored.reason };

  const rr = computeRiskReward(direction, entry, anchored.stop, tp1);
  if (rr < ctx.minRiskReward) {
    return { ok: false, reason: `computed RR ${rr.toFixed(2)} < ${ctx.minRiskReward}`, riskRewardRatio: rr };
  }
  const { count, notes } = measureConfluence(direction, entry, ctx, rr);
  const grade = gradeSetup(count, anchored.source, rr);
  const score = count * 10 + Math.min(rr, 5) * 2 + (anchored.source === 'model' ? 3 : 0);
  return {
    ok: true,
    direction,
    entry,
    stopLoss: anchored.stop,
    tp1,
    stopAnchor: anchored.anchor,
    stopSource: anchored.source,
    riskRewardRatio: parseFloat(rr.toFixed(2)),
    measuredConfluence: count,
    confluenceNotes: notes,
    grade,
    score,
  };
}

export type Trend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/**
 * Trend from structure, computed in code (not the model):
 *  - HTF break balance: up-breaks (BOS) vs down-breaks (CHoCH counter) over recent bars
 *  - HTF swing sequence: HH+HL bullish, LH+LL bearish
 *  - EMA alignment: price > EMA20 > EMA50 bullish, reverse bearish
 * Score ≥ 2 → BULLISH, ≤ −2 → BEARISH, else NEUTRAL.
 */
export function computeDeskTrend(input: {
  upBreaks: number;
  downBreaks: number;
  htfSwings?: SwingLevels;
  price: number;
  ema20: number;
  ema50: number;
}): { trend: Trend; score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  if (input.upBreaks > input.downBreaks) { score += 1; notes.push('HTF BOS up-breaks dominate'); }
  else if (input.downBreaks > input.upBreaks) { score -= 1; notes.push('HTF down-breaks dominate'); }
  const hs = input.htfSwings?.highs || [];
  const ls = input.htfSwings?.lows || [];
  if (hs.length >= 2 && ls.length >= 2) {
    const hh = hs[hs.length - 1] > hs[hs.length - 2];
    const hl = ls[ls.length - 1] > ls[ls.length - 2];
    if (hh && hl) { score += 1; notes.push('HTF HH/HL'); }
    else if (!hh && !hl) { score -= 1; notes.push('HTF LH/LL'); }
  }
  const { price, ema20, ema50 } = input;
  if (price > ema20 && ema20 > ema50) { score += 1; notes.push('EMA bull alignment'); }
  else if (price < ema20 && ema20 < ema50) { score -= 1; notes.push('EMA bear alignment'); }
  return { trend: score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'NEUTRAL', score, notes };
}

export function roleFor(direction: string, trend: Trend): 'with-trend' | 'counter-trend' {
  const d = String(direction).toUpperCase();
  return (trend === 'BULLISH' && d === 'LONG') || (trend === 'BEARISH' && d === 'SHORT') ? 'with-trend' : 'counter-trend';
}

function downgrade(g: 'A' | 'B' | 'C'): 'A' | 'B' | 'C' {
  return g === 'A' ? 'B' : 'C';
}

/**
 * Validate model trades and pick per symbol: at most 1 with-trend + at most 1 counter-trend.
 *  - Counter-trend needs measured confluence ≥ minConfluence + 1, is graded one step lower,
 *    scored lower, labelled 'Counter-trend', confidence low, suggested size 0.5×, listed second.
 *  - NEUTRAL trend: everything is counter-trend; if both directions survive it's a contradiction → all blocked.
 */
export function selectDeskSetups(
  trades: any[],
  ctx: DeskValidationContext & { trend?: Trend; minConfluence?: number },
): { kept: any[]; rejected: Array<{ trade: any; reason: string }> } {
  const trend: Trend = ctx.trend || 'NEUTRAL';
  const minConf = Number.isFinite(ctx.minConfluence) ? Number(ctx.minConfluence) : 2;
  const rejected: Array<{ trade: any; reason: string }> = [];
  const valid: Array<{ trade: any; v: ValidatedSetup; role: 'with-trend' | 'counter-trend' }> = [];
  for (const t of trades || []) {
    const v = validateDeskSetup(t, ctx);
    if (!v.ok) { rejected.push({ trade: t, reason: v.reason || 'invalid' }); continue; }
    const role = roleFor(v.direction!, trend);
    const need = role === 'counter-trend' ? minConf + 1 : minConf;
    if ((v.measuredConfluence || 0) < need) {
      rejected.push({ trade: t, reason: `${role} needs measured confluence ≥ ${need} (has ${v.measuredConfluence})` });
      continue;
    }
    if (role === 'counter-trend') {
      v.grade = downgrade(v.grade!);
      v.score = (v.score || 0) - 15;
    }
    valid.push({ trade: t, v, role });
  }
  valid.sort((a, b) => (b.v.score || 0) - (a.v.score || 0));

  if (trend === 'NEUTRAL') {
    const dirs = new Set(valid.map((x) => x.v.direction));
    if (dirs.size > 1) {
      for (const x of valid) rejected.push({ trade: x.trade, reason: 'contradiction: both directions with no clear trend' });
      return { kept: [], rejected };
    }
  }
  const withTrend = valid.filter((x) => x.role === 'with-trend');
  const counter = valid.filter((x) => x.role === 'counter-trend');
  const picks = [withTrend[0], counter[0]].filter(Boolean) as typeof valid;
  for (const x of [...withTrend.slice(1), ...counter.slice(1)]) {
    rejected.push({ trade: x.trade, reason: `max 1 ${x.role} idea per symbol` });
  }
  return { kept: picks.map((x) => finalise(x.trade, x.v, x.role)), rejected };
}

function finalise(trade: any, v: ValidatedSetup, role: 'with-trend' | 'counter-trend'): any {
  const counter = role === 'counter-trend';
  return {
    ...trade,
    direction: v.direction,
    entry: v.entry,
    stopLoss: v.stopLoss,
    targets: Array.isArray(trade.targets) ? [...trade.targets] : [],
    riskRewardRatio: v.riskRewardRatio,
    grade: v.grade,
    score: v.score,
    htfRelationship: role,
    label: counter ? 'Counter-trend' : 'With-trend',
    confidence: counter ? 'low' : v.grade === 'A' ? 'high' : 'medium',
    suggestedSize: counter ? 0.5 : 1,
    modelGrade: trade.grade ?? null,
    modelRiskRewardRatio: trade.riskRewardRatio ?? null,
    confluenceCount: v.measuredConfluence,
    measuredConfluence: v.confluenceNotes,
    stopAnchor: v.stopAnchor,
    stopSource: v.stopSource,
    slRationale:
      v.stopSource === 're-anchored'
        ? `Re-anchored beyond computed swing ${direction2Side(v.direction!)} ${v.stopAnchor}` +
          (trade.slRationale ? ` (model: ${trade.slRationale})` : '')
        : trade.slRationale,
  };
}

function direction2Side(d: Direction): string {
  return d === 'LONG' ? 'low' : 'high';
}

/** Numbers inside zone description strings like "$1.2-$1.3 origin $1.1 | ...". */
export function extractPrices(text: string | null | undefined): number[] {
  if (!text) return [];
  return (String(text).match(/\$?\d+(?:\.\d+)?/g) || [])
    .map((s) => parseFloat(s.replace('$', '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Open-book plan for one symbol (no fixed expiry).
 * Ideas stay open until the tracker closes them (stop / TP / entry invalidation) or the desk
 * review cancels them with a recorded reason (structural invalidation).
 *  - Surviving open ideas are CARRIED (restated "still valid, same entry/stop/targets").
 *  - New ideas are only added into a free slot: at most one idea per direction; both directions
 *    only when the trend is clear (one with-trend + one counter-trend). An idea in the same
 *    direction as an open one is not added (the open one is carried instead).
 *  - With NEUTRAL trend, an idea opposite to an open one is a contradiction → blocked.
 */
export function planDeskBook(
  openTrades: any[],
  reviews: Array<{ id: string; action: 'keep' | 'cancel'; reason?: string }>,
  newTrades: any[],
  trend: Trend = 'NEUTRAL',
): {
  carried: any[];
  cancelled: Array<{ trade: any; reason: string }>;
  newTrades: any[];
  blocked: Array<{ trade: any; reason: string }>;
} {
  const byId = new Map((reviews || []).map((r) => [String(r.id), r]));
  const carried: any[] = [];
  const cancelled: Array<{ trade: any; reason: string }> = [];
  for (const t of openTrades || []) {
    const r = byId.get(String(t.id));
    if (r?.action === 'cancel') cancelled.push({ trade: t, reason: r.reason || 'structural invalidation' });
    else carried.push(t);
  }
  const dirs = new Set(carried.map((t) => String(t.direction || '').toUpperCase()));
  const blocked: Array<{ trade: any; reason: string }> = [];
  const added: any[] = [];
  const ordered = [...(newTrades || [])].sort(
    (a, b) => (roleFor(a.direction, trend) === 'with-trend' ? 0 : 1) - (roleFor(b.direction, trend) === 'with-trend' ? 0 : 1),
  );
  for (const t of ordered) {
    const d = String(t.direction || '').toUpperCase();
    if (dirs.has(d)) {
      blocked.push({ trade: t, reason: carried.some((c) => String(c.direction).toUpperCase() === d)
        ? 'open idea in same direction still valid (carried instead)'
        : `max 1 ${roleFor(d, trend)} idea per symbol` });
      continue;
    }
    if (dirs.size && trend === 'NEUTRAL') {
      blocked.push({ trade: t, reason: 'contradiction: opposite direction with no clear trend' });
      continue;
    }
    dirs.add(d);
    added.push({ ...t, htfRelationship: roleFor(d, trend), label: roleFor(d, trend) === 'with-trend' ? 'With-trend' : 'Counter-trend' });
  }
  return { carried, cancelled, newTrades: added, blocked };
}
