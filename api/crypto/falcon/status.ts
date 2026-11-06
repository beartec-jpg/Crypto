// Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FalconCloudError,
  getFalconCloudClient,
  hasFalconCloudApiKey,
} from '../../_lib/falconCloudClient.js';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!hasFalconCloudApiKey()) {
    return res.status(503).json({
      error: 'Falcon Cloud not configured',
      configured: false,
      env: 'FALCON_CLOUD_API_KEY',
    });
  }

  try {
    const client = getFalconCloudClient();
    const [status, usage] = await Promise.all([
      client.getStatusSummary(),
      client.getUsage().catch(() => null),
    ]);
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    return res.status(200).json({
      configured: true,
      source: 'falcon-cloud',
      status,
      usage,
    });
  } catch (err: any) {
    const e = err instanceof FalconCloudError ? err : null;
    const status = e?.status && e.status >= 400 ? e.status : 502;
    return res.status(status === 200 ? 502 : status).json({
      error: e?.message || err?.message || 'Falcon Cloud status failed',
      code: e?.code,
      configured: true,
    });
  }
}
