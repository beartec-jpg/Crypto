import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../../_lib/db';
import crypto from 'crypto';

const SWAP_QBTC_TIMELOCK_SECS = 48 * 3600;
const SWAP_EVM_TIMELOCK_SECS = 24 * 3600;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const offerId = req.query.offerId as string;
    if (!offerId) return res.status(400).json({ error: 'offerId is required' });

    const { buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex } = req.body || {};

    if (!buyerQbtcAddress || typeof buyerQbtcAddress !== 'string' || buyerQbtcAddress.length < 1) {
      return res.status(400).json({ error: 'buyerQbtcAddress is required' });
    }
    if (!buyerEvmAddress || typeof buyerEvmAddress !== 'string' || buyerEvmAddress.length < 1) {
      return res.status(400).json({ error: 'buyerEvmAddress is required' });
    }
    if (!buyerPubKeyHex || typeof buyerPubKeyHex !== 'string' || buyerPubKeyHex.length !== 66) {
      return res.status(400).json({ error: 'buyerPubKeyHex must be 66 hex chars (33-byte compressed pubkey)' });
    }

    const pool = getPool();

    // Fetch the offer
    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN') return res.status(409).json({ error: 'Offer is no longer open' });

    // Generate secret and compute SHA-256 hash
    const secretBytes = crypto.randomBytes(32);
    const secretHex = secretBytes.toString('hex');
    const secretHash = crypto.createHash('sha256').update(secretBytes).digest('hex');

    // Timelocks
    const now = Math.floor(Date.now() / 1000);
    const qbtcLocktime = now + SWAP_QBTC_TIMELOCK_SECS;
    const evmLocktime = now + SWAP_EVM_TIMELOCK_SECS;

    // Create the swap record
    const swapResult = await pool.query(
      `INSERT INTO atomic_swaps (
        offer_id, seller_qbtc_address, seller_evm_address, seller_pub_key_hex,
        buyer_qbtc_address, buyer_evm_address, buyer_pub_key_hex,
        qbtc_amount, usdc_amount, secret_hash, secret,
        qbtc_locktime, evm_locktime, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PENDING_QBTC_LOCK', NOW(), NOW())
      RETURNING *`,
      [
        offerId,
        offer.seller_qbtc_address, offer.seller_evm_address, offer.seller_pub_key_hex,
        buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex,
        offer.qbtc_amount, offer.usdc_amount_requested,
        secretHash, secretHex,
        qbtcLocktime, evmLocktime,
      ]
    );
    const swap = swapResult.rows[0];

    // Mark offer as matched
    await pool.query("UPDATE swap_offers SET status = 'MATCHED' WHERE id = $1", [offerId]);

    return res.json({
      swapId: swap.id,
      secretHash,
      qbtcLocktime,
      evmLocktime,
      sellerPubKeyHex: offer.seller_pub_key_hex,
      buyerPubKeyHex,
      qbtcAmount: offer.qbtc_amount,
      usdcAmount: offer.usdc_amount_requested,
    });
  } catch (error: any) {
    console.error('POST /api/swap/accept error:', error);
    return res.status(500).json({ error: error.message || 'Failed to accept swap offer' });
  }
}
