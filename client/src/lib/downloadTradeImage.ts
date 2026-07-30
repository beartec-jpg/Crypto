import type { MultiTFInsights, TradeIdea } from '@/lib/cryptoAiTradePlans';
import { formatTickerDisplay } from '@/lib/chart/priceUtils';
import {
  getHtfRelationshipLabel,
  getOverallSummary,
  getSection,
  isPendingTradeIdea,
} from '@/lib/cryptoAiTradePlans';

export type DownloadTradeImageOptions = {
  trade: TradeIdea;
  symbol: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  horizonLabel?: string;
  modeLabel?: string;
};

export type DownloadAnalysisImageOptions = {
  symbol: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  insights?: MultiTFInsights | null;
  watchLevels?: string[];
  tradeCount?: number;
  horizonLabel?: string;
  modeLabel?: string;
};

/** Flattened session-board row for total analysis export */
export type TotalAnalysisSessionRow = {
  label: string;
  isActive?: boolean;
  bias?: string;
  summary?: string;
  percentChange?: number | null;
  range?: number | null;
  volumeRatio?: number | null;
  closePosition?: number | null;
  closePositionLabel?: string;
  divergenceBadge?: string;
  handoff?: string;
};

export type DownloadTotalAnalysisImageOptions = {
  symbol: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  sessions?: TotalAnalysisSessionRow[];
  crossTimeframeSummary?: string;
  generalInsights?: MultiTFInsights | null;
  deepInsights?: MultiTFInsights | null;
  trades?: TradeIdea[];
  watchLevels?: string[];
  horizonLabel?: string;
  modeLabel?: string;
};

/** Public logo served from client/public/beartec-logo.png */
const BEARTEC_LOGO_URL = '/beartec-logo.png';

let logoLoadPromise: Promise<HTMLImageElement | null> | null = null;

function loadBearTecLogo(): Promise<HTMLImageElement | null> {
  if (logoLoadPromise) return logoLoadPromise;
  logoLoadPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      logoLoadPromise = null;
      resolve(null);
    };
    img.src = BEARTEC_LOGO_URL;
  });
  return logoLoadPromise;
}

/**
 * Crisp BearTec watermark behind card content.
 * Uses large text (not a heavily upscaled tiny logo — that looks pixelated).
 * Optional small logo sits top-right at near-native size.
 */
async function drawBearTecWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options?: { opacity?: number; maxWidthRatio?: number },
): Promise<void> {
  const opacity = options?.opacity ?? 0.08;
  const logo = await loadBearTecLogo();

  ctx.save();
  // Diagonal text watermark — sharp at any size
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `700 ${Math.round(width * 0.11)}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.fillText('BearTec', 0, -8);
  ctx.globalAlpha = opacity * 0.9;
  ctx.fillStyle = '#c4b5fd';
  ctx.font = `600 ${Math.round(width * 0.028)}px Inter, system-ui, -apple-system, sans-serif`;
  ctx.letterSpacing = '0.2em';
  ctx.fillText('CRYPTO AI', 0, Math.round(width * 0.055));
  ctx.restore();

  // Small logo badge top-right (native-ish size so it stays sharp)
  if (logo && logo.naturalWidth > 0) {
    ctx.save();
    const targetW = 100;
    const scale = targetW / logo.naturalWidth;
    const w = logo.naturalWidth * scale;
    const h = logo.naturalHeight * scale;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(logo, width - w - 28, 36, w, h);
    ctx.restore();
  }
}

function fmt(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Renders a self-contained trade card PNG and triggers a browser download.
 * Uses Canvas only — no html2canvas dependency.
 */
export async function downloadTradeImage(options: DownloadTradeImageOptions): Promise<void> {
  const { trade, symbol, higherTimeframe, lowerTimeframe, horizonLabel, modeLabel } = options;
  const displaySymbol = formatTickerDisplay(symbol);
  const direction = trade.direction === 'SHORT' ? 'SHORT' : trade.direction === 'LONG' ? 'LONG' : 'SETUP';
  const isLong = direction === 'LONG';
  const accent = isLong ? '#22c55e' : direction === 'SHORT' ? '#ef4444' : '#a855f7';
  const bg = '#0b1220';
  const card = '#121a2b';
  const muted = '#94a3b8';
  const text = '#e2e8f0';
  const border = '#1e293b';

  const width = 900;
  const padding = 36;
  const contentWidth = width - padding * 2;

  // Measure height dynamically
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('Canvas not supported');

  const rationale = trade.reasoning || trade.slRationale || '';
  const trigger = [trade.triggerZone, trade.triggerCondition].filter(Boolean).join(' — ');
  const signals = (trade.confluenceSignals || []).slice(0, 8);
  const targets = (trade.targets || []).map(fmt).join('  /  ') || '—';

  mctx.font = '15px system-ui, -apple-system, sans-serif';
  const rationaleLines = wrapText(mctx, rationale || '—', contentWidth);
  const triggerLines = trigger ? wrapText(mctx, trigger, contentWidth) : [];
  const signalLines = signals.length
    ? wrapText(mctx, signals.join('  ·  '), contentWidth)
    : [];

  let height = padding;
  height += 56; // title
  height += 28; // badges row
  height += 18;
  if (triggerLines.length) height += 24 + triggerLines.length * 22 + 12;
  height += 120; // price grid
  height += 16;
  height += 22 + rationaleLines.length * 22; // rationale
  if (signalLines.length) height += 18 + 22 + signalLines.length * 22;
  height += 40; // footer
  height += padding;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Card
  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const cardH = height - 32;
  ctx.fillStyle = card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  // Accent bar
  ctx.fillStyle = accent;
  roundRect(ctx, cardX, cardY, 8, cardH, 4);
  ctx.fill();

  // BearTec logo watermark behind content
  await drawBearTecWatermark(ctx, width, height);

  let y = padding + 8;

  // Title
  ctx.fillStyle = text;
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${displaySymbol}  ·  ${direction}`, padding + 12, y + 28);
  y += 56;

  // Badges
  const badges = [
    trade.grade || 'Unrated',
    getHtfRelationshipLabel(trade.htfRelationship),
    isPendingTradeIdea(trade) ? 'Pending' : 'Live',
    trade.primaryTF || `${lowerTimeframe}/${higherTimeframe}`,
  ];
  if (horizonLabel) badges.push(horizonLabel);
  if (modeLabel) badges.push(modeLabel);

  let bx = padding + 12;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  for (const badge of badges) {
    const tw = ctx.measureText(badge).width + 20;
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, bx, y, tw, 26, 8);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.fillText(badge, bx + 10, y + 17);
    bx += tw + 8;
  }
  y += 42;

  // Trigger
  if (triggerLines.length) {
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('TRIGGER', padding + 12, y);
    y += 18;
    ctx.fillStyle = text;
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    for (const line of triggerLines) {
      ctx.fillText(line, padding + 12, y);
      y += 22;
    }
    y += 10;
  }

  // Price grid
  const cols = [
    { label: 'ENTRY', value: fmt(trade.entry), sub: trade.entryZone || '' },
    { label: 'STOP', value: fmt(trade.stopLoss), sub: trade.slRationale || '' },
    { label: 'TARGETS', value: targets, sub: trade.tp1Rationale || '' },
    {
      label: 'R:R',
      value: trade.riskRewardRatio == null ? '—' : `${Number(trade.riskRewardRatio).toFixed(2)}R`,
      sub: '',
    },
  ];
  const colW = contentWidth / cols.length;
  cols.forEach((col, i) => {
    const x = padding + 12 + i * colW;
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(col.label, x, y);
    ctx.fillStyle = text;
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    const valueLines = wrapText(ctx, col.value, colW - 16).slice(0, 2);
    valueLines.forEach((line, li) => {
      ctx.fillText(line, x, y + 26 + li * 22);
    });
    if (col.sub) {
      ctx.fillStyle = muted;
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      const subLines = wrapText(ctx, col.sub, colW - 16).slice(0, 2);
      subLines.forEach((line, li) => {
        ctx.fillText(line, x, y + 56 + li * 16);
      });
    }
  });
  y += 110;

  // Rationale
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText('RATIONALE', padding + 12, y);
  y += 20;
  ctx.fillStyle = text;
  ctx.font = '15px system-ui, -apple-system, sans-serif';
  for (const line of rationaleLines) {
    ctx.fillText(line, padding + 12, y);
    y += 22;
  }

  // Confluence
  if (signalLines.length) {
    y += 12;
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('CONFLUENCE', padding + 12, y);
    y += 20;
    ctx.fillStyle = text;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    for (const line of signalLines) {
      ctx.fillText(line, padding + 12, y);
      y += 22;
    }
  }

  // Footer
  y = height - padding - 8;
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  ctx.fillText(`BearTec Crypto AI  ·  ${stamp}`, padding + 12, y);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode trade image');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSymbol = displaySymbol.replace(/[^a-zA-Z0-9._-]+/g, '_');
  a.href = url;
  a.download = `${safeSymbol}_${direction}_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Renders a deep-dive analysis card PNG (summary + TF bias + watch zones).
 * Works when no trade setups were found — still downloads the analysis.
 */
export async function downloadAnalysisImage(options: DownloadAnalysisImageOptions): Promise<void> {
  const {
    symbol,
    higherTimeframe,
    lowerTimeframe,
    insights,
    watchLevels = [],
    tradeCount = 0,
    horizonLabel,
    modeLabel,
  } = options;

  const displaySymbol = formatTickerDisplay(symbol);
  const accent = '#a855f7';
  const bg = '#0b1220';
  const card = '#121a2b';
  const muted = '#94a3b8';
  const text = '#e2e8f0';
  const border = '#1e293b';

  const width = 900;
  const padding = 36;
  const contentWidth = width - padding * 2;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('Canvas not supported');
  mctx.font = '15px system-ui, -apple-system, sans-serif';

  const overall = getOverallSummary(insights) || 'No high-probability setup cleared the gates yet.';
  const higher = getSection(insights, higherTimeframe);
  const lower = getSection(insights, lowerTimeframe);
  const levels = watchLevels.length
    ? watchLevels
    : [
        ...(higher?.keyLevels ?? []),
        ...(lower?.keyLevels ?? []),
      ].filter(Boolean).slice(0, 8);

  const overallLines = wrapText(mctx, overall, contentWidth);
  const higherSummaryLines = higher?.summary
    ? wrapText(mctx, higher.summary, contentWidth)
    : [];
  const lowerSummaryLines = lower?.summary
    ? wrapText(mctx, lower.summary, contentWidth)
    : [];
  const levelLineSets = levels.map((level) => wrapText(mctx, `• ${level}`, contentWidth));
  const noTradeNote = tradeCount === 0
    ? wrapText(
      mctx,
      'No setup cleared confluence / R:R gates. Watch the zones below for the next trigger.',
      contentWidth,
    )
    : wrapText(
      mctx,
      `${tradeCount} trade idea${tradeCount === 1 ? '' : 's'} found — download individual trades for entry/SL/TP cards.`,
      contentWidth,
    );

  let height = padding;
  height += 56; // title
  height += 28; // badges
  height += 18;
  height += 22 + overallLines.length * 22 + 12; // overall
  if (higherSummaryLines.length) height += 22 + higherSummaryLines.length * 22 + 10;
  if (lowerSummaryLines.length) height += 22 + lowerSummaryLines.length * 22 + 10;
  height += 22 + noTradeNote.length * 22 + 12;
  if (levelLineSets.length) {
    height += 22;
    for (const lines of levelLineSets) height += lines.length * 22;
    height += 8;
  }
  height += 40; // footer
  height += padding;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.scale(2, 2);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const cardH = height - 32;
  ctx.fillStyle = card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  ctx.fillStyle = accent;
  roundRect(ctx, cardX, cardY, 8, cardH, 4);
  ctx.fill();

  await drawBearTecWatermark(ctx, width, height);

  let y = padding + 8;

  ctx.fillStyle = text;
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${displaySymbol}  ·  Analysis`, padding + 12, y + 28);
  y += 56;

  const badges = [
    `${higherTimeframe}/${lowerTimeframe}`,
    tradeCount === 0 ? 'No trade yet' : `${tradeCount} setup${tradeCount === 1 ? '' : 's'}`,
  ];
  if (horizonLabel) badges.push(horizonLabel);
  if (modeLabel) badges.push(modeLabel);
  if (higher?.bias) badges.push(`HTF ${higher.bias}`);
  if (lower?.bias) badges.push(`LTF ${lower.bias}`);

  let bx = padding + 12;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  for (const badge of badges) {
    const tw = ctx.measureText(badge).width + 20;
    if (bx + tw > width - padding) {
      bx = padding + 12;
      y += 32;
    }
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, bx, y, tw, 26, 8);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.fillText(badge, bx + 10, y + 17);
    bx += tw + 8;
  }
  y += 42;

  const drawSection = (label: string, lines: string[]) => {
    if (!lines.length) return;
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(label, padding + 12, y);
    y += 18;
    ctx.fillStyle = text;
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    for (const line of lines) {
      ctx.fillText(line, padding + 12, y);
      y += 22;
    }
    y += 10;
  };

  drawSection('OVERALL SUMMARY', overallLines);
  if (higherSummaryLines.length) {
    drawSection(
      `${higherTimeframe.toUpperCase()}  ·  ${higher?.bias ?? '—'}`,
      higherSummaryLines,
    );
  }
  if (lowerSummaryLines.length) {
    drawSection(
      `${lowerTimeframe.toUpperCase()}  ·  ${lower?.bias ?? '—'}`,
      lowerSummaryLines,
    );
  }
  drawSection(tradeCount === 0 ? 'STATUS' : 'SETUPS', noTradeNote);

  if (levelLineSets.length) {
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('KEY ZONES TO WATCH', padding + 12, y);
    y += 18;
    ctx.fillStyle = text;
    ctx.font = '15px system-ui, -apple-system, sans-serif';
    for (const lines of levelLineSets) {
      for (const line of lines) {
        ctx.fillText(line, padding + 12, y);
        y += 22;
      }
    }
  }

  y = height - padding - 8;
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  ctx.fillText(`BearTec Crypto AI  ·  ${stamp}`, padding + 12, y);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode analysis image');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSymbol = displaySymbol.replace(/[^a-zA-Z0-9._-]+/g, '_');
  a.href = url;
  a.download = `${safeSymbol}_analysis_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Full desk export: session stats + cross-TF analysis + deep-dive + up to 2 trade setups.
 */
export async function downloadTotalAnalysisImage(
  options: DownloadTotalAnalysisImageOptions,
): Promise<void> {
  const {
    symbol,
    higherTimeframe,
    lowerTimeframe,
    sessions = [],
    crossTimeframeSummary,
    generalInsights,
    deepInsights,
    trades = [],
    watchLevels = [],
    horizonLabel,
    modeLabel,
  } = options;

  const displaySymbol = formatTickerDisplay(symbol);
  const accent = '#a855f7';
  const bg = '#0b1220';
  const card = '#121a2b';
  const muted = '#94a3b8';
  const text = '#e2e8f0';
  const border = '#1e293b';
  const panel = '#0f172a';

  const width = 1000;
  const padding = 32;
  const contentWidth = width - padding * 2;
  const limitedTrades = trades.slice(0, 2);

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('Canvas not supported');
  mctx.font = '14px system-ui, -apple-system, sans-serif';

  const crossSummary =
    (crossTimeframeSummary && crossTimeframeSummary.trim())
    || getOverallSummary(generalInsights)
    || '—';
  const deepSummary = getOverallSummary(deepInsights) || '';
  const genHigher = getSection(generalInsights, higherTimeframe);
  const genLower = getSection(generalInsights, lowerTimeframe);
  const deepHigher = getSection(deepInsights, higherTimeframe);
  const deepLower = getSection(deepInsights, lowerTimeframe);

  const crossLines = wrapText(mctx, crossSummary, contentWidth);
  const deepLines = deepSummary ? wrapText(mctx, deepSummary, contentWidth) : [];
  const genHLines = genHigher?.summary ? wrapText(mctx, genHigher.summary, contentWidth - 20) : [];
  const genLLines = genLower?.summary ? wrapText(mctx, genLower.summary, contentWidth - 20) : [];
  const deepHLines = deepHigher?.summary ? wrapText(mctx, deepHigher.summary, contentWidth - 20) : [];
  const deepLLines = deepLower?.summary ? wrapText(mctx, deepLower.summary, contentWidth - 20) : [];
  const levelLines = watchLevels.slice(0, 8).map((l) => wrapText(mctx, `• ${l}`, contentWidth));

  type SessionLayout = {
    row: TotalAnalysisSessionRow;
    summaryLines: string[];
    stats: string[];
  };
  const sessionLayouts: SessionLayout[] = sessions.map((row) => {
    const summaryLines = wrapText(mctx, row.summary || 'Waiting for snapshot.', contentWidth / 3 - 28).slice(0, 4);
    const stats = [
      row.percentChange == null
        ? '% chg —'
        : `% chg ${row.percentChange >= 0 ? '▲' : '▼'} ${Math.abs(row.percentChange).toFixed(2)}%`,
      row.range == null ? 'Range —' : `Range ${row.range.toFixed(4)}`,
      row.volumeRatio == null ? 'Vol —' : `Vol ${row.volumeRatio.toFixed(1)}×`,
      row.closePosition == null
        ? 'Close —'
        : `Close ${row.closePositionLabel || ''} (${(row.closePosition * 100).toFixed(0)}%)`.trim(),
      row.divergenceBadge ? `Div ${row.divergenceBadge}` : 'Div —',
      row.handoff ? `Handoff ${row.handoff}` : 'Handoff —',
    ];
    return { row, summaryLines, stats };
  });

  type TradeLayout = {
    trade: TradeIdea;
    header: string;
    triggerLines: string[];
    rationaleLines: string[];
    lines: string[];
  };
  const tradeLayouts: TradeLayout[] = limitedTrades.map((trade, i) => {
    const dir = trade.direction || 'SETUP';
    const header = `${i + 1}. ${dir}  ·  ${trade.grade || 'Unrated'}  ·  ${getHtfRelationshipLabel(trade.htfRelationship)}${isPendingTradeIdea(trade) ? '  ·  Pending' : ''}`;
    const trigger = [trade.triggerZone, trade.triggerCondition].filter(Boolean).join(' — ');
    const triggerLines = trigger ? wrapText(mctx, trigger, contentWidth - 24).slice(0, 3) : [];
    const rationaleLines = trade.reasoning
      ? wrapText(mctx, trade.reasoning, contentWidth - 24).slice(0, 4)
      : [];
    const rr = trade.riskRewardRatio == null ? '—' : `${Number(trade.riskRewardRatio).toFixed(2)}R`;
    const tps = (trade.targets || []).map(fmt).join(' / ') || '—';
    const lines = [
      `Entry ${fmt(trade.entry)}${trade.entryZone ? `  (${trade.entryZone})` : ''}`,
      `Stop  ${fmt(trade.stopLoss)}${trade.slRationale ? `  — ${trade.slRationale}` : ''}`,
      `TPs   ${tps}`,
      `R:R   ${rr}`,
    ];
    return { trade, header, triggerLines, rationaleLines, lines };
  });

  // Height estimate
  let height = padding;
  height += 52; // title
  height += 34; // badges
  height += 28; // section: sessions
  if (sessionLayouts.length) {
    const sessionCardH = Math.max(
      ...sessionLayouts.map((s) => 28 + s.summaryLines.length * 18 + 8 + s.stats.length * 18 + 20),
      140,
    );
    height += sessionCardH + 16;
  } else {
    height += 40;
  }
  height += 28 + crossLines.length * 20 + 12; // cross TF
  if (genHLines.length || genLLines.length) {
    height += 24 + Math.max(genHLines.length, genLLines.length) * 18 + 16;
  }
  height += 28; // deep section title
  if (deepLines.length) height += deepLines.length * 20 + 8;
  if (deepHLines.length || deepLLines.length) {
    height += 24 + Math.max(deepHLines.length, deepLLines.length) * 18 + 12;
  }
  if (levelLines.length) {
    height += 22;
    for (const lines of levelLines) height += lines.length * 20;
    height += 8;
  }
  height += 28; // trades section title
  if (tradeLayouts.length === 0) {
    height += 48;
  } else {
    for (const t of tradeLayouts) {
      height += 24; // header
      if (t.triggerLines.length) height += t.triggerLines.length * 18 + 6;
      height += t.lines.length * 20 + 8;
      if (t.rationaleLines.length) height += t.rationaleLines.length * 18 + 6;
      height += 16;
    }
  }
  height += 36; // footer
  height += padding;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.scale(2, 2);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cardX = 14;
  const cardY = 14;
  const cardW = width - 28;
  const cardH = height - 28;
  ctx.fillStyle = card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  ctx.fillStyle = accent;
  roundRect(ctx, cardX, cardY, 8, cardH, 4);
  ctx.fill();

  await drawBearTecWatermark(ctx, width, height, { opacity: 0.09, maxWidthRatio: 0.5 });

  let y = padding + 4;

  // Title
  ctx.fillStyle = text;
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${displaySymbol}  ·  Total analysis`, padding + 10, y + 26);
  y += 48;

  // Badges
  const badges = [
    `${higherTimeframe}/${lowerTimeframe}`,
    limitedTrades.length === 0 ? 'No trade setups' : `${limitedTrades.length} setup${limitedTrades.length === 1 ? '' : 's'}`,
  ];
  if (horizonLabel) badges.push(horizonLabel);
  if (modeLabel) badges.push(modeLabel);
  let bx = padding + 10;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  for (const badge of badges) {
    const tw = ctx.measureText(badge).width + 18;
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, bx, y, tw, 24, 8);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.fillText(badge, bx + 9, y + 16);
    bx += tw + 8;
  }
  y += 40;

  const sectionTitle = (label: string) => {
    ctx.fillStyle = accent;
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(label.toUpperCase(), padding + 10, y);
    y += 22;
  };

  // ---- Session board ----
  sectionTitle('Session board');
  if (sessionLayouts.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Session stats not loaded yet.', padding + 10, y);
    y += 28;
  } else {
    const gap = 12;
    const colW = (contentWidth - gap * (sessionLayouts.length - 1)) / sessionLayouts.length;
    const baseY = y;
    let maxBottom = y;

    sessionLayouts.forEach((layout, i) => {
      const x = padding + 10 + i * (colW + gap);
      let cy = baseY;
      const statsH = layout.stats.length * 18;
      const summaryH = layout.summaryLines.length * 18;
      const boxH = 28 + summaryH + 10 + statsH + 18;

      ctx.fillStyle = layout.row.isActive ? 'rgba(34,197,94,0.12)' : panel;
      roundRect(ctx, x, cy, colW, boxH, 10);
      ctx.fill();
      ctx.strokeStyle = layout.row.isActive ? 'rgba(34,197,94,0.35)' : border;
      ctx.lineWidth = 1;
      roundRect(ctx, x, cy, colW, boxH, 10);
      ctx.stroke();

      cy += 18;
      ctx.fillStyle = text;
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(layout.row.label, x + 12, cy);
      if (layout.row.bias) {
        ctx.fillStyle = muted;
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        const biasW = ctx.measureText(layout.row.bias).width;
        ctx.fillText(layout.row.bias, x + colW - 12 - biasW, cy);
      }
      cy += 16;
      ctx.fillStyle = muted;
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      for (const line of layout.summaryLines) {
        ctx.fillText(line, x + 12, cy);
        cy += 18;
      }
      cy += 6;
      ctx.fillStyle = text;
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      for (const stat of layout.stats) {
        ctx.fillText(stat, x + 12, cy);
        cy += 18;
      }
      maxBottom = Math.max(maxBottom, baseY + boxH);
    });
    y = maxBottom + 18;
  }

  // ---- Cross-timeframe ----
  sectionTitle('Cross-timeframe analysis');
  ctx.fillStyle = text;
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  for (const line of crossLines) {
    ctx.fillText(line, padding + 10, y);
    y += 20;
  }
  y += 8;

  if (genHLines.length || genLLines.length) {
    const half = (contentWidth - 12) / 2;
    const leftX = padding + 10;
    const rightX = leftX + half + 12;
    const top = y;
    let leftY = top;
    let rightY = top;

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${higherTimeframe.toUpperCase()}  ·  ${genHigher?.bias ?? '—'}`, leftX, leftY);
    leftY += 16;
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    for (const line of genHLines) {
      ctx.fillText(line, leftX, leftY);
      leftY += 18;
    }

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${lowerTimeframe.toUpperCase()}  ·  ${genLower?.bias ?? '—'}`, rightX, rightY);
    rightY += 16;
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    for (const line of genLLines) {
      ctx.fillText(line, rightX, rightY);
      rightY += 18;
    }
    y = Math.max(leftY, rightY) + 14;
  }

  // ---- Deep dive ----
  sectionTitle('Deep-dive');
  if (deepLines.length) {
    ctx.fillStyle = text;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    for (const line of deepLines) {
      ctx.fillText(line, padding + 10, y);
      y += 20;
    }
    y += 6;
  } else if (deepInsights == null) {
    ctx.fillStyle = muted;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Deep-dive not run yet — session + cross-TF only.', padding + 10, y);
    y += 28;
  }

  if (deepHLines.length || deepLLines.length) {
    const half = (contentWidth - 12) / 2;
    const leftX = padding + 10;
    const rightX = leftX + half + 12;
    const top = y;
    let leftY = top;
    let rightY = top;

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${higherTimeframe.toUpperCase()}  ·  ${deepHigher?.bias ?? '—'}`, leftX, leftY);
    leftY += 16;
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    for (const line of deepHLines) {
      ctx.fillText(line, leftX, leftY);
      leftY += 18;
    }

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${lowerTimeframe.toUpperCase()}  ·  ${deepLower?.bias ?? '—'}`, rightX, rightY);
    rightY += 16;
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    for (const line of deepLLines) {
      ctx.fillText(line, rightX, rightY);
      rightY += 18;
    }
    y = Math.max(leftY, rightY) + 12;
  }

  if (levelLines.length) {
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('KEY ZONES', padding + 10, y);
    y += 18;
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    for (const lines of levelLines) {
      for (const line of lines) {
        ctx.fillText(line, padding + 10, y);
        y += 20;
      }
    }
    y += 6;
  }

  // ---- Trades ----
  sectionTitle('Trade setups');
  if (tradeLayouts.length === 0) {
    ctx.fillStyle = panel;
    roundRect(ctx, padding + 10, y, contentWidth, 40, 10);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      deepInsights == null
        ? 'Run deep-dive search to include entry / SL / TP setups.'
        : 'No setup cleared confluence / R:R gates yet.',
      padding + 22,
      y + 25,
    );
    y += 52;
  } else {
    for (const layout of tradeLayouts) {
      const dir = layout.trade.direction;
      const tradeAccent = dir === 'LONG' ? '#22c55e' : dir === 'SHORT' ? '#ef4444' : accent;
      const blockTop = y;
      let blockH = 28;
      if (layout.triggerLines.length) blockH += layout.triggerLines.length * 18 + 6;
      blockH += layout.lines.length * 20 + 8;
      if (layout.rationaleLines.length) blockH += layout.rationaleLines.length * 18 + 8;
      blockH += 10;

      ctx.fillStyle = panel;
      roundRect(ctx, padding + 10, blockTop, contentWidth, blockH, 10);
      ctx.fill();
      ctx.fillStyle = tradeAccent;
      roundRect(ctx, padding + 10, blockTop, 5, blockH, 3);
      ctx.fill();

      y = blockTop + 20;
      ctx.fillStyle = text;
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(layout.header, padding + 24, y);
      y += 16;

      if (layout.triggerLines.length) {
        ctx.fillStyle = muted;
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        for (const line of layout.triggerLines) {
          ctx.fillText(line, padding + 24, y);
          y += 18;
        }
        y += 4;
      }

      ctx.fillStyle = text;
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      for (const line of layout.lines) {
        const clipped = wrapText(ctx, line, contentWidth - 40)[0] || line;
        ctx.fillText(clipped, padding + 24, y);
        y += 20;
      }

      if (layout.rationaleLines.length) {
        y += 2;
        ctx.fillStyle = muted;
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        for (const line of layout.rationaleLines) {
          ctx.fillText(line, padding + 24, y);
          y += 18;
        }
      }
      y = blockTop + blockH + 12;
    }
  }

  // Footer
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  ctx.fillText(`BearTec Crypto AI  ·  Total analysis  ·  ${stamp}`, padding + 10, height - padding + 4);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to encode total analysis image');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSymbol = displaySymbol.replace(/[^a-zA-Z0-9._-]+/g, '_');
  a.href = url;
  a.download = `${safeSymbol}_total_analysis_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
