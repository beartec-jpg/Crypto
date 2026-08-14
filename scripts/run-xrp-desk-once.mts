/**
 * One-off XRP desk seed: deep-dive + Discord (#xrp-auto-analysis) + tracker register.
 * Usage: source env then npx tsx scripts/run-xrp-desk-once.mts
 */
import { getPool } from '../api/_lib/db.js';
import {
  encodeCryptoAiPairInterval,
  getCryptoAiTradeHorizon,
} from '../api/_lib/cryptoAiConfig.js';
import { getAiTraderMode } from '../api/_lib/aiTraderModes.js';
import { postDiscordWebhook, tradeEmbeds } from '../api/_lib/discordWebhook.js';
import {
  normalizeBinanceSpotSymbol,
  runGeneralPairRefresh,
  runSystemDeepDive,
} from '../api/crypto/order-flow-alerts-multi-tf.js';

async function main() {
  const symbol = normalizeBinanceSpotSymbol('XRPUSDT');
  const higherTimeframe = (process.env.DISCORD_AI_HIGHER_TF || '1d').trim().toLowerCase();
  const lowerTimeframe = (process.env.DISCORD_AI_LOWER_TF || '15m').trim().toLowerCase();
  const mode = (process.env.DISCORD_AI_MODE || 'smc').trim().toLowerCase();
  const tradeHorizon = (process.env.DISCORD_AI_HORIZON || 'swing').trim().toLowerCase();
  const minRiskReward = Number(process.env.DISCORD_MIN_RR ?? 1.5);
  const minConfluence = Number(process.env.DISCORD_MIN_CONFLUENCE ?? 3);
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_XRP || process.env.DISCORD_WEBHOOK_URL;
  const trackerUrl = (process.env.TRACKER_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.XAI_API_KEY;

  if (!webhookUrl) throw new Error('No XRP webhook (DISCORD_WEBHOOK_URL_XRP)');
  if (!apiKey) throw new Error('No XAI_API_KEY');

  const trackerHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (process.env.TRACKER_API_KEY) {
    trackerHeaders['X-Tracker-Key'] = process.env.TRACKER_API_KEY;
  }

  console.log(`XRP desk one-off: ${symbol} ${higherTimeframe}/${lowerTimeframe} mode=${mode}`);

  const pool = getPool();
  const pairInterval = encodeCryptoAiPairInterval(higherTimeframe as any, lowerTimeframe as any);

  let openTrades: any[] = [];
  if (trackerUrl) {
    try {
      const bookRes = await fetch(
        `${trackerUrl}/api/trades?active=1&symbol=${encodeURIComponent(symbol)}&limit=50`,
        { headers: trackerHeaders, signal: AbortSignal.timeout(10_000) },
      );
      if (bookRes.ok) {
        const j: any = await bookRes.json();
        openTrades = Array.isArray(j.trades) ? j.trades : [];
      }
      console.log('open book', openTrades.length);
    } catch (e: any) {
      console.warn('open book skip', e?.message);
    }
  }

  try {
    const cached = await pool.query(
      `SELECT ai_narration FROM crypto_scan_cache WHERE symbol=$1 AND interval=$2 AND mode='general' LIMIT 1`,
      [symbol, pairInterval],
    );
    if (!cached.rows[0]) {
      console.log('warming general cache…');
      await runGeneralPairRefresh(pool, apiKey, symbol, higherTimeframe, lowerTimeframe);
    }
  } catch (e: any) {
    console.warn('cache warm skip', e?.message);
  }

  console.log('running deep dive (may take a few minutes)…');
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
    openTrades,
  });

  console.log(
    'setups',
    deep.bestTrades?.length ?? 0,
    'reviews',
    deep.openTradeReviews?.length ?? 0,
  );

  const toCancel = (deep.openTradeReviews || []).filter((r: any) => r.action === 'cancel');
  if (trackerUrl && toCancel.length) {
    const cancelRes = await fetch(`${trackerUrl}/api/trades/cancel`, {
      method: 'POST',
      headers: trackerHeaders,
      body: JSON.stringify({
        ids: toCancel.map((r: any) => r.id),
        reason: 'XRP desk one-off review',
      }),
    });
    console.log('cancel', cancelRes.status, (await cancelRes.text()).slice(0, 200));
  }

  let registered = 0;
  if (trackerUrl && deep.bestTrades?.length) {
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
        entryConfirmType: t.entryConfirmType ?? 'reclaim',
        entryConfirmLevel: t.entryConfirmLevel ?? t.entry ?? null,
        entryConfirmRationale: t.entryConfirmRationale ?? null,
        stopLiftTrigger: t.stopLiftTrigger ?? null,
        stopLiftTo: t.stopLiftTo ?? null,
        stopLiftRationale: t.stopLiftRationale ?? null,
        confluenceSignals: t.confluenceSignals || [],
        reasoning: t.reasoning || t.triggerZone || null,
        riskRewardRatio: t.riskRewardRatio,
        meta: { from: 'xrp-desk-one-off', mode: deep.modeId },
      })),
    };
    const tr = await fetch(`${trackerUrl}/api/trades`, {
      method: 'POST',
      headers: trackerHeaders,
      body: JSON.stringify(payload),
    });
    const body = await tr.text();
    console.log('register', tr.status, body.slice(0, 500));
    if (tr.ok) {
      try {
        registered = JSON.parse(body).count ?? deep.bestTrades.length;
      } catch {
        registered = deep.bestTrades.length;
      }
    }
  }

  const modeMeta = getAiTraderMode(deep.modeId);
  const horizonMeta = getCryptoAiTradeHorizon(deep.tradeHorizon);
  const insights = deep.multiTFInsights || {};
  const overall =
    typeof insights.overallSummary === 'string' ? insights.overallSummary : 'Deep-dive complete.';

  const embeds: any[] = [
    {
      title: `① Deep-dive · ${symbol}`,
      description: overall.slice(0, 3500),
      color: 0xa855f7,
      footer: { text: `${modeMeta.label} · ${horizonMeta.label} · one-off seed · NFA` },
      timestamp: new Date().toISOString(),
    },
    ...tradeEmbeds(symbol, deep.bestTrades || []).map((e, i) => ({
      ...e,
      title: `② ${e.title || `Setup ${i + 1}`}`,
    })),
  ];
  if (!(deep.bestTrades || []).length) {
    embeds.push({
      title: '② Trade setups',
      description: 'No priced setup this run — zones only.',
      color: 0x64748b,
    });
  }
  embeds.push({
    title: 'Disclaimer',
    description:
      'Not financial advice. Educational only. One-off XRP desk seed for tracking.',
    color: 0x64748b,
  });

  const discord = await postDiscordWebhook({
    webhookUrl,
    content:
      `**${symbol} · desk seed (manual)** (${higherTimeframe}/${lowerTimeframe})\n` +
      `Mode: **${modeMeta.label}** · **${horizonMeta.label}**\n` +
      `${(deep.bestTrades || []).length} setup(s) registered for tracking.\n\n⚠️ **Not financial advice.**`,
    embeds,
  });
  console.log('discord', discord.status, discord.ok);
  console.log(
    JSON.stringify(
      {
        symbol,
        tradeCount: deep.bestTrades?.length ?? 0,
        registered,
        grades: (deep.bestTrades || []).map((t: any) => ({
          d: t.direction,
          g: t.grade,
          e: t.entry,
          sl: t.stopLoss,
          tps: t.targets,
          confirm: t.entryConfirmLevel,
          lift: t.stopLiftTrigger,
        })),
      },
      null,
      2,
    ),
  );
  if (!discord.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
