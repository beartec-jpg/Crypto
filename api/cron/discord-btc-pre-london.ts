/**
 * Once-daily pre-London desk: deep-dive BTC and post text embeds to Discord.
 * No image attachment — message + embeds only, with NFA disclaimer.
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
  getSessionDisplayName,
  type CryptoAiSessionLabel,
} from '../_lib/cryptoAiConfig.js';
import { getAiTraderMode } from '../_lib/aiTraderModes.js';
import { postDiscordWebhook, tradeEmbeds, type DiscordEmbed } from '../_lib/discordWebhook.js';
import {
  normalizeBinanceSpotSymbol,
  runGeneralPairRefresh,
  runSystemDeepDive,
} from '../crypto/order-flow-alerts-multi-tf.js';

export const config = {
  maxDuration: 300,
  memory: 1024,
};

/** Session order for a trading day: Asia → London → New York */
const SESSION_ORDER: CryptoAiSessionLabel[] = ['asia', 'london', 'new_york'];

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

function normaliseSnapshots(raw: unknown): any[] {
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function insightsHasContent(insights: any): boolean {
  if (!insights || typeof insights !== 'object') return false;
  if (overallOf(insights)) return true;
  for (const [key, value] of Object.entries(insights)) {
    if (key === 'overallSummary') continue;
    if (value && typeof value === 'object') {
      const s = value as { summary?: string; bias?: string; keyLevels?: string[] };
      if (s.summary || s.bias || (Array.isArray(s.keyLevels) && s.keyLevels.length)) return true;
    }
  }
  return false;
}

/**
 * Cache is keyed by exact (symbol, interval, mode).
 * App session board often uses BTCUSDT + 1d_15m while Discord env may be BTCUSD + 1d_1h —
 * so we probe aliases and nearby pairs before giving up.
 */
function symbolLookupCandidates(primary: string): string[] {
  const base = normalizeBinanceSpotSymbol(primary);
  const set = new Set<string>([base, primary.toUpperCase()]);
  if (base.endsWith('USDT')) {
    set.add(base.replace(/USDT$/, 'USD'));
    set.add(base.replace(/USDT$/, ''));
  }
  if (base === 'BTCUSDT') {
    set.add('BTCUSD');
    set.add('BTC');
    set.add('XBTUSDT');
  }
  return Array.from(set).filter(Boolean);
}

function pairLookupCandidates(higher: string, lower: string): string[] {
  const primary = encodeCryptoAiPairInterval(higher as any, lower as any);
  const extras = ['1d_1h', '1d_15m', '1w_1h', '1w_15m'];
  return Array.from(new Set([primary, ...extras]));
}

/** Before London open, previous completed session is Asia (then prior NY if useful). */
function pickPreviousSessions(snapshots: any[]): any[] {
  if (!snapshots.length) return [];
  const bySession = new Map<string, any>();
  for (const snap of snapshots) {
    const key = String(snap?.session || '').toLowerCase();
    if (!key) continue;
    // snapshots are newest-first from rotateSnapshots
    if (!bySession.has(key)) bySession.set(key, snap);
  }
  // Prefer Asia as the session that just finished before London
  const preferred: CryptoAiSessionLabel[] = ['asia', 'new_york', 'london'];
  const ordered: any[] = [];
  for (const id of preferred) {
    const snap = bySession.get(id);
    if (snap && insightsHasContent(snap.multiTFInsights)) ordered.push(snap);
  }
  // Fall back to any snapshot with content (newest first), max 2
  if (!ordered.length) {
    return snapshots.filter((s) => insightsHasContent(s?.multiTFInsights)).slice(0, 2);
  }
  return ordered.slice(0, 2);
}

function formatSessionEmbed(
  snap: any,
  symbol: string,
  higherTimeframe: string,
  lowerTimeframe: string,
): DiscordEmbed {
  const sessionId = String(snap?.session || '').toLowerCase() as CryptoAiSessionLabel;
  const label =
    snap?.label
    || (SESSION_ORDER.includes(sessionId) ? getSessionDisplayName(sessionId) : sessionId || 'Session');
  const insights = snap?.multiTFInsights || null;
  const overall = overallOf(insights) || 'No session summary stored.';
  const higher = sectionOf(insights, higherTimeframe);
  const lower = sectionOf(insights, lowerTimeframe);
  const levels = collectLevels(insights, [lowerTimeframe, higherTimeframe]);
  const when = snap?.generatedAt ? String(snap.generatedAt).replace('T', ' ').slice(0, 16) + ' UTC' : null;

  const fields: DiscordEmbed['fields'] = [];
  if (higher?.summary || higher?.bias) {
    fields.push({
      name: `${higherTimeframe.toUpperCase()} · ${higher?.bias || '—'}`,
      value: (higher?.summary || '—').slice(0, 500),
      inline: false,
    });
  }
  if (lower?.summary || lower?.bias) {
    fields.push({
      name: `${lowerTimeframe.toUpperCase()} · ${lower?.bias || '—'}`,
      value: (lower?.summary || '—').slice(0, 500),
      inline: false,
    });
  }
  if (levels.length) {
    fields.push({
      name: 'Key levels',
      value: levels.map((l) => `• ${l}`).join('\n').slice(0, 800),
      inline: false,
    });
  }

  return {
    title: `① Previous session · ${label}`,
    description: overall.slice(0, 1500),
    color: 0x38bdf8,
    fields: fields.length ? fields : undefined,
    footer: when ? { text: `Snapshot ${when}` } : { text: `${symbol} session board` },
  };
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
  // BTCUSD → BTCUSDT so Binance + session cache keys match the rest of the platform
  const symbol = normalizeBinanceSpotSymbol(!rawSymbol || looksLikeTimeframe ? 'BTCUSDT' : rawSymbol);
  if (looksLikeTimeframe) {
    console.warn(
      `DISCORD_BTC_SYMBOL="${process.env.DISCORD_BTC_SYMBOL}" looks like a timeframe; using BTCUSDT. ` +
        'Set DISCORD_BTC_SYMBOL=BTCUSDT and put 1d/15m in DISCORD_AI_HIGHER_TF / DISCORD_AI_LOWER_TF.',
    );
  }
  if (rawSymbol && rawSymbol !== symbol) {
    console.warn(`DISCORD_BTC_SYMBOL="${rawSymbol}" normalized to "${symbol}" for Binance/cache.`);
  }
  const higherTimeframe = (process.env.DISCORD_AI_HIGHER_TF || '1d').trim().toLowerCase();
  const lowerTimeframe = (process.env.DISCORD_AI_LOWER_TF || '15m').trim().toLowerCase();
  const mode = (process.env.DISCORD_AI_MODE || 'smc').trim().toLowerCase();
  const tradeHorizon = (process.env.DISCORD_AI_HORIZON || 'swing').trim().toLowerCase();
  const minRiskReward = Number(process.env.DISCORD_MIN_RR ?? 1.5);
  const minConfluence = Number(process.env.DISCORD_MIN_CONFLUENCE ?? 3);

  console.log(`📡 Pre-London Discord desk: ${symbol} ${higherTimeframe}/${lowerTimeframe} mode=${mode} horizon=${tradeHorizon}`);

  try {
    // Prefer cached general analysis + session snapshots (from Asia/London/NY cron)
    let generalInsights: any = null;
    let sessionSnapshots: any[] = [];
    const pool = getPool();
    const pairInterval = encodeCryptoAiPairInterval(higherTimeframe as any, lowerTimeframe as any);

    const loadGeneralCache = async () => {
      const cached = await pool.query(
        `SELECT ai_narration, snapshots
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
      sessionSnapshots = normaliseSnapshots(row?.snapshots);
    };

    try {
      await loadGeneralCache();
    } catch (cacheErr: any) {
      console.warn('General cache lookup skipped:', cacheErr?.message);
    }

    // If session board / cross-TF empty, warm it once (same path as session cron)
    if (!generalInsights || !sessionSnapshots.length) {
      try {
        console.log(`Warming general multi-TF cache for ${symbol} ${pairInterval}…`);
        const generated = await runGeneralPairRefresh(pool, apiKey, symbol, higherTimeframe, lowerTimeframe);
        generalInsights = generated.multiTFInsights || generalInsights;
        sessionSnapshots = normaliseSnapshots(generated.snapshots);
      } catch (warmErr: any) {
        console.warn('General cache warm failed:', warmErr?.message);
        try {
          await loadGeneralCache();
        } catch {
          // ignore
        }
      }
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
      softGates: true,
    });

    const modeMeta = getAiTraderMode(deep.modeId);
    const horizonMeta = getCryptoAiTradeHorizon(deep.tradeHorizon);
    const deepInsights = deep.multiTFInsights;
    const htf = deep.higherTimeframe;
    const ltf = deep.lowerTimeframe;

    // Build readable deep text even when overallSummary is missing (was showing "Deep-dive completed.")
    const deepHigher = sectionOf(deepInsights, htf);
    const deepLower = sectionOf(deepInsights, ltf);
    const watchLevels = collectLevels(deepInsights, [ltf, htf]);
    const deepSummary =
      overallOf(deepInsights)
      || [deepHigher?.summary, deepLower?.summary].filter(Boolean).join('\n\n')
      || (deep.bestTrades.length
        ? `Deep-dive found ${deep.bestTrades.length} setup idea(s) for ${symbol}.`
        : `Deep-dive finished for ${symbol}. No fully qualified setup — check structure on ${htf}/${ltf}.`);

    // Cross-TF: prefer general cache; only show embed if we have real content
    const genHigher = sectionOf(generalInsights, htf);
    const genLower = sectionOf(generalInsights, ltf);
    const crossSummary = overallOf(generalInsights);
    const hasCrossContent = Boolean(
      crossSummary
      || genHigher?.summary
      || genLower?.summary
      || genHigher?.bias
      || genLower?.bias,
    );

    // Previous session: only if snapshot has real analysis (never post empty "no cache" stubs)
    const previousSessions = pickPreviousSessions(sessionSnapshots).filter((snap) => {
      const insights = snap?.multiTFInsights;
      return Boolean(overallOf(insights) || collectLevels(insights, [ltf, htf]).length);
    });

    const setupCount = deep.bestTrades.length;

    const content =
      `**${symbol} · Pre-London open** (${htf}/${ltf})\n` +
      `Mode: **${modeMeta.label}** · Length: **${horizonMeta.label}** (~${horizonMeta.expectedHold})\n` +
      (setupCount
        ? `${setupCount} trade setup${setupCount === 1 ? '' : 's'} below${deep.gatesRelaxed ? ' (soft-gated — review carefully)' : ''}.`
        : 'No priced setup this run — see deep-dive / zones below.') +
      `\n\n⚠️ **Not financial advice.** Educational / informational only. Always review the chart and structure yourself before acting — make your own judgement.`;

    // Core analysis first (what worked before session section was added), then optional context, then trades
    const embeds: DiscordEmbed[] = [];

    // ① Deep-dive — always the main analysis body
    {
      const fields: DiscordEmbed['fields'] = [];
      if (deepHigher?.summary || deepHigher?.bias) {
        fields.push({
          name: `${htf.toUpperCase()} · ${deepHigher?.bias || '—'}`,
          value: (deepHigher?.summary || '—').slice(0, 900),
          inline: false,
        });
      }
      if (deepLower?.summary || deepLower?.bias) {
        fields.push({
          name: `${ltf.toUpperCase()} · ${deepLower?.bias || '—'}`,
          value: (deepLower?.summary || '—').slice(0, 900),
          inline: false,
        });
      }
      if (watchLevels.length) {
        fields.push({
          name: 'Key zones to watch',
          value: watchLevels.map((l) => `• ${l}`).join('\n').slice(0, 1000),
          inline: false,
        });
      }
      embeds.push({
        title: `① Deep-dive · ${symbol}`,
        description: deepSummary.slice(0, 3500),
        color: 0xa855f7,
        fields: fields.length ? fields : undefined,
        footer: { text: `${modeMeta.label} · ${horizonMeta.label} · Not financial advice` },
        timestamp: new Date().toISOString(),
      });
    }

    // ② Trades
    const tradeList = tradeEmbeds(symbol, deep.bestTrades).map((embed, i) => ({
      ...embed,
      title: `② ${embed.title || `Trade setup ${i + 1}`}`,
    }));
    if (tradeList.length) {
      embeds.push(...tradeList);
    } else {
      embeds.push({
        title: '② Trade setups',
        description:
          'No priced setup with valid entry / stop / TP this run. Use the deep-dive and key zones above; wait for structure.',
        color: 0x64748b,
      });
    }

    // ③ Cross-timeframe — only when general cache has real content (skip empty stubs)
    if (hasCrossContent) {
      const fields: DiscordEmbed['fields'] = [];
      if (genHigher?.summary || genHigher?.bias) {
        fields.push({
          name: `${htf.toUpperCase()} · ${genHigher?.bias || '—'}`,
          value: (genHigher?.summary || '—').slice(0, 600),
          inline: false,
        });
      }
      if (genLower?.summary || genLower?.bias) {
        fields.push({
          name: `${ltf.toUpperCase()} · ${genLower?.bias || '—'}`,
          value: (genLower?.summary || '—').slice(0, 600),
          inline: false,
        });
      }
      embeds.push({
        title: '③ Cross-timeframe (session board)',
        description: (crossSummary || 'Multi-TF context from general scan.').slice(0, 2000),
        color: 0xa78bfa,
        fields: fields.length ? fields : undefined,
        footer: { text: 'General multi-TF · Not financial advice' },
      });
    }

    // ④ Previous session — only when we have a real snapshot
    for (const snap of previousSessions) {
      const emb = formatSessionEmbed(snap, symbol, htf, ltf);
      embeds.push({
        ...emb,
        title: (emb.title || 'Previous session').replace(/^①\s*/, '④ '),
      });
    }

    // Disclaimer last
    embeds.push({
      title: 'Disclaimer',
      description:
        'This is **not financial advice**. Crypto trading involves substantial risk of loss. ' +
        'Setups are AI-generated ideas for education and discussion only. ' +
        '**Always inspect the chart and structure yourself** before trading, and make your own independent decisions. ' +
        'BearTec is not responsible for trading losses.',
      color: 0x64748b,
    });

    const discord = await postDiscordWebhook({
      webhookUrl,
      content,
      embeds,
    });

    // Auto-register priced setups with the always-on trade tracker (spare server).
    // Env: TRACKER_URL (e.g. http://5.78.142.246:3101), TRACKER_API_KEY
    let tracker: { ok: boolean; registered?: number; error?: string } = { ok: false };
    const trackerUrl = (process.env.TRACKER_URL || '').replace(/\/+$/, '');
    if (trackerUrl && deep.bestTrades.length) {
      try {
        const payload = {
          source: 'discord_desk',
          userId: process.env.TRACKER_DESK_USER_ID || 'discord-desk',
          trades: deep.bestTrades.map((t: any) => ({
            symbol,
            direction: String(t.direction || '').toUpperCase(),
            grade: t.grade || 'B',
            entry: t.entry,
            stopLoss: t.stopLoss,
            targets: t.targets,
            stopLiftTrigger: t.stopLiftTrigger ?? t.stop_lift_trigger ?? null,
            stopLiftTo: t.stopLiftTo ?? t.stop_lift_to ?? null,
            stopLiftRationale: t.stopLiftRationale ?? t.stop_lift_rationale ?? null,
            confluenceSignals: t.confluenceSignals || [],
            reasoning: t.reasoning || t.triggerZone || null,
            riskRewardRatio: t.riskRewardRatio,
            meta: {
              mode: deep.modeId,
              tradeHorizon: deep.tradeHorizon,
              higherTimeframe: deep.higherTimeframe,
              lowerTimeframe: deep.lowerTimeframe,
              from: 'discord-btc-pre-london',
              stopLiftRationale: t.stopLiftRationale || null,
            },
          })),
        };
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.TRACKER_API_KEY) {
          headers['X-Tracker-Key'] = process.env.TRACKER_API_KEY;
        }
        const tr = await fetch(`${trackerUrl}/api/trades`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        const bodyText = await tr.text();
        if (!tr.ok) {
          console.error('Trade tracker register failed:', tr.status, bodyText.slice(0, 300));
          tracker = { ok: false, error: `${tr.status} ${bodyText.slice(0, 200)}` };
        } else {
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyText);
          } catch {
            /* ignore */
          }
          tracker = { ok: true, registered: parsed.count ?? deep.bestTrades.length };
          console.log(`📍 Registered ${tracker.registered} setup(s) with trade tracker`);
        }
      } catch (trackErr: any) {
        console.error('Trade tracker register error:', trackErr?.message || trackErr);
        tracker = { ok: false, error: trackErr?.message || 'tracker unreachable' };
      }
    }

    if (!discord.ok) {
      console.error('Discord webhook failed:', discord.status, discord.body);
      return res.status(502).json({
        error: 'Discord webhook failed',
        status: discord.status,
        body: discord.body.slice(0, 500),
        analysisOk: true,
        tradeCount: setupCount,
        tracker,
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
      gatesRelaxed: deep.gatesRelaxed || false,
      rawTradeCount: deep.rawTradeCount ?? 0,
      estimatedCost: deep.estimatedCost,
      tokens: deep.tokens,
      discordStatus: discord.status,
      generalCache: Boolean(generalInsights),
      sessionSnapshots: sessionSnapshots.length,
      tracker,
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
