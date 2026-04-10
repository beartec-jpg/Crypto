import type { VercelRequest, VercelResponse } from '@vercel/node';
import { probeAllNodes } from '../_lib/rpcFailover.js';

type QbtcNetwork = 'testnet' | 'mainnet';

function parseNetwork(raw: unknown): QbtcNetwork {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function resolveMainnetConfig() {
  const active = process.env.QBTC_MAINNET_ACTIVE === 'true';
  if (!active) {
    const error = new Error('QBTC mainnet is not active yet. Switch to testnet.');
    (error as any).code = 'MAINNET_NOT_ACTIVE';
    throw error;
  }

  const rpcUrl = process.env.QBTC_MAINNET_RPC_URL || '';
  const rpcUser = process.env.QBTC_MAINNET_RPC_USER || '';
  const rpcPass = process.env.QBTC_MAINNET_RPC_PASSWORD || '';

  if (!rpcUrl) {
    const error = new Error('QBTC_MAINNET_RPC_URL is not configured.');
    (error as any).code = 'MAINNET_NOT_ACTIVE';
    throw error;
  }

  return { rpcUrl, rpcUser, rpcPass };
}

async function rpcCallMainnet(method: string, params: any[]): Promise<any> {
  const { rpcUrl, rpcUser, rpcPass } = resolveMainnetConfig();

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10000),
  });

  const data = (await response.json()) as any;
  if (data?.error) {
    const error = new Error(data.error.message || 'QBTC RPC error');
    (error as any).code = data.error.code;
    throw error;
  }

  return data?.result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const network = parseNetwork(req.query.network);

    if (network === 'mainnet') {
      // Mainnet uses a single node — keep the existing single-node response shape.
      const info = await rpcCallMainnet('getblockchaininfo', []);
      return res.status(200).json({
        ok: true,
        selectedNetwork: network,
        mainnetActive: true,
        chain: info?.chain || null,
        blocks: info?.blocks ?? null,
        headers: info?.headers ?? null,
        verificationProgress: info?.verificationprogress ?? null,
        dagmode: info?.dagmode ?? null,
        pqc: info?.pqc ?? null,
      });
    }

    // Testnet: probe all nodes and surface per-node health.
    const nodeStatuses = await probeAllNodes();
    const onlineNodes = nodeStatuses.filter((n) => n.ok);

    // Pick the best node (highest block count) as the canonical chain summary.
    const best = onlineNodes.sort((a, b) => (b.blocks ?? 0) - (a.blocks ?? 0))[0] ?? null;

    return res.status(200).json({
      ok: onlineNodes.length > 0,
      selectedNetwork: network,
      mainnetActive: false,
      // Canonical chain summary from the most up-to-date node.
      chain: best?.chain ?? null,
      blocks: best?.blocks ?? null,
      headers: best?.headers ?? null,
      verificationProgress: best?.verificationProgress ?? null,
      dagmode: best?.dagmode ?? null,
      pqc: best?.pqc ?? null,
      // Per-node health for network-at-a-glance visibility.
      nodes: nodeStatuses,
    });
  } catch (error: any) {
    if (error?.code === 'MAINNET_NOT_ACTIVE') {
      return res.status(503).json({
        ok: false,
        selectedNetwork: 'mainnet',
        mainnetActive: false,
        error: error.message,
      });
    }

    return res.status(502).json({
      ok: false,
      error: error?.message || 'Failed to reach QBTC RPC nodes',
    });
  }
}
