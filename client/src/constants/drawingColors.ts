/**
 * Single source of truth for drawing stroke / level colors.
 * Used by chart primitives (render) and edit-panel ColorPickers (preview).
 */

/** Default stroke when a drawing has no explicit style.color (matches create path). */
export const DEFAULT_DRAWING_COLOR = '#3b82f6';

/** Fib retracement level colors (TradingView-style multi-color). */
export const FIB_LEVEL_COLORS: Record<number, string> = {
  0: '#787B86',
  0.236: '#F7525F',
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#089981',
  0.786: '#9C27B0',
  1: '#787B86',
  1.272: '#3179F5',
  1.618: '#E91E63',
};

/** Trend fib extension level colors. */
export const TREND_FIB_LEVEL_COLORS: Record<number, string> = {
  0.382: '#FF9800',
  0.5: '#4CAF50',
  0.618: '#089981',
  0.786: '#9C27B0',
  1.0: '#787B86',
  1.272: '#3179F5',
  1.618: '#E91E63',
  2.0: '#F7525F',
  2.618: '#3179F5',
  3.618: '#FF9800',
  4.236: '#9C27B0',
};

/**
 * Channel internal level (25/50/75%) default — matches FreeDrawRenderer/Channel renderer.
 * Solid hex for picker swatch; renderer may use rgba for stroke.
 */
export const CHANNEL_INTERNAL_LEVEL_COLOR = 'rgba(255, 255, 255, 0.5)';
/** Solid stand-in for ColorPicker swatch when default is translucent white. */
export const CHANNEL_INTERNAL_LEVEL_SWATCH = '#ffffff';

export const CHANNEL_BOUNDARY_TOP_COLOR = '#ef4444';
export const CHANNEL_BOUNDARY_BOTTOM_COLOR = '#22c55e';

export const ELLIOTT_IMPULSE_COLOR = '#00CED1';
export const ELLIOTT_ZIGZAG_COLOR = '#808080';

export const DEFAULT_LABEL_COLOR = '#ffffff';

type StyleLike = {
  color?: string;
  levelColors?: Record<number | string, string>;
  boundaryColors?: Record<string, string>;
  impulseColor?: string;
  zigzagColor?: string;
  labelColor?: string;
  autoColor?: boolean;
};

function roundLevelKey(level: number): number {
  return Math.round(level * 10000) / 10000;
}

/** True for pure white / near-white placeholders from the old settings bug. */
export function isPlaceholderWhite(color: string | undefined | null): boolean {
  if (!color || typeof color !== 'string') return true;
  const c = color.trim().toLowerCase();
  if (!c || c === 'transparent' || c === 'none') return true;
  if (c === '#fff' || c === '#ffffff' || c === 'white' || c === 'rgb(255,255,255)') return true;
  if (c === 'rgba(255,255,255,1)' || c === 'rgba(255, 255, 255, 1)') return true;
  // #ffffffff
  if (/^#ffffff$/i.test(c) || /^#fff$/i.test(c)) return true;
  return false;
}

/**
 * Look up a level color map with number / string / float-fuzzy keys
 * (JSON persistence often stores keys as strings).
 */
export function lookupLevelColor(
  levelColors: Record<number | string, string> | undefined | null,
  level: number,
): string | undefined {
  if (!levelColors || typeof levelColors !== 'object') return undefined;

  const key = roundLevelKey(level);
  const candidates: Array<string | number> = [
    level,
    key,
    String(level),
    String(key),
    key.toFixed(3),
    key.toFixed(4),
    // percentage forms sometimes saved historically
    key * 100,
    String(key * 100),
    Math.round(key * 1000) / 10, // 61.8
  ];

  for (const c of candidates) {
    const v = (levelColors as any)[c];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }

  for (const [k, v] of Object.entries(levelColors)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const n = parseFloat(k);
    if (!Number.isFinite(n)) continue;
    // ratio match (0.618) or percent match (61.8)
    if (Math.abs(n - key) < 1e-6 || Math.abs(n / 100 - key) < 1e-6) {
      return v.trim();
    }
  }
  return undefined;
}

/**
 * Old edit-panel bug wrote every level as #ffffff into style.levelColors while the
 * chart still painted multi-color defaults. Detect that so we ignore the map.
 */
export function isBogusAllWhiteLevelColors(
  levelColors: Record<number | string, string> | undefined | null,
): boolean {
  if (!levelColors || typeof levelColors !== 'object') return false;
  const values = Object.values(levelColors).filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  if (values.length === 0) return false;
  // If every stored color is pure white, treat as "never customized"
  return values.every((v) => isPlaceholderWhite(v));
}

function paletteColor(
  map: Record<number, string>,
  level: number,
): string | undefined {
  const key = roundLevelKey(level);
  return map[level] ?? map[key] ?? lookupLevelColor(map as any, level);
}

/** Resolve main drawing stroke color for settings / create fallback. */
export function resolveDrawingColor(style?: StyleLike | null): string {
  const c = style?.color;
  if (typeof c === 'string' && c.length > 0 && !isPlaceholderWhite(c)) return c;
  if (typeof c === 'string' && c.length > 0) return c; // allow intentional white stroke
  return DEFAULT_DRAWING_COLOR;
}

/** Resolve fib retracement level color (settings + renderer). */
export function resolveFibLevelColor(
  level: number,
  style?: StyleLike | null,
): string {
  const map = style?.levelColors;
  if (map && !isBogusAllWhiteLevelColors(map)) {
    const fromStyle = lookupLevelColor(map, level);
    // Only honor non-placeholder overrides; white placeholder → fall through to palette
    if (fromStyle && !isPlaceholderWhite(fromStyle)) return fromStyle;
    // Intentional white: user set white on a single level while others are non-white
    if (fromStyle && isPlaceholderWhite(fromStyle)) {
      // If this is a real per-level override (map not all-white), keep white
      return fromStyle;
    }
  }

  return (
    paletteColor(FIB_LEVEL_COLORS, level) ??
    resolveDrawingColor(style)
  );
}

/** Resolve trend-fib level color. */
export function resolveTrendFibLevelColor(
  level: number,
  style?: StyleLike | null,
): string {
  const map = style?.levelColors;
  if (map && !isBogusAllWhiteLevelColors(map)) {
    const fromStyle = lookupLevelColor(map, level);
    if (fromStyle && !isPlaceholderWhite(fromStyle)) return fromStyle;
    if (fromStyle && isPlaceholderWhite(fromStyle)) return fromStyle;
  }

  return (
    paletteColor(TREND_FIB_LEVEL_COLORS, level) ??
    resolveDrawingColor(style)
  );
}

/** Resolve channel internal level color for stroke (translucent white default). */
export function resolveChannelLevelColor(
  level: number,
  style?: StyleLike | null,
): string {
  const fromStyle = lookupLevelColor(style?.levelColors, level);
  if (fromStyle && !isBogusAllWhiteLevelColors(style?.levelColors)) return fromStyle;
  return CHANNEL_INTERNAL_LEVEL_COLOR;
}

/** Swatch-friendly channel internal color (opaque white when default). */
export function resolveChannelLevelSwatch(
  level: number,
  style?: StyleLike | null,
): string {
  const fromStyle = lookupLevelColor(style?.levelColors, level);
  if (fromStyle && !isBogusAllWhiteLevelColors(style?.levelColors)) {
    if (fromStyle.includes('255, 255, 255') || fromStyle === CHANNEL_INTERNAL_LEVEL_COLOR) {
      return CHANNEL_INTERNAL_LEVEL_SWATCH;
    }
    return fromStyle;
  }
  return CHANNEL_INTERNAL_LEVEL_SWATCH;
}

export function resolveChannelBoundaryColor(
  side: 'top' | 'bottom',
  style?: StyleLike | null,
): string {
  const fromStyle = style?.boundaryColors?.[side];
  if (fromStyle) return fromStyle;
  if (style?.autoColor !== false) {
    return side === 'top' ? CHANNEL_BOUNDARY_TOP_COLOR : CHANNEL_BOUNDARY_BOTTOM_COLOR;
  }
  return resolveDrawingColor(style);
}

export function resolveElliottImpulseColor(style?: StyleLike | null): string {
  return style?.impulseColor ?? style?.color ?? ELLIOTT_IMPULSE_COLOR;
}

export function resolveElliottZigzagColor(style?: StyleLike | null): string {
  return style?.zigzagColor ?? ELLIOTT_ZIGZAG_COLOR;
}

export function resolveLabelColor(style?: StyleLike | null): string {
  return style?.labelColor ?? DEFAULT_LABEL_COLOR;
}

/**
 * Strip all-white levelColors maps on load so settings + chart stay multi-color.
 * Returns a shallow-cloned style when cleaned.
 */
export function sanitizeDrawingStyleColors<T extends StyleLike | null | undefined>(
  style: T,
): T {
  if (!style || typeof style !== 'object') return style;
  if (!isBogusAllWhiteLevelColors(style.levelColors)) return style;
  const { levelColors: _drop, ...rest } = style as StyleLike;
  return { ...rest } as T;
}
