import type { VercelRequest, VercelResponse } from '@vercel/node';

type Metric =
  | 'difficulty'
  | 'hashRate'
  | 'mempoolTx'
  | 'mempoolBytes'
  | 'avgFee'
  | 'txsPerBlock'
  | 'blockTime'
  | 'dagTips'
  | 'peers';

type Period = '24h' | '1w' | '1m';

// Metrics that cannot be reconstructed from block history — we show a live snapshot instead
const INSTANT_METRICS = new Set<Metric>(['mempoolTx', 'mempoolBytes', 'peers', 'dagTips']);

const QBTC_TARGET_BLOCK_TIME_S = 10;

const PERIOD_CONFIG: Record<Period, { blocksSpan: number; maxPoints: number }> = {
  '24h': { blocksSpan: 8_640, maxPoints: 50 },
  '1w': { blocksSpan: 60_480, maxPoints: 60 },
  '1m': { blocksSpan: 259_200, maxPoints: 80 },
};

async function rpcCall(method: string, params: any[] = []) {
  const { rpcCall: rpcCallFailover } = await import('../_lib/rpcFailover.js');
  const { result } = await rpcCallFailover(method, params);
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const metric = (Array.isArray(req.query.metric) ? req.query.metric[0] : req.query.metric) as Metric;
  const period = ((Array.isArray(req.query.period) ? req.query.period[0] : req.query.period) || '24h') as Period;

  const validMetrics: Metric[] = [
    'difficulty', 'hashRate', 'mempoolTx', 'mempoolBytes',
    'avgFee', 'txsPerBlock', 'blockTime', 'dagTips', 'peers',
  ];
  const validPeriods: Period[] = ['24h', '1w', '1m'];

  if (!validMetrics.includes(metric)) {
    return res.status(400).json({ error: `Invalid metric: ${metric}` });
  }
  if (!validPeriods.includes(period)) {
    return res.status(400).json({ error: `Invalid period: ${period}` });
  }

  // Instant metrics — fetch the current live value and return as a single data point
  if (INSTANT_METRICS.has(metric)) {
    try {
      const now = Date.now();
      let value: number | null = null;

      if (metric === 'mempoolTx') {
        const info = await rpcCall('getmempoolinfo');
        value = info?.size ?? null;
      } else if (metric === 'mempoolBytes') {
        const info = await rpcCall('getmempoolinfo');
        value = info?.bytes ?? null;
      } else if (metric === 'peers') {
        const peers = await rpcCall('getpeerinfo');
        value = Array.isArray(peers) ? peers.length : null;
      } else if (metric === 'dagTips') {
        const info = await rpcCall('getblockchaininfo');
        value = info?.dag_tips ?? null;
      }

      const data = value !== null ? [{ time: now, value }] : [];
      return res.json({ metric, period, data, note: 'Live snapshot — historical tracking coming soon.' });
    } catch {
      return res.json({ metric, period, data: [], note: 'Unable to fetch live value.' });
    }
  }

  try {
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const currentHeight: number = blockchainInfo?.blocks ?? 0;

    if (currentHeight < 2) {
      return res.json({ metric, period, data: [] });
    }

    const { blocksSpan, maxPoints } = PERIOD_CONFIG[period];
    const span = Math.min(blocksSpan, currentHeight - 1);
    const numPoints = Math.min(maxPoints, span);

    if (numPoints < 2) {
      return res.json({ metric, period, data: [] });
    }

    // Evenly-spaced block heights, oldest first
    const step = Math.max(1, Math.floor(span / numPoints));
    const heights: number[] = [];
    for (let i = numPoints - 1; i >= 0; i--) {
      const h = currentHeight - i * step;
      if (h >= 1 && h <= currentHeight) heights.push(h);
    }

    if (metric === 'avgFee') {
      // getblockstats returns per-block fee rate (sat/vB)
      const blockStats = await Promise.all(
        heights.map(async (h) => {
          try {
            const s = await rpcCall('getblockstats', [h, ['time', 'avgfeerate']]);
            if (s?.time == null || s?.avgfeerate == null) return null;
            return { time: (s.time as number) * 1000, value: s.avgfeerate as number };
          } catch {
            return null;
          }
        }),
      );

      const data = blockStats.filter((p): p is { time: number; value: number } => p !== null);
      return res.json({ metric, period, data });
    }

    // For all other block-based metrics, fetch block headers
    // First resolve hashes in parallel
    const hashResults = await Promise.all(
      heights.map(async (h) => {
        try {
          const hash = await rpcCall('getblockhash', [h]);
          return { height: h, hash: hash as string };
        } catch {
          return null;
        }
      }),
    );

    const validHashes = hashResults.filter(
      (r): r is { height: number; hash: string } => r !== null && !!r.hash,
    );

    if (metric === 'blockTime') {
      // Need each block AND its predecessor to compute the interval
      const blockPairs = await Promise.all(
        validHashes.map(async ({ hash }) => {
          try {
            const block = await rpcCall('getblock', [hash, 1]);
            if (!block?.time || !block?.previousblockhash) return null;
            const prev = await rpcCall('getblock', [block.previousblockhash as string, 1]);
            if (!prev?.time) return null;
            return { time: (block.time as number) * 1000, value: (block.time as number) - (prev.time as number) };
          } catch {
            return null;
          }
        }),
      );

      const data = blockPairs.filter((p): p is { time: number; value: number } => p !== null);
      return res.json({ metric, period, data });
    }

    // Fetch block headers in parallel
    const blocks = await Promise.all(
      validHashes.map(async ({ hash }) => {
        try {
          const block = await rpcCall('getblock', [hash, 1]);
          if (!block?.time) return null;
          return block as Record<string, any>;
        } catch {
          return null;
        }
      }),
    );

    const extractValue = (block: Record<string, any>): number | null => {
      switch (metric) {
        case 'difficulty':
          return typeof block.difficulty === 'number' ? block.difficulty : null;
        case 'hashRate':
          return typeof block.difficulty === 'number'
            ? (block.difficulty * Math.pow(2, 32)) / QBTC_TARGET_BLOCK_TIME_S
            : null;
        case 'txsPerBlock':
          return typeof block.nTx === 'number'
            ? block.nTx
            : Array.isArray(block.tx)
            ? block.tx.length
            : null;
        case 'dagTips':
          return typeof block.dag_tips === 'number' ? block.dag_tips : null;
        default:
          return null;
      }
    };

    const data = blocks
      .filter((b): b is Record<string, any> => b !== null)
      .map((block) => {
        const value = extractValue(block);
        if (value === null) return null;
        return { time: (block.time as number) * 1000, value };
      })
      .filter((p): p is { time: number; value: number } => p !== null);

    return res.json({ metric, period, data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch QBTC history' });
  }
}
