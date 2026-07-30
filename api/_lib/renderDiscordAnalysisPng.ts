/**
 * Server-side "total analysis" PNG for Discord (pre-London desk).
 * Pure-JS canvas — no native deps.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { decodePngRgba, SimpleCanvas, type Rgba } from './simplePng.js';

export type DiscordTradeIdea = {
  direction?: string;
  grade?: string;
  htfRelationship?: string;
  entry?: string | number;
  stopLoss?: string | number;
  targets?: Array<string | number>;
  riskRewardRatio?: number;
  triggerZone?: string;
  triggerCondition?: string;
  entryZone?: string;
  reasoning?: string;
  slRationale?: string;
};

export type DiscordAnalysisSection = {
  summary?: string;
  bias?: string;
  keyLevels?: string[];
};

export type DiscordRenderInput = {
  symbol: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  sessionLabel?: string;
  modeLabel?: string;
  horizonLabel?: string;
  crossSummary?: string;
  deepSummary?: string;
  higher?: DiscordAnalysisSection | null;
  lower?: DiscordAnalysisSection | null;
  watchLevels?: string[];
  trades?: DiscordTradeIdea[];
};

const BG: Rgba = [11, 18, 32, 255];
const CARD: Rgba = [18, 26, 43, 255];
const PANEL: Rgba = [15, 23, 42, 255];
const MUTED: Rgba = [148, 163, 184, 255];
const TEXT: Rgba = [226, 232, 240, 255];
const ACCENT: Rgba = [168, 85, 247, 255];
const GREEN: Rgba = [34, 197, 94, 255];
const RED: Rgba = [239, 68, 68, 255];
const BORDER: Rgba = [30, 41, 59, 255];

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '-';
  return String(v);
}

function loadLogoRgba(): { width: number; height: number; data: Uint8Array } | null {
  const candidates = [
    // Bundled next to serverless helpers (vercel includeFiles: api/_lib/**)
    join(process.cwd(), 'api/_lib/assets/beartec-logo.png'),
    join(process.cwd(), 'client/public/beartec-logo.png'),
    join(process.cwd(), 'public/beartec-logo.png'),
    join(process.cwd(), 'dist/beartec-logo.png'),
    join(process.cwd(), 'beartec-logo.png'),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const decoded = decodePngRgba(readFileSync(path));
      if (decoded) return decoded;
    } catch {
      // try next
    }
  }
  return null;
}

export function renderDiscordAnalysisPng(input: DiscordRenderInput): Buffer {
  const width = 1000;
  // Estimate height, then draw
  const trades = (input.trades || []).slice(0, 2);
  const watch = (input.watchLevels || []).slice(0, 6);
  let height = 80; // title
  height += 40; // badges
  height += 36 + 90; // cross
  height += 36 + 80; // deep
  if (watch.length) height += 28 + watch.length * 20;
  height += 36; // trades title
  height += trades.length === 0 ? 50 : trades.length * 130;
  height += 50; // footer
  height = Math.max(height, 720);

  const c = new SimpleCanvas(width, height);
  c.fill(BG);

  // Card
  c.fillRect(16, 16, width - 32, height - 32, CARD);
  c.fillRect(16, 16, 8, height - 32, ACCENT);

  // Watermark logo (behind content)
  const logo = loadLogoRgba();
  if (logo) {
    const maxW = width * 0.5;
    const scale = maxW / logo.width;
    const dw = Math.floor(logo.width * scale);
    const dh = Math.floor(logo.height * scale);
    c.drawImageRgba(logo.data, logo.width, logo.height, (width - dw) / 2, (height - dh) / 2, dw, dh, 0.1);
  } else {
    c.drawText('BearTec', width / 2 - 80, height / 2 - 20, [148, 163, 184, 28], 4);
  }

  let y = 40;
  const pad = 40;
  const contentW = width - pad * 2;

  // Title
  c.drawText(`${input.symbol}  TOTAL ANALYSIS`, pad, y, TEXT, 3);
  y += 36;
  c.drawText(input.sessionLabel || 'Pre-London open', pad, y, MUTED, 2);
  y += 28;

  // Badges row
  const badges = [
    `${input.higherTimeframe}/${input.lowerTimeframe}`,
    input.horizonLabel || 'Horizon',
    input.modeLabel || 'Mode',
    trades.length ? `${trades.length} setup(s)` : 'No setup',
  ].filter(Boolean);
  let bx = pad;
  for (const badge of badges) {
    const bw = badge.length * 12 + 16;
    c.fillRect(bx, y, bw, 24, PANEL);
    c.drawText(badge.toUpperCase(), bx + 8, y + 6, MUTED, 1);
    bx += bw + 10;
  }
  y += 40;

  // Cross-TF
  c.drawText('CROSS-TIMEFRAME', pad, y, ACCENT, 2);
  y += 22;
  y = c.drawWrappedText(input.crossSummary || 'No general summary cached yet.', pad, y, contentW, TEXT, 2, 18);
  y += 8;
  if (input.higher?.summary || input.lower?.summary) {
    const half = Math.floor((contentW - 16) / 2);
    const leftY0 = y;
    let ly = y;
    c.drawText(
      `${(input.higherTimeframe || 'HTF').toUpperCase()} ${input.higher?.bias || ''}`.trim(),
      pad,
      ly,
      MUTED,
      1,
    );
    ly += 16;
    ly = c.drawWrappedText(input.higher?.summary || '-', pad, ly, half, TEXT, 1, 14);
    let ry = leftY0;
    c.drawText(
      `${(input.lowerTimeframe || 'LTF').toUpperCase()} ${input.lower?.bias || ''}`.trim(),
      pad + half + 16,
      ry,
      MUTED,
      1,
    );
    ry += 16;
    ry = c.drawWrappedText(input.lower?.summary || '-', pad + half + 16, ry, half, TEXT, 1, 14);
    y = Math.max(ly, ry) + 12;
  }

  // Deep dive
  c.drawText('DEEP-DIVE', pad, y, ACCENT, 2);
  y += 22;
  y = c.drawWrappedText(
    input.deepSummary || 'No deep-dive summary.',
    pad,
    y,
    contentW,
    TEXT,
    2,
    18,
  );
  y += 10;

  if (watch.length) {
    c.drawText('KEY ZONES', pad, y, MUTED, 1);
    y += 16;
    for (const level of watch) {
      y = c.drawWrappedText(`* ${level}`, pad, y, contentW, TEXT, 1, 14);
    }
    y += 8;
  }

  // Trades
  c.drawText('TRADE SETUPS', pad, y, ACCENT, 2);
  y += 22;

  if (trades.length === 0) {
    c.fillRect(pad, y, contentW, 40, PANEL);
    c.drawText('No setup cleared confluence / R:R gates yet.', pad + 12, y + 14, MUTED, 2);
    y += 52;
  } else {
    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];
      const dir = (t.direction || 'SETUP').toUpperCase();
      const accent = dir === 'LONG' ? GREEN : dir === 'SHORT' ? RED : ACCENT;
      const blockH = 118;
      c.fillRect(pad, y, contentW, blockH, PANEL);
      c.fillRect(pad, y, 6, blockH, accent);

      let ty = y + 12;
      c.drawText(
        `${i + 1}. ${dir}  ${t.grade || ''}  ${t.htfRelationship || ''}`.trim(),
        pad + 16,
        ty,
        TEXT,
        2,
      );
      ty += 20;
      const trigger = [t.triggerZone, t.triggerCondition].filter(Boolean).join(' - ');
      if (trigger) {
        ty = c.drawWrappedText(trigger, pad + 16, ty, contentW - 32, MUTED, 1, 14);
      }
      const tps = (t.targets || []).map(fmt).join(' / ') || '-';
      const rr = t.riskRewardRatio == null ? '-' : `${Number(t.riskRewardRatio).toFixed(2)}R`;
      c.drawText(`Entry ${fmt(t.entry)}   Stop ${fmt(t.stopLoss)}   TP ${tps}   R:R ${rr}`, pad + 16, ty, TEXT, 1);
      ty += 16;
      if (t.reasoning) {
        c.drawWrappedText(t.reasoning, pad + 16, ty, contentW - 32, MUTED, 1, 14);
      }
      y += blockH + 12;
    }
  }

  // Footer
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  c.drawText(`BearTec Crypto AI  |  Pre-London desk  |  ${stamp}`, pad, height - 36, MUTED, 1);

  // Border line at top of card for polish
  c.fillRect(16, 16, width - 32, 2, BORDER);

  return c.toPngBuffer();
}
