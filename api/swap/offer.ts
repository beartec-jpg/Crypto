import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool, toCamelCase } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, qbtcAmount, usdcAmountRequested } = req.body || {};

    // Validate required fields
    if (!sellerQbtcAddress || typeof sellerQbtcAddress !== 'string' || sellerQbtcAddress.length < 1) {
      return res.status(400).json({ error: 'sellerQbtcAddress is required' });
    }
    if (!sellerEvmAddress || typeof sellerEvmAddress !== 'string' || sellerEvmAddress.length < 1) {
      return res.status(400).json({ error: 'sellerEvmAddress is required' });
    }
    if (!sellerPubKeyHex || typeof sellerPubKeyHex !== 'string' || sellerPubKeyHex.length !== 66) {
      return res.status(400).json({ error: 'sellerPubKeyHex must be 66 hex chars (33-byte compressed pubkey)' });
    }
    if (!qbtcAmount || typeof qbtcAmount !== 'string' || qbtcAmount.length < 1) {
      return res.status(400).json({ error: 'qbtcAmount is required' });
    }
    if (!usdcAmountRequested || typeof usdcAmountRequested !== 'string' || usdcAmountRequested.length < 1) {
      return res.status(400).json({ error: 'usdcAmountRequested is required' });
    }

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO swap_offers (seller_qbtc_address, seller_evm_address, seller_pub_key_hex, qbtc_amount, usdc_amount_requested, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW())
       RETURNING *`,
      [sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, qbtcAmount, usdcAmountRequested]
    );

    return res.json(toCamelCase(result.rows[0]));
  } catch (error: any) {
    console.error('POST /api/swap/offer error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create swap offer' });
  }
}
