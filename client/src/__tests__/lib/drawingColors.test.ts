import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DRAWING_COLOR,
  FIB_LEVEL_COLORS,
  resolveDrawingColor,
  resolveFibLevelColor,
  resolveTrendFibLevelColor,
  resolveChannelLevelColor,
  resolveChannelLevelSwatch,
  CHANNEL_INTERNAL_LEVEL_COLOR,
  CHANNEL_INTERNAL_LEVEL_SWATCH,
  isBogusAllWhiteLevelColors,
  sanitizeDrawingStyleColors,
} from '@/constants/drawingColors';

describe('drawingColors resolvers', () => {
  it('resolveDrawingColor falls back to default blue', () => {
    expect(resolveDrawingColor(undefined)).toBe(DEFAULT_DRAWING_COLOR);
    expect(resolveDrawingColor({})).toBe(DEFAULT_DRAWING_COLOR);
    expect(resolveDrawingColor({ color: '#ef4444' })).toBe('#ef4444');
  });

  it('resolveFibLevelColor uses palette when levelColors empty', () => {
    expect(resolveFibLevelColor(0.618, {})).toBe(FIB_LEVEL_COLORS[0.618]);
    expect(resolveFibLevelColor(0.5, {})).toBe(FIB_LEVEL_COLORS[0.5]);
    // Not white
    expect(resolveFibLevelColor(0.618, {})).not.toBe('#ffffff');
  });

  it('resolveFibLevelColor prefers style.levelColors', () => {
    expect(
      resolveFibLevelColor(0.618, { levelColors: { 0.618: '#aabbcc' } }),
    ).toBe('#aabbcc');
  });

  it('resolveFibLevelColor ignores all-white levelColors maps (old bug)', () => {
    const bad = {
      levelColors: {
        0: '#ffffff',
        0.236: '#FFFFFF',
        0.5: '#fff',
        0.618: 'white',
      },
    };
    expect(isBogusAllWhiteLevelColors(bad.levelColors)).toBe(true);
    expect(resolveFibLevelColor(0.618, bad)).toBe(FIB_LEVEL_COLORS[0.618]);
    expect(resolveFibLevelColor(0.5, bad)).toBe(FIB_LEVEL_COLORS[0.5]);
  });

  it('resolveFibLevelColor finds string keys from JSON', () => {
    expect(
      resolveFibLevelColor(0.618, { levelColors: { '0.618': '#112233' } }),
    ).toBe('#112233');
  });

  it('sanitizeDrawingStyleColors strips all-white maps', () => {
    const cleaned = sanitizeDrawingStyleColors({
      color: '#3b82f6',
      levelColors: { 0.5: '#ffffff', 0.618: '#ffffff' },
    });
    expect(cleaned.levelColors).toBeUndefined();
    expect(cleaned.color).toBe('#3b82f6');
  });

  it('resolveTrendFibLevelColor uses trend palette', () => {
    const c = resolveTrendFibLevelColor(1.618, {});
    expect(c).toBeTruthy();
    expect(c).not.toBe('#ffffff');
  });

  it('resolveChannelLevelColor defaults to translucent white', () => {
    expect(resolveChannelLevelColor(0.5, {})).toBe(CHANNEL_INTERNAL_LEVEL_COLOR);
    expect(resolveChannelLevelSwatch(0.5, {})).toBe(CHANNEL_INTERNAL_LEVEL_SWATCH);
  });
});
