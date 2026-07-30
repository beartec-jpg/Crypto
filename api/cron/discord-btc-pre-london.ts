/**
 * Once-daily pre-London desk: deep-dive BTC, render total analysis PNG, post to Discord.
 *
 * Schedule: 05:45 UTC (15 minutes before London session board at 06:00 UTC).
 *
 * Env:
 *   DISCORD_WEBHOOK_URL   — required Incoming Webhook URL
 *   CRON_SECRET           — optional Bearer auth (same as other crons)
 *   XAI_API_KEY           — required for Grok deep-dive
 *   DISCORD_BTC_SYMBOL    — default BTCUSDT
 *   DISCORD_AI_HIGHER_TF  — default 1d
 *   DISCORD_AI_LOWER_TF   — default 15m
 *   DISCORD_AI_MODE       — default smc
 *   DISCORD_AI_HORIZON    — default swing
 *   DISCORD_MIN_RR        — default 1.5
 *   DISCORD_MIN_CONFLUENCE— default 3
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getPool } from '../_lib/db.js';
import {
  encodeCryptoAiPairInterval,
  getCryptoAiTradeHorizon,
} from '../_lib/cryptoAiConfig.js';
import { getAiTraderMode } from '../_lib/aiTraderModes.js';
import { postDiscordWebhook, tradeEmbeds } from '../_lib/discordWebhook.js';
import { renderDiscordAnalysisPng } from '../_lib/renderDiscordAnalysisPng.js';
import { runSystemDeepDive } from '../crypto/order-flow-alerts-multi-tf.js';

export const config = {
  maxDuration: 300,
  memory: 1024,
};

function sectionOf(insights: any, tf: string): { summary?: string; bias?: string; keyLevels?: string[] } | null {
  if (!insights || typeof insights !== 'object') return null;
  const section = insights[tf];
  return section && typeof section === 'object' ? section : null;
}

function overallOf(insights: any): string {
  return typeof insights?.overallSummary === 'string' ? insights.overallSummary : '';
}

function collectLevels(insights: any, frames: string[]): string[] {
  if (!insights) return [];
  const levels: string[] = [];
  for (const key of [...frames, ...Object.keys(insights)]) {
    if (key === 'overallSummary') continue;
    const section = sectionOf(insights, key);
    for (const level of section?.keyLevels || []) {
      if (level && !levels.includes(level)) levels.push(level);
    }
  }
  return levels.slice(0, 6);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const expectedCronAuth = process.env.CRON_SECRET
    ? ['Bearer', process.env.CRON_SECRET].join(' ')
    : null;
  if (expectedCronAuth && authHeader !== expectedCronAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'DISCORD_WEBHOOK_URL is not set',
      hint: 'Create a channel Incoming Webhook in Discord and set DISCORD_WEBHOOK_URL in Vercel env.',
    });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'XAI_API_KEY is not set' });
  }

  // Guard against swapped env values (e.g. DISCORD_BTC_SYMBOL=1d or 1D)
  const rawSymbol = (process.env.DISCORD_BTC_SYMBOL || 'BTCUSDT').trim().toUpperCase();
  const looksLikeTimeframe = /^\d+[MHDW]$/i.test(rawSymbol) || ['1D', '1H', '15M', '1W', '4H', '5M', '1M'].includes(rawSymbol);
  const symbol = !rawSymbol || looksLikeTimeframe ? 'BTCUSDT' : rawSymbol;
  if (looksLikeTimeframe) {
    console.warn(
      `DISCORD_BTC_SYMBOL="${process.env.DISCORD_BTC_SYMBOL}" looks like a timeframe; using BTCUSDT. ` +
        'Set DISCORD_BTC_SYMBOL=BTCUSDT and put 1d/15m in DISCORD_AI_HIGHER_TF / DISCORD_AI_LOWER_TF.',
    );
  }
  const higherTimeframe = (process.env.DISCORD_AI_HIGHER_TF || '1d').trim().toLowerCase();
  const lowerTimeframe = (process.env.DISCORD_AI_LOWER_TF || '15m').trim().toLowerCase();
  const mode = (process.env.DISCORD_AI_MODE || 'smc').trim().toLowerCase();
  const tradeHorizon = (process.env.DISCORD_AI_HORIZON || 'swing').trim().toLowerCase();
  const minRiskReward = Number(process.env.DISCORD_MIN_RR ?? 1.5);
  const minConfluence = Number(process.env.DISCORD_MIN_CONFLUENCE ?? 3);

  console.log(`📡 Pre-London Discord desk: ${symbol} ${higherTimeframe}/${lowerTimeframe} mode=${mode} horizon=${tradeHorizon}`);

  try {
    // Prefer cached general analysis for cross-TF summary (from session cron)
    let generalInsights: any = null;
    try {
      const pool = getPool();
      const pairInterval = encodeCryptoAiPairInterval(higherTimeframe as any, lowerTimeframe as any);
      const cached = await pool.query(
        `SELECT ai_narration
         FROM crypto_scan_cache
         WHERE symbol = $1 AND interval = $2 AND mode = 'general'
         LIMIT 1`,
        [symbol, pairInterval],
      );
      const row = cached.rows[0];
      if (row?.ai_narration) {
        const narration = typeof row.ai_narration === 'string'
          ? JSON.parse(row.ai_narration)
          : row.ai_narration;
        generalInsights = narration?.multiTFInsights || null;
      }
    } catch (cacheErr: any) {
      console.warn('General cache lookup skipped:', cacheErr?.message);
    }

    const deep = await runSystemDeepDive({
      apiKey,
      symbol,
      higherTimeframe,
      lowerTimeframe,
      mode,
      tradeHorizon,
      minRiskReward,
      minConfluence,
    });

    const modeMeta = getAiTraderMode(deep.modeId);
    const horizonMeta = getCryptoAiTradeHorizon(deep.tradeHorizon);
    const deepInsights = deep.multiTFInsights;
    const higher = sectionOf(deepInsights, deep.higherTimeframe) || sectionOf(generalInsights, deep.higherTimeframe);
    const lower = sectionOf(deepInsights, deep.lowerTimeframe) || sectionOf(generalInsights, deep.lowerTimeframe);
    const crossSummary = overallOf(generalInsights) || overallOf(deepInsights) || 'See deep-dive notes.';
    const deepSummary = overallOf(deepInsights) || 'Deep-dive completed.';
    const watchLevels = collectLevels(deepInsights, [deep.lowerTimeframe, deep.higherTimeframe]);

    const png = renderDiscordAnalysisPng({
      symbol,
      higherTimeframe: deep.higherTimeframe,
      lowerTimeframe: deep.lowerTimeframe,
      sessionLabel: 'Pre-London open desk',
      modeLabel: modeMeta.label,
      horizonLabel: horizonMeta.label,
      crossSummary,
      deepSummary,
      higher,
      lower,
      watchLevels,
      trades: deep.bestTrades,
    });

    const setupCount = deep.bestTrades.length;
    const content =
      `**${symbol} · Pre-London open** (${deep.higherTimeframe}/${deep.lowerTimeframe})\n` +
      `Mode: **${modeMeta.label}** · Length: **${horizonMeta.label}** (~${horizonMeta.expectedHold})\n` +
      (setupCount
        ? `${setupCount} trade setup${setupCount === 1 ? '' : 's'} attached.`
        : 'No setup cleared gates — watch zones on the card.') +
      `\n_Est. cost ~$${deep.estimatedCost.toFixed(4)}_`;

    const embeds = [
      {
        title: `${symbol} cross-TF / deep summary`,
        description: [crossSummary, deepSummary].filter(Boolean).join('\n\n').slice(0, 4000),
        color: 0xa855f7,
        fields: watchLevels.length
          ? [{ name: 'Key zones', value: watchLevels.map((l) => `• ${l}`).join('\n').slice(0, 1000) }]
          : undefined,
        footer: { text: 'BearTec Crypto AI · Pre-London desk' },
        timestamp: new Date().toISOString(),
      },
      ...tradeEmbeds(symbol, deep.bestTrades),
    ];

    const discord = await postDiscordWebhook({
      webhookUrl,
      content,
      embeds,
      filename: `${symbol}_pre_london_${Date.now()}.png`,
      fileBuffer: png,
      fileContentType: 'image/png',
    });

    if (!discord.ok) {
      console.error('Discord webhook failed:', discord.status, discord.body);
      return res.status(502).json({
        error: 'Discord webhook failed',
        status: discord.status,
        body: discord.body.slice(0, 500),
        analysisOk: true,
        tradeCount: setupCount,
      });
    }

    return res.json({
      success: true,
      symbol,
      higherTimeframe: deep.higherTimeframe,
      lowerTimeframe: deep.lowerTimeframe,
      mode: deep.modeId,
      tradeHorizon: deep.tradeHorizon,
      tradeCount: setupCount,
      estimatedCost: deep.estimatedCost,
      tokens: deep.tokens,
      pngBytes: png.length,
      discordStatus: discord.status,
    });
  } catch (error: any) {
    console.error('Pre-London Discord desk failed:', error);
    // Best-effort failure notice to Discord
    try {
      if (webhookUrl) {
        await postDiscordWebhook({
          webhookUrl,
          content: `⚠️ **${symbol} pre-London desk failed:** ${error?.message || 'unknown error'}`,
        });
      }
    } catch {
      // ignore
    }
    return res.status(500).json({ error: error?.message || 'Pre-London desk failed' });
  }
}
