// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
/**
 * Deep-dive setup status: "active" (price is in the entry zone now) vs
 * "pending" (limit/conditional plan at an unmitigated zone not reached yet).
 * Status is derived from live price where possible so a model claim of
 * "active" for a far-away zone can never be shown as live.
 */
export type DeepDiveSetupStatus = 'active' | 'pending';

export const DEEP_DIVE_SETUP_STATUS_RULES = `SCENARIO STATUS (MANDATORY on every scenario):
   - "setupStatus": "active" only if current price is inside the trigger zone now. Otherwise "pending": a conditional scenario at an unmitigated zone price has not reached yet ("if price comes to X, a bullish/bearish scenario would become active").
   - Price does NOT need to be tagging a zone right now. If no zone is being tagged, still return the best pending scenarios at the nearest unmitigated zones (above and below) that clear the distance-ratio and confluence rules, reachable within the horizon.
   - Every scenario, active or pending, needs entryZone (trigger zone), entry (trigger level), stopLoss (invalidation level), targets (reference levels), confluenceSignals, triggerCondition (what activates it) and "invalidation" (what cancels it before it triggers, with a price).
   - Only return an empty bestTrades array if no scenario (active or pending) clears the distance-ratio and confluence rules.`;

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse "1.0800-1.0850 demand FVG" style zone text into [low, high]. */
export function parseZoneRange(text: unknown): [number, number] | null {
  if (typeof text !== 'string') return null;
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\$?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

export function classifySetupStatus(
  trade: any,
  currentPrice: number,
  atr = 0,
): DeepDiveSetupStatus {
  const price = num(currentPrice);
  const entry = num(trade?.entry);
  if (!price || price <= 0) {
    // Cannot verify price: never claim active.
    return 'pending';
  }
  const zone = parseZoneRange(trade?.entryZone) || parseZoneRange(trade?.triggerZone);
  if (zone) {
    return price >= zone[0] && price <= zone[1] ? 'active' : 'pending';
  }
  if (!entry) return 'pending';
  // No parseable zone: treat as in-zone only within a tight band of entry.
  const tol = Math.max(price * 0.0015, (Number(atr) || 0) * 0.25);
  return Math.abs(price - entry) <= tol ? 'active' : 'pending';
}

export function distanceFromPrice(
  trade: any,
  currentPrice: number,
): { price: number; percent: number } | null {
  const price = num(currentPrice);
  const entry = num(trade?.entry);
  if (!price || price <= 0 || !entry) return null;
  const d = entry - price;
  return {
    price: parseFloat(d.toPrecision(6)),
    percent: parseFloat(((d / price) * 100).toFixed(2)),
  };
}

/** Annotate gated trades with setupStatus + distanceFromPrice (+invalidation fallback). */
export function annotateSetupStatus<T extends Record<string, any>>(
  trades: T[],
  currentPrice: number,
  atr = 0,
): Array<T & { setupStatus: DeepDiveSetupStatus; distanceFromPrice: { price: number; percent: number } | null; invalidation?: string }> {
  return trades.map((t) => ({
    ...t,
    setupStatus: classifySetupStatus(t, currentPrice, atr),
    distanceFromPrice: distanceFromPrice(t, currentPrice),
    invalidation: t.invalidation ?? (t.stopLoss != null ? `Close through stop ${t.stopLoss}` : undefined),
  }));
}
