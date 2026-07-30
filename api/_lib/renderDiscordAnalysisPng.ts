/**
 * High-quality server-side "total analysis" PNG for Discord.
 * Renders a polished SVG with Inter fonts → PNG via @resvg/resvg-js.
 * Falls back to the simple bitmap renderer only if resvg is unavailable.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SimpleCanvas, type Rgba } from './simplePng.js';

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

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text: string, maxChars: number, maxLines = 6): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? `${last.slice(0, -3)}…` : `${last}…`;
  }
  return lines;
}

function assetPath(...parts: string[]): string | null {
  const candidates = [
    join(process.cwd(), 'api/_lib/assets', ...parts),
    join(process.cwd(), 'assets', ...parts),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function buildSvg(input: DiscordRenderInput): { svg: string; width: number; height: number } {
  const width = 1200;
  const trades = (input.trades || []).slice(0, 2);
  const watch = (input.watchLevels || []).slice(0, 6);
  const crossLines = wrapLines(input.crossSummary || 'No general summary cached yet.', 92, 5);
  const deepLines = wrapLines(input.deepSummary || 'No deep-dive summary.', 92, 5);
  const higherLines = wrapLines(input.higher?.summary || '—', 48, 4);
  const lowerLines = wrapLines(input.lower?.summary || '—', 48, 4);

  // Dynamic height
  let height = 48; // top pad
  height += 72; // title
  height += 44; // badges
  height += 36 + crossLines.length * 26 + 16; // cross
  height += 28 + Math.max(higherLines.length, lowerLines.length) * 22 + 24; // htf/ltf
  height += 36 + deepLines.length * 26 + 12; // deep
  if (watch.length) height += 28 + watch.length * 24 + 8;
  height += 36; // trades title
  if (!trades.length) {
    height += 64;
  } else {
    for (const t of trades) {
      const trigger = [t.triggerZone, t.triggerCondition].filter(Boolean).join(' — ');
      const trigLines = trigger ? wrapLines(trigger, 95, 2) : [];
      const reasonLines = t.reasoning ? wrapLines(t.reasoning, 95, 3) : [];
      height += 28 + 22 + trigLines.length * 22 + 28 + reasonLines.length * 22 + 28;
    }
  }
  height += 56; // footer
  height = Math.max(height, 900);

  const badges = [
    `${input.higherTimeframe}/${input.lowerTimeframe}`,
    input.horizonLabel,
    input.modeLabel,
    trades.length ? `${trades.length} setup${trades.length === 1 ? '' : 's'}` : 'No setup',
  ].filter(Boolean) as string[];

  let y = 56;
  const left = 56;
  const contentW = width - left * 2;

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="55%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>`);

  // Background
  parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);

  // Main card
  parts.push(
    `<rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="24" fill="#121a2b" filter="url(#cardShadow)"/>`,
  );
  parts.push(`<rect x="28" y="28" width="8" height="${height - 56}" rx="4" fill="#a855f7"/>`);

  // Simple cyan "BearTec" text watermark (no logo image)
  parts.push(`
    <g opacity="0.14" transform="rotate(-18 ${width / 2} ${height / 2})">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle"
        fill="#5ed0f3" font-family="Inter, sans-serif" font-size="120" font-weight="700"
        letter-spacing="6">BearTec</text>
    </g>
  `);

  // Title
  parts.push(
    `<text x="${left}" y="${y}" fill="#f1f5f9" font-family="Inter, sans-serif" font-size="36" font-weight="700">${escapeXml(input.symbol)}  ·  Total analysis</text>`,
  );
  y += 36;
  parts.push(
    `<text x="${left}" y="${y}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="18" font-weight="500">${escapeXml(input.sessionLabel || 'Pre-London open desk')}</text>`,
  );
  y += 40;

  // Badges
  let bx = left;
  for (const badge of badges) {
    const label = badge.toUpperCase();
    const bw = Math.max(72, label.length * 9.2 + 28);
    parts.push(`<rect x="${bx}" y="${y - 18}" width="${bw}" height="32" rx="10" fill="#1e293b"/>`);
    parts.push(
      `<text x="${bx + 14}" y="${y + 4}" fill="#cbd5e1" font-family="Inter, sans-serif" font-size="13" font-weight="600">${escapeXml(label)}</text>`,
    );
    bx += bw + 10;
  }
  y += 48;

  const sectionTitle = (title: string) => {
    parts.push(
      `<text x="${left}" y="${y}" fill="#c084fc" font-family="Inter, sans-serif" font-size="14" font-weight="700" letter-spacing="1.5">${escapeXml(title.toUpperCase())}</text>`,
    );
    y += 28;
  };

  const bodyLines = (lines: string[], color = '#e2e8f0', size = 17) => {
    for (const line of lines) {
      parts.push(
        `<text x="${left}" y="${y}" fill="${color}" font-family="Inter, sans-serif" font-size="${size}" font-weight="400">${escapeXml(line)}</text>`,
      );
      y += size + 9;
    }
  };

  // Cross-timeframe
  sectionTitle('Cross-timeframe analysis');
  bodyLines(crossLines);
  y += 12;

  // HTF / LTF panels
  const colW = (contentW - 16) / 2;
  const panelTop = y;
  const panelH = Math.max(higherLines.length, lowerLines.length) * 22 + 48;
  parts.push(`<rect x="${left}" y="${panelTop}" width="${colW}" height="${panelH}" rx="14" fill="#0f172a"/>`);
  parts.push(
    `<rect x="${left + colW + 16}" y="${panelTop}" width="${colW}" height="${panelH}" rx="14" fill="#0f172a"/>`,
  );
  parts.push(
    `<text x="${left + 16}" y="${panelTop + 28}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13" font-weight="600">${escapeXml((input.higherTimeframe || 'HTF').toUpperCase())}  ·  ${escapeXml(input.higher?.bias || '—')}</text>`,
  );
  parts.push(
    `<text x="${left + colW + 32}" y="${panelTop + 28}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13" font-weight="600">${escapeXml((input.lowerTimeframe || 'LTF').toUpperCase())}  ·  ${escapeXml(input.lower?.bias || '—')}</text>`,
  );
  let ly = panelTop + 52;
  for (const line of higherLines) {
    parts.push(
      `<text x="${left + 16}" y="${ly}" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="14">${escapeXml(line)}</text>`,
    );
    ly += 22;
  }
  let ry = panelTop + 52;
  for (const line of lowerLines) {
    parts.push(
      `<text x="${left + colW + 32}" y="${ry}" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="14">${escapeXml(line)}</text>`,
    );
    ry += 22;
  }
  y = panelTop + panelH + 28;

  // Deep dive
  sectionTitle('Deep-dive');
  bodyLines(deepLines);
  y += 8;

  if (watch.length) {
    parts.push(
      `<text x="${left}" y="${y}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="13" font-weight="600">KEY ZONES</text>`,
    );
    y += 24;
    for (const level of watch) {
      parts.push(
        `<text x="${left}" y="${y}" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="15">•  ${escapeXml(level)}</text>`,
      );
      y += 24;
    }
    y += 8;
  }

  // Trades
  sectionTitle('Trade setups');
  if (!trades.length) {
    parts.push(`<rect x="${left}" y="${y}" width="${contentW}" height="52" rx="14" fill="#0f172a"/>`);
    parts.push(
      `<text x="${left + 20}" y="${y + 32}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="16">No setup cleared confluence / R:R gates yet.</text>`,
    );
    y += 68;
  } else {
    trades.forEach((t, i) => {
      const dir = (t.direction || 'SETUP').toUpperCase();
      const accent = dir === 'LONG' ? '#22c55e' : dir === 'SHORT' ? '#ef4444' : '#a855f7';
      const trigger = [t.triggerZone, t.triggerCondition].filter(Boolean).join(' — ');
      const trigLines = trigger ? wrapLines(trigger, 95, 2) : [];
      const reasonLines = t.reasoning ? wrapLines(t.reasoning, 95, 3) : [];
      const blockH = 28 + 24 + trigLines.length * 22 + 30 + reasonLines.length * 22 + 20;

      parts.push(`<rect x="${left}" y="${y}" width="${contentW}" height="${blockH}" rx="14" fill="#0f172a"/>`);
      parts.push(`<rect x="${left}" y="${y}" width="6" height="${blockH}" rx="3" fill="${accent}"/>`);

      let ty = y + 28;
      const header = `${i + 1}. ${dir}   ${t.grade || ''}   ${t.htfRelationship || ''}`.trim();
      parts.push(
        `<text x="${left + 22}" y="${ty}" fill="#f8fafc" font-family="Inter, sans-serif" font-size="18" font-weight="700">${escapeXml(header)}</text>`,
      );
      ty += 26;
      for (const line of trigLines) {
        parts.push(
          `<text x="${left + 22}" y="${ty}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="14">${escapeXml(line)}</text>`,
        );
        ty += 22;
      }
      const tps = (t.targets || []).map(fmt).join('  /  ') || '—';
      const rr = t.riskRewardRatio == null ? '—' : `${Number(t.riskRewardRatio).toFixed(2)}R`;
      const prices = `Entry ${fmt(t.entry)}    Stop ${fmt(t.stopLoss)}    Targets ${tps}    R:R ${rr}`;
      parts.push(
        `<text x="${left + 22}" y="${ty}" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="15" font-weight="600">${escapeXml(prices)}</text>`,
      );
      ty += 26;
      for (const line of reasonLines) {
        parts.push(
          `<text x="${left + 22}" y="${ty}" fill="#94a3b8" font-family="Inter, sans-serif" font-size="14">${escapeXml(line)}</text>`,
        );
        ty += 22;
      }
      y += blockH + 14;
    });
  }

  // Footer
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  parts.push(
    `<text x="${left}" y="${height - 44}" fill="#64748b" font-family="Inter, sans-serif" font-size="13">BearTec Crypto AI  ·  Pre-London desk  ·  ${escapeXml(stamp)}</text>`,
  );

  parts.push(`</svg>`);
  return { svg: parts.join('\n'), width, height };
}

async function renderWithResvg(input: DiscordRenderInput): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const { svg, width } = buildSvg(input);

  const fontFiles = [
    assetPath('Inter-Regular.ttf'),
    assetPath('Inter-SemiBold.ttf'),
    assetPath('Inter-Regular.otf'),
    assetPath('Inter-SemiBold.otf'),
  ].filter((p): p is string => Boolean(p));

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles,
      loadSystemFonts: true,
      defaultFontFamily: 'Inter',
    },
    background: 'rgba(11,18,32,1)',
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

/** Low-quality fallback (bitmap font) — only if resvg fails to load. */
function renderFallbackBitmap(input: DiscordRenderInput): Buffer {
  const width = 1200;
  const trades = (input.trades || []).slice(0, 2);
  const watch = (input.watchLevels || []).slice(0, 6);
  let height = 1000;
  const c = new SimpleCanvas(width, height);
  const BG: Rgba = [11, 18, 32, 255];
  const TEXT: Rgba = [226, 232, 240, 255];
  const MUTED: Rgba = [148, 163, 184, 255];
  const ACCENT: Rgba = [168, 85, 247, 255];
  c.fill(BG);
  c.fillRect(24, 24, width - 48, height - 48, [18, 26, 43, 255]);
  c.fillRect(24, 24, 8, height - 48, ACCENT);
  let y = 56;
  c.drawText(`${input.symbol}  TOTAL ANALYSIS`, 56, y, TEXT, 3);
  y += 40;
  c.drawText(input.sessionLabel || 'Pre-London open', 56, y, MUTED, 2);
  y += 36;
  y = c.drawWrappedText(input.crossSummary || '—', 56, y, width - 112, TEXT, 2, 20);
  y += 16;
  y = c.drawWrappedText(input.deepSummary || '—', 56, y, width - 112, TEXT, 2, 20);
  for (const level of watch) {
    y = c.drawWrappedText(`* ${level}`, 56, y, width - 112, MUTED, 2, 18);
  }
  for (const t of trades) {
    y += 12;
    y = c.drawWrappedText(
      `${t.direction || 'SETUP'} Entry ${fmt(t.entry)} SL ${fmt(t.stopLoss)}`,
      56,
      y,
      width - 112,
      TEXT,
      2,
      20,
    );
  }
  c.drawText('BearTec Crypto AI', 56, height - 48, MUTED, 2);
  return c.toPngBuffer();
}

export async function renderDiscordAnalysisPng(input: DiscordRenderInput): Promise<Buffer> {
  try {
    return await renderWithResvg(input);
  } catch (err) {
    console.error('High-quality PNG render failed, using fallback:', err);
    return renderFallbackBitmap(input);
  }
}

// Back-compat: some callers may still expect sync — not used by cron anymore
export function renderDiscordAnalysisPngSync(input: DiscordRenderInput): Buffer {
  return renderFallbackBitmap(input);
}
