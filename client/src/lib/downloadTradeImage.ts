import type { TradeIdea } from '@/lib/cryptoAiTradePlans';
import { formatTickerDisplay } from '@/lib/chart/priceUtils';
import { getHtfRelationshipLabel, isPendingTradeIdea } from '@/lib/cryptoAiTradePlans';

export type DownloadTradeImageOptions = {
  trade: TradeIdea;
  symbol: string;
  higherTimeframe: string;
  lowerTimeframe: string;
  horizonLabel?: string;
  modeLabel?: string;
};

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
  ctx.fillText(`Crypto AI  ·  ${stamp}`, padding + 12, y);

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
