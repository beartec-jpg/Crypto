/**
 * QBTC Swap Server — Standalone Express API
 *
 * Serves all atomic-swap endpoints independently of the main CryptoSparse
 * Vercel deployment. Can run alongside a QBTC node on any test server.
 *
 * Usage:
 *   cp .env.example .env   # fill in real values
 *   npm install
 *   npm start
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const { Pool } = pg;

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3099;

const SWAP_QBTC_TIMELOCK_SECS = 48 * 3600; // 48 h
const SWAP_EVM_TIMELOCK_SECS  = 24 * 3600; // 24 h
const SWAP_EVM_GRACE_SECS     = 3600;       // 1 h grace
const MONITOR_POLL_MS         = 60_000;     // 60 s
// Maximum age of a signed challenge (prevents replay attacks)
const SIGNATURE_MAX_AGE_SECS  = 300;        // 5 min

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Verify that a timestamp is recent (within SIGNATURE_MAX_AGE_SECS).
 * Returns an error string or null if the timestamp is acceptable.
 */
function checkTimestamp(timestamp: number | string): string | null {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return 'timestamp must be a positive Unix timestamp (seconds)';
  const now = Math.floor(Date.now() / 1000);
  if (ts > now + 60) return 'timestamp is too far in the future';
  if (now - ts > SIGNATURE_MAX_AGE_SECS) return `timestamp is too old (max ${SIGNATURE_MAX_AGE_SECS}s)`;
  return null;
}

/**
 * Verify an Ethereum personal-sign signature.
 * Returns the lower-cased recovered address, or throws on any error.
 */
function recoverEvmSigner(message: string, signature: string): string {
  return ethers.verifyMessage(message, signature).toLowerCase();
}

/**
 * Assert that a signed canonical message was produced by the claimed EVM address.
 * Throws with a descriptive message if verification fails.
 */
function assertEvmSignature(message: string, signature: string, expectedAddress: string): void {
  let recovered: string;
  try {
    recovered = recoverEvmSigner(message, signature);
  } catch {
    throw Object.assign(new Error('Invalid EVM signature'), { statusCode: 400 });
  }
  if (recovered !== expectedAddress.toLowerCase()) {
    throw Object.assign(
      new Error('Signature does not match the claimed EVM address'),
      { statusCode: 403 },
    );
  }
}

// ─── Database ───────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') || process.env.DB_SSL === '1'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('[db] Pool error:', err.message));

/** Convert snake_case DB rows to camelCase for frontend compatibility. */
function toCamelCase<T = Record<string, any>>(row: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = row[k];
  }
  return out as T;
}

// ─── QBTC RPC helper ───────────────────────────────────────────────────────

async function qbtcRpcCall(method: string, params: any[] = []): Promise<any> {
  const rpcUrl  = process.env.QBTC_RPC_URL || 'http://127.0.0.1:28332';
  const rpcUser = process.env.QBTC_RPC_USER || '';
  const rpcPass = process.env.QBTC_RPC_PASSWORD || '';

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(rpcUser || rpcPass
        ? { Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64')}` }
        : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  if (!response.ok && !text) {
    throw new Error(`QBTC RPC returned HTTP ${response.status} (${response.statusText || 'no body'}) — check RPC credentials and node status`);
  }
  let data: any;
  try { data = JSON.parse(text); } catch {
    throw new Error(`QBTC RPC returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  if (data?.error) throw new Error(data.error.message || `QBTC RPC error: ${method}`);
  return data?.result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeHex32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Expected 32-byte hex value');
  return `0x${hex.toLowerCase()}`;
}

function qbtcToSats(value: string): bigint {
  return decimalToBaseUnits(value, 8);
}

function usdcToBaseUnits(value: string): bigint {
  return decimalToBaseUnits(value, 6);
}

function decimalToBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid decimal amount: ${value}`);
  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) throw new Error(`Too many decimal places (max ${decimals}): ${value}`);
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

// ─── Express app ────────────────────────────────────────────────────────────

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: corsOrigins.includes('*') ? '*' : corsOrigins }));
app.use(express.json());

// Serve cold-signer PWA
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coldSignerDir = path.join(__dirname, 'cold-signer-dist');
app.use('/cold-signer', express.static(coldSignerDir));
app.get('/cold-signer/*', (_req, res) => res.sendFile(path.join(coldSignerDir, 'index.html')));

// Health check
app.get('/api/swap/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── POST /api/swap/offer ───────────────────────────────────────────────────

app.post('/api/swap/offer', async (req, res) => {
  try {
    const { sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, qbtcAmount, usdcAmountRequested, secretHash, qbtcLocktime, signature, timestamp } = req.body || {};

    if (!sellerQbtcAddress || typeof sellerQbtcAddress !== 'string') return res.status(400).json({ error: 'sellerQbtcAddress is required' });
    if (!sellerEvmAddress  || typeof sellerEvmAddress  !== 'string') return res.status(400).json({ error: 'sellerEvmAddress is required' });
    if (!sellerPubKeyHex   || typeof sellerPubKeyHex   !== 'string' || sellerPubKeyHex.length !== 66) return res.status(400).json({ error: 'sellerPubKeyHex must be 66 hex chars' });
    if (!qbtcAmount        || typeof qbtcAmount        !== 'string') return res.status(400).json({ error: 'qbtcAmount is required' });
    if (!usdcAmountRequested || typeof usdcAmountRequested !== 'string') return res.status(400).json({ error: 'usdcAmountRequested is required' });
    // C-3: client-supplied secretHash (server never generates or stores the plaintext preimage)
    if (!secretHash || typeof secretHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(secretHash)) return res.status(400).json({ error: 'secretHash must be a 32-byte hex string (64 chars)' });
    if (!qbtcLocktime || !Number.isFinite(Number(qbtcLocktime)) || Number(qbtcLocktime) <= Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'qbtcLocktime must be a future Unix timestamp' });
    // C-4: timestamp-bounded EVM signature check
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    if (timestamp === undefined || timestamp === null) return res.status(400).json({ error: 'timestamp is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const canonicalMsg = `QBTC_SWAP:CREATE_OFFER:${sellerEvmAddress.toLowerCase()}:${qbtcAmount}:${usdcAmountRequested}:${secretHash.toLowerCase()}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, sellerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await pool.query(
      `INSERT INTO swap_offers (seller_qbtc_address, seller_evm_address, seller_pub_key_hex, qbtc_amount, usdc_amount_requested, secret_hash, qbtc_locktime, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', NOW()) RETURNING *`,
      [sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, qbtcAmount, usdcAmountRequested, secretHash.toLowerCase(), Number(qbtcLocktime)],
    );
    const offer = result.rows[0];

    // Record ask price tick
    const pricePerQbtc = parseFloat(usdcAmountRequested) / parseFloat(qbtcAmount);
    await pool.query(
      `INSERT INTO price_ticks (tick_type, price_per_qbtc, qbtc_amount, usdc_amount, offer_id, created_at) VALUES ('ASK', $1, $2, $3, $4, NOW())`,
      [pricePerQbtc, qbtcAmount, usdcAmountRequested, offer.id],
    );

    return res.json({ ...toCamelCase(offer), secretHash: offer.secret_hash, qbtcLocktime: offer.qbtc_locktime });
  } catch (err: any) {
    console.error('POST /api/swap/offer:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create offer' });
  }
});

// ─── GET /api/swap/offers ───────────────────────────────────────────────────

app.get('/api/swap/offers', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM swap_offers WHERE status IN ('OPEN', 'LOCKED') AND offer_type = 'ASK' ORDER BY created_at ASC`);
    // Never expose secret in offer listing — only secretHash
    const mapped = result.rows.map((row: any) => {
      const c = toCamelCase(row);
      delete (c as any).secret;
      return c;
    });
    return res.json(mapped);
  } catch (err: any) {
    console.error('GET /api/swap/offers:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch offers' });
  }
});

// ─── POST /api/swap/buy-offer ───────────────────────────────────────────────
// Buyer posts a BID: "I want to buy X QBTC and will pay Y USDC"

app.post('/api/swap/buy-offer', async (req, res) => {
  try {
    const { buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex, qbtcAmount, usdcAmountOffered, secretHash, qbtcLocktime, signature, timestamp } = req.body || {};

    if (!buyerQbtcAddress || typeof buyerQbtcAddress !== 'string') return res.status(400).json({ error: 'buyerQbtcAddress is required' });
    if (!buyerEvmAddress  || typeof buyerEvmAddress  !== 'string') return res.status(400).json({ error: 'buyerEvmAddress is required' });
    if (!buyerPubKeyHex   || typeof buyerPubKeyHex   !== 'string' || buyerPubKeyHex.length !== 66) return res.status(400).json({ error: 'buyerPubKeyHex must be 66 hex chars' });
    if (!qbtcAmount        || typeof qbtcAmount        !== 'string') return res.status(400).json({ error: 'qbtcAmount is required' });
    if (!usdcAmountOffered || typeof usdcAmountOffered !== 'string') return res.status(400).json({ error: 'usdcAmountOffered is required' });
    // C-3: client-supplied secretHash
    if (!secretHash || typeof secretHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(secretHash)) return res.status(400).json({ error: 'secretHash must be a 32-byte hex string (64 chars)' });
    if (!qbtcLocktime || !Number.isFinite(Number(qbtcLocktime)) || Number(qbtcLocktime) <= Math.floor(Date.now() / 1000)) return res.status(400).json({ error: 'qbtcLocktime must be a future Unix timestamp' });
    // C-4: timestamp-bounded EVM signature check
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    if (timestamp === undefined || timestamp === null) return res.status(400).json({ error: 'timestamp is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const canonicalMsg = `QBTC_SWAP:CREATE_BID:${buyerEvmAddress.toLowerCase()}:${qbtcAmount}:${usdcAmountOffered}:${secretHash.toLowerCase()}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, buyerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    const result = await pool.query(
      `INSERT INTO swap_offers (
        offer_type, buyer_qbtc_address, buyer_evm_address, buyer_pub_key_hex,
        qbtc_amount, usdc_amount_requested, secret_hash, qbtc_locktime, status, created_at
      ) VALUES ('BID', $1, $2, $3, $4, $5, $6, $7, 'OPEN', NOW()) RETURNING *`,
      [buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex, qbtcAmount, usdcAmountOffered, secretHash.toLowerCase(), Number(qbtcLocktime)],
    );
    const offer = result.rows[0];

    // Record BID price tick
    const pricePerQbtc = parseFloat(usdcAmountOffered) / parseFloat(qbtcAmount);
    await pool.query(
      `INSERT INTO price_ticks (tick_type, price_per_qbtc, qbtc_amount, usdc_amount, offer_id, created_at) VALUES ('BID', $1, $2, $3, $4, NOW())`,
      [pricePerQbtc, qbtcAmount, usdcAmountOffered, offer.id],
    );

    return res.json({ ...toCamelCase(offer), secretHash: offer.secret_hash, qbtcLocktime: offer.qbtc_locktime });
  } catch (err: any) {
    console.error('POST /api/swap/buy-offer:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create buy offer' });
  }
});

// ─── GET /api/swap/buy-offers ───────────────────────────────────────────────

app.get('/api/swap/buy-offers', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM swap_offers WHERE status IN ('OPEN', 'LOCKED') AND offer_type = 'BID' ORDER BY created_at ASC`);
    const mapped = result.rows.map((row: any) => {
      const c = toCamelCase(row);
      delete (c as any).secret;
      return c;
    });
    return res.json(mapped);
  } catch (err: any) {
    console.error('GET /api/swap/buy-offers:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch buy offers' });
  }
});

// ─── POST /api/swap/accept-buy/:offerId ─────────────────────────────────────
// Seller fulfills a BID by providing their QBTC address + keys

app.post('/api/swap/accept-buy/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, signature, timestamp } = req.body || {};

    if (!sellerQbtcAddress || typeof sellerQbtcAddress !== 'string') return res.status(400).json({ error: 'sellerQbtcAddress is required' });
    if (!sellerEvmAddress  || typeof sellerEvmAddress  !== 'string') return res.status(400).json({ error: 'sellerEvmAddress is required' });
    if (!sellerPubKeyHex   || typeof sellerPubKeyHex   !== 'string' || sellerPubKeyHex.length !== 66) return res.status(400).json({ error: 'sellerPubKeyHex must be 66 hex chars' });
    // C-4: timestamp-bounded EVM signature check
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    if (timestamp === undefined || timestamp === null) return res.status(400).json({ error: 'timestamp is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const canonicalMsg = `QBTC_SWAP:ACCEPT_BID:${offerId}:${sellerEvmAddress.toLowerCase()}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, sellerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Buy offer not found' });
    if (offer.offer_type !== 'BID') return res.status(409).json({ error: 'This is not a buy offer' });
    if (offer.status !== 'OPEN') return res.status(409).json({ error: 'Buy offer is no longer open' });

    const secretHash  = offer.secret_hash;
    if (!secretHash) return res.status(422).json({ error: 'Buy offer is missing secretHash' });

    const now          = Math.floor(Date.now() / 1000);
    const qbtcLocktime = offer.qbtc_locktime || (now + SWAP_QBTC_TIMELOCK_SECS);
    const evmLocktime  = now + SWAP_EVM_TIMELOCK_SECS;

    // C-3: secret is NOT propagated from the offer — it is never stored server-side.
    // The plaintext preimage will be written by the EVM monitor once it is
    // revealed on-chain by the buyer when they withdraw USDC.
    const swapResult = await pool.query(
      `INSERT INTO atomic_swaps (
        offer_id, seller_qbtc_address, seller_evm_address, seller_pub_key_hex,
        buyer_qbtc_address, buyer_evm_address, buyer_pub_key_hex,
        qbtc_amount, usdc_amount, secret_hash,
        qbtc_locktime, evm_locktime, status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING_QBTC_LOCK',NOW(),NOW()) RETURNING *`,
      [
        offerId,
        sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex,
        offer.buyer_qbtc_address, offer.buyer_evm_address, offer.buyer_pub_key_hex,
        offer.qbtc_amount, offer.usdc_amount_requested, secretHash,
        qbtcLocktime, evmLocktime,
      ],
    );
    const swap = swapResult.rows[0];

    // Mark the buy offer as MATCHED
    await pool.query("UPDATE swap_offers SET status = 'MATCHED', seller_qbtc_address = $1, seller_evm_address = $2, seller_pub_key_hex = $3 WHERE id = $4",
      [sellerQbtcAddress, sellerEvmAddress, sellerPubKeyHex, offerId]);

    const mapped = toCamelCase(swap);
    return res.json({
      ...(mapped as any),
      swapId: swap.id,
      secretHash,
      qbtcLocktime,
      evmLocktime,
      sellerPubKeyHex,
      buyerPubKeyHex: offer.buyer_pub_key_hex,
      qbtcAmount: offer.qbtc_amount,
      usdcAmount: offer.usdc_amount_requested,
    });
  } catch (err: any) {
    console.error('POST /api/swap/accept-buy:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to accept buy offer' });
  }
});

// ─── POST /api/swap/cancel/:offerId ─────────────────────────────────────────

app.post('/api/swap/cancel/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { signature, timestamp } = req.body || {};

    // C-4: timestamp-bounded EVM signature check
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    if (timestamp === undefined || timestamp === null) return res.status(400).json({ error: 'timestamp is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN' && offer.status !== 'LOCKED') {
      return res.status(409).json({ error: `Cannot cancel offer in status: ${offer.status}` });
    }

    // Identify the owner's EVM address from the DB (cannot be forged by client)
    const ownerEvmAddress: string = offer.offer_type === 'BID'
      ? (offer.buyer_evm_address || '')
      : (offer.seller_evm_address || '');
    if (!ownerEvmAddress) return res.status(422).json({ error: 'Offer is missing owner EVM address' });

    const canonicalMsg = `QBTC_SWAP:CANCEL:${offerId}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, ownerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    await pool.query("UPDATE swap_offers SET status = 'CANCELLED' WHERE id = $1", [offerId]);

    // If QBTC was locked, warn the seller they need to wait for the timelock to refund
    const wasLocked = offer.status === 'LOCKED' && offer.qbtc_htlc_txid;
    return res.json({
      status: 'CANCELLED',
      wasLocked: !!wasLocked,
      message: wasLocked
        ? 'Offer cancelled. Your QBTC is still locked in the HTLC — you can reclaim it after the timelock expires.'
        : 'Offer cancelled.',
    });
  } catch (err: any) {
    console.error('POST /api/swap/cancel:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to cancel offer' });
  }
});

// ─── POST /api/swap/accept/:offerId ─────────────────────────────────────────

app.post('/api/swap/accept/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex, signature, timestamp } = req.body || {};

    if (!buyerQbtcAddress || typeof buyerQbtcAddress !== 'string') return res.status(400).json({ error: 'buyerQbtcAddress is required' });
    if (!buyerEvmAddress  || typeof buyerEvmAddress  !== 'string') return res.status(400).json({ error: 'buyerEvmAddress is required' });
    if (!buyerPubKeyHex   || typeof buyerPubKeyHex   !== 'string' || buyerPubKeyHex.length !== 66) return res.status(400).json({ error: 'buyerPubKeyHex must be 66 hex chars' });
    // C-4: timestamp-bounded EVM signature check
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    if (timestamp === undefined || timestamp === null) return res.status(400).json({ error: 'timestamp is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const canonicalMsg = `QBTC_SWAP:ACCEPT:${offerId}:${buyerEvmAddress.toLowerCase()}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, buyerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN' && offer.status !== 'LOCKED') return res.status(409).json({ error: 'Offer is no longer open' });

    const secretHash  = offer.secret_hash;
    if (!secretHash) return res.status(422).json({ error: 'Offer is missing secretHash (legacy offer)' });

    const now          = Math.floor(Date.now() / 1000);
    const qbtcLocktime = offer.qbtc_locktime || (now + SWAP_QBTC_TIMELOCK_SECS);
    const evmLocktime  = now + SWAP_EVM_TIMELOCK_SECS;

    // Determine initial status based on whether seller already locked QBTC
    const initialStatus = offer.qbtc_htlc_txid ? 'QBTC_LOCKED' : 'PENDING_QBTC_LOCK';

    // C-3: secret is NOT propagated from the offer — the plaintext preimage is
    // never stored server-side. The EVM monitor will write it once it is
    // revealed on-chain by the seller when they withdraw USDC.
    const swapResult = await pool.query(
      `INSERT INTO atomic_swaps (
        offer_id, seller_qbtc_address, seller_evm_address, seller_pub_key_hex,
        buyer_qbtc_address, buyer_evm_address, buyer_pub_key_hex,
        qbtc_amount, usdc_amount, secret_hash,
        qbtc_htlc_txid, qbtc_htlc_address,
        qbtc_locktime, evm_locktime, status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()) RETURNING *`,
      [
        offerId,
        offer.seller_qbtc_address, offer.seller_evm_address, offer.seller_pub_key_hex,
        buyerQbtcAddress, buyerEvmAddress, buyerPubKeyHex,
        offer.qbtc_amount, offer.usdc_amount_requested,
        secretHash,
        offer.qbtc_htlc_txid || null, offer.qbtc_htlc_address || null,
        qbtcLocktime, evmLocktime, initialStatus,
      ],
    );
    const swap = swapResult.rows[0];

    await pool.query("UPDATE swap_offers SET status = 'MATCHED' WHERE id = $1", [offerId]);

    return res.json({
      swapId: swap.id,
      secretHash,
      qbtcLocktime,
      evmLocktime,
      sellerPubKeyHex: offer.seller_pub_key_hex,
      sellerEvmAddress: offer.seller_evm_address,
      buyerPubKeyHex,
      qbtcAmount: offer.qbtc_amount,
      usdcAmount: offer.usdc_amount_requested,
      status: initialStatus,
      qbtcHtlcTxid: offer.qbtc_htlc_txid || null,
      qbtcHtlcAddress: offer.qbtc_htlc_address || null,
    });
  } catch (err: any) {
    console.error('POST /api/swap/accept:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to accept offer' });
  }
});

// ─── GET /api/swap/stats — marketplace TX statistics + price history ────────

app.get('/api/swap/stats', async (_req, res) => {
  try {
    // Aggregate offer stats
    const offerStats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_offers,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_offers,
        COUNT(*) FILTER (WHERE status = 'LOCKED')::int AS locked_offers,
        COUNT(*) FILTER (WHERE status = 'MATCHED')::int AS matched_offers,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_offers,
        COALESCE(SUM(qbtc_amount::numeric) FILTER (WHERE status IN ('LOCKED','MATCHED')), 0) AS total_qbtc_listed
      FROM swap_offers
    `);

    // Aggregate swap stats
    const swapStats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_swaps,
        COUNT(*) FILTER (WHERE status = 'COMPLETE')::int AS completed_swaps,
        COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired_swaps,
        COUNT(*) FILTER (WHERE status IN ('PENDING_QBTC_LOCK','QBTC_LOCKED','EVM_LOCKED'))::int AS active_swaps,
        COALESCE(SUM(qbtc_amount::numeric) FILTER (WHERE status = 'COMPLETE'), 0) AS total_qbtc_volume,
        COALESCE(SUM(usdc_amount::numeric) FILTER (WHERE status = 'COMPLETE'), 0) AS total_usdc_volume
      FROM atomic_swaps
    `);

    // Price history: all ticks from price_ticks table (ASK + TRADE)
    const ticksResult = await pool.query(`
      SELECT id, tick_type, price_per_qbtc::numeric AS price, qbtc_amount::numeric AS qbtc, usdc_amount::numeric AS usdc, offer_id, swap_id, created_at
      FROM price_ticks
      ORDER BY created_at ASC
    `);

    const priceTicks = ticksResult.rows.map((r: any) => ({
      id: r.id,
      type: r.tick_type,
      time: r.created_at,
      pricePerQbtc: parseFloat(parseFloat(r.price).toFixed(6)),
      qbtcAmount: parseFloat(r.qbtc),
      usdcAmount: parseFloat(r.usdc),
      offerId: r.offer_id,
      swapId: r.swap_id,
    }));

    // Also include open/locked offers as "ask" prices for current market view
    const askPrices = await pool.query(`
      SELECT
        id,
        qbtc_amount::numeric AS qbtc,
        usdc_amount_requested::numeric AS usdc,
        created_at
      FROM swap_offers
      WHERE status IN ('OPEN', 'LOCKED') AND offer_type = 'ASK' AND qbtc_amount::numeric > 0
      ORDER BY created_at ASC
    `);

    const currentAsks = askPrices.rows.map((r: any) => ({
      offerId: r.id,
      pricePerQbtc: parseFloat((r.usdc / r.qbtc).toFixed(6)),
      qbtcAmount: parseFloat(r.qbtc),
      usdcAmount: parseFloat(r.usdc),
    }));

    // Current open BID offers
    const bidPrices = await pool.query(`
      SELECT
        id,
        qbtc_amount::numeric AS qbtc,
        usdc_amount_requested::numeric AS usdc,
        created_at
      FROM swap_offers
      WHERE status IN ('OPEN', 'LOCKED') AND offer_type = 'BID' AND qbtc_amount::numeric > 0
      ORDER BY created_at ASC
    `);

    const currentBids = bidPrices.rows.map((r: any) => ({
      offerId: r.id,
      pricePerQbtc: parseFloat((r.usdc / r.qbtc).toFixed(6)),
      qbtcAmount: parseFloat(r.qbtc),
      usdcAmount: parseFloat(r.usdc),
    }));

    const o = offerStats.rows[0] || {};
    const s = swapStats.rows[0] || {};

    return res.json({
      offers: {
        total: o.total_offers || 0,
        open: o.open_offers || 0,
        locked: o.locked_offers || 0,
        matched: o.matched_offers || 0,
        cancelled: o.cancelled_offers || 0,
        totalQbtcListed: parseFloat(o.total_qbtc_listed) || 0,
      },
      swaps: {
        total: s.total_swaps || 0,
        completed: s.completed_swaps || 0,
        expired: s.expired_swaps || 0,
        active: s.active_swaps || 0,
        totalQbtcVolume: parseFloat(s.total_qbtc_volume) || 0,
        totalUsdcVolume: parseFloat(s.total_usdc_volume) || 0,
      },
      priceHistory: priceTicks.filter((t: any) => t.type === 'TRADE'),
      priceTicks,
      currentAsks,
      currentBids,
    });
  } catch (err: any) {
    console.error('GET /api/swap/stats:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
});

// ─── GET /api/swap/by-address ───────────────────────────────────────────────

app.get('/api/swap/by-address', async (req, res) => {
  try {
    const qbtcAddress = String(req.query.qbtcAddress || '').trim();
    if (!qbtcAddress) return res.status(400).json({ error: 'qbtcAddress query param is required' });

    const result = await pool.query(
      `SELECT * FROM atomic_swaps
       WHERE seller_qbtc_address = $1 OR buyer_qbtc_address = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [qbtcAddress],
    );

    const swaps = result.rows.map((row: any) => {
      const mapped = toCamelCase(row);
      return { ...mapped, secret: row.status === 'COMPLETE' ? row.secret : null };
    });
    return res.json(swaps);
  } catch (err: any) {
    console.error('GET /api/swap/by-address:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch swaps' });
  }
});

// ─── GET /api/swap/:swapId ──────────────────────────────────────────────────

app.get('/api/swap/:swapId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [req.params.swapId]);
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });

    const mapped = toCamelCase(swap);
    return res.json({ ...mapped, secret: swap.status === 'COMPLETE' ? swap.secret : null });
  } catch (err: any) {
    console.error('GET /api/swap/:swapId:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch swap' });
  }
});

// ─── POST /api/swap/lock/qbtc ───────────────────────────────────────────────

// ─── POST /api/swap/lock/offer ──────────────────────────────────────────────
// Lock QBTC against an offer (seller locks BEFORE any buyer accepts)

app.post('/api/swap/lock/offer', async (req, res) => {
  try {
    const { offerId, qbtcHtlcTxid, qbtcHtlcAddress } = req.body || {};
    if (!offerId || !qbtcHtlcTxid || !qbtcHtlcAddress) {
      return res.status(400).json({ error: 'offerId, qbtcHtlcTxid, and qbtcHtlcAddress are required' });
    }

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN') return res.status(409).json({ error: `Cannot lock QBTC for offer in status: ${offer.status}` });

    // Verify HTLC transaction on-chain
    try {
      const tx = await qbtcRpcCall('getrawtransaction', [qbtcHtlcTxid, true]);
      const expectedMinSats = qbtcToSats(offer.qbtc_amount);
      const target = String(qbtcHtlcAddress).toLowerCase();

      let matched = false;
      for (const vout of tx?.vout || []) {
        const spk = vout?.scriptPubKey || {};
        const addrs: string[] = [
          ...(spk?.address ? [String(spk.address)] : []),
          ...(Array.isArray(spk?.addresses) ? spk.addresses.map(String) : []),
        ];
        if (!addrs.some((a) => a.toLowerCase() === target)) continue;
        const val = typeof vout?.value === 'number' ? vout.value.toFixed(8) : String(vout?.value ?? '0');
        if (qbtcToSats(val) >= expectedMinSats) { matched = true; break; }
      }
      if (!matched) return res.status(422).json({ error: 'QBTC HTLC tx does not contain the expected funding output' });
    } catch (rpcErr: any) {
      return res.status(422).json({ error: `QBTC HTLC txid not found on chain: ${rpcErr.message}` });
    }

    await pool.query(
      `UPDATE swap_offers SET qbtc_htlc_txid = $1, qbtc_htlc_address = $2, status = 'LOCKED' WHERE id = $3`,
      [qbtcHtlcTxid, qbtcHtlcAddress, offerId],
    );
    return res.json({ status: 'LOCKED', offerId });
  } catch (err: any) {
    console.error('POST /api/swap/lock/offer:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record offer QBTC lock' });
  }
});

// ─── POST /api/swap/lock/qbtc ───────────────────────────────────────────────

app.post('/api/swap/lock/qbtc', async (req, res) => {
  try {
    const { swapId, qbtcHtlcTxid, qbtcHtlcAddress } = req.body || {};
    if (!swapId || !qbtcHtlcTxid || !qbtcHtlcAddress) {
      return res.status(400).json({ error: 'swapId, qbtcHtlcTxid, and qbtcHtlcAddress are required' });
    }

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'PENDING_QBTC_LOCK') {
      return res.status(409).json({ error: `Cannot lock QBTC in status: ${swap.status}` });
    }

    // Verify HTLC transaction on-chain
    try {
      const tx = await qbtcRpcCall('getrawtransaction', [qbtcHtlcTxid, true]);
      const expectedMinSats = qbtcToSats(swap.qbtc_amount);
      const target = String(qbtcHtlcAddress).toLowerCase();

      let matched = false;
      for (const vout of tx?.vout || []) {
        const spk = vout?.scriptPubKey || {};
        const addrs: string[] = [
          ...(spk?.address ? [String(spk.address)] : []),
          ...(Array.isArray(spk?.addresses) ? spk.addresses.map(String) : []),
        ];
        if (!addrs.some((a) => a.toLowerCase() === target)) continue;
        const val = typeof vout?.value === 'number' ? vout.value.toFixed(8) : String(vout?.value ?? '0');
        if (qbtcToSats(val) >= expectedMinSats) { matched = true; break; }
      }
      if (!matched) return res.status(422).json({ error: 'QBTC HTLC tx does not contain the expected funding output' });
    } catch (rpcErr: any) {
      return res.status(422).json({ error: `QBTC HTLC txid not found on chain: ${rpcErr.message}` });
    }

    await pool.query(
      `UPDATE atomic_swaps SET qbtc_htlc_txid = $1, qbtc_htlc_address = $2, status = 'QBTC_LOCKED', updated_at = NOW() WHERE id = $3`,
      [qbtcHtlcTxid, qbtcHtlcAddress, swapId],
    );
    return res.json({ status: 'QBTC_LOCKED' });
  } catch (err: any) {
    console.error('POST /api/swap/lock/qbtc:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record QBTC lock' });
  }
});

// ─── POST /api/swap/lock/evm ────────────────────────────────────────────────

app.post('/api/swap/lock/evm', async (req, res) => {
  try {
    const { swapId, evmContractId } = req.body || {};
    if (!swapId || !evmContractId) return res.status(400).json({ error: 'swapId and evmContractId are required' });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'QBTC_LOCKED') return res.status(409).json({ error: `Cannot record EVM lock in status: ${swap.status}` });

    const evmRpcUrl   = process.env.EVM_RPC_URL || '';
    const htlcAddress = process.env.EVM_HTLC_CONTRACT || '';
    const expectedUsdc = process.env.USDC_CONTRACT || '';
    if (!evmRpcUrl || !htlcAddress) return res.status(503).json({ error: 'EVM swap verifier is not configured' });

    try {
      const provider = new ethers.JsonRpcProvider(evmRpcUrl);
      const htlcAbi = [
        'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
      ];
      const htlc = new ethers.Contract(htlcAddress, htlcAbi, provider);
      const normalizedId = normalizeHex32(String(evmContractId));
      const d = await htlc.getContract(normalizedId);

      const receiver      = String(d[1] || '').toLowerCase();
      const tokenContract = String(d[2] || '').toLowerCase();
      const amount: bigint  = BigInt(d[3] || 0n);
      const hashlock      = String(d[4] || '').toLowerCase();
      const timelock: bigint = BigInt(d[5] || 0n);
      const withdrawn: boolean = Boolean(d[6]);
      const refunded: boolean  = Boolean(d[7]);

      const expectedHash     = normalizeHex32(String(swap.secret_hash)).toLowerCase();
      const expectedReceiver = String(swap.seller_evm_address || '').toLowerCase();
      const expectedTimelock = BigInt(swap.evm_locktime || 0);
      const expectedAmount   = usdcToBaseUnits(String(swap.usdc_amount));

      if (withdrawn || refunded) return res.status(422).json({ error: 'EVM HTLC is already settled/refunded' });
      if (hashlock !== expectedHash) return res.status(422).json({ error: 'EVM HTLC hashlock mismatch' });
      if (receiver !== expectedReceiver) return res.status(422).json({ error: 'EVM HTLC receiver mismatch' });
      if (timelock !== expectedTimelock) return res.status(422).json({ error: 'EVM HTLC timelock mismatch' });
      if (amount !== expectedAmount) return res.status(422).json({ error: 'EVM HTLC amount mismatch' });
      if (expectedUsdc && tokenContract !== expectedUsdc.toLowerCase()) return res.status(422).json({ error: 'EVM HTLC token contract mismatch' });
    } catch (verifyErr: any) {
      return res.status(422).json({ error: `Failed to verify EVM HTLC: ${verifyErr.message}` });
    }

    await pool.query(
      `UPDATE atomic_swaps SET evm_contract_id = $1, status = 'EVM_LOCKED', updated_at = NOW() WHERE id = $2`,
      [evmContractId, swapId],
    );
    return res.json({ status: 'EVM_LOCKED' });
  } catch (err: any) {
    console.error('POST /api/swap/lock/evm:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record EVM lock' });
  }
});

// ─── POST /api/swap/secret/seller ───────────────────────────────────────────

app.post('/api/swap/secret/seller', async (req, res) => {
  try {
    const { swapId, signature } = req.body || {};
    if (!swapId || !signature) return res.status(400).json({ error: 'swapId and signature are required' });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'EVM_LOCKED' && swap.status !== 'COMPLETE') return res.status(409).json({ error: `Secret unavailable in status: ${swap.status}` });
    if (!swap.qbtc_htlc_txid || !swap.evm_contract_id) return res.status(409).json({ error: 'Swap lock legs incomplete' });
    if (!swap.secret) return res.status(422).json({ error: 'Secret not available yet' });

    const message = `QBTC_SWAP_SECRET:${swap.id}`;
    let recovered = '';
    try { recovered = ethers.verifyMessage(message, String(signature)).toLowerCase(); } catch { return res.status(400).json({ error: 'Invalid seller signature' }); }
    if (recovered !== String(swap.seller_evm_address).toLowerCase()) return res.status(403).json({ error: 'Signature mismatch' });

    return res.json({ swapId: swap.id, message, secret: swap.secret });
  } catch (err: any) {
    console.error('POST /api/swap/secret/seller:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to retrieve secret' });
  }
});

// ─── POST /api/swap/claim/qbtc — Record buyer's QBTC claim txid ────────────

app.post('/api/swap/claim/qbtc', async (req, res) => {
  try {
    const { swapId, claimTxid } = req.body || {};
    if (!swapId || !claimTxid) return res.status(400).json({ error: 'swapId and claimTxid required' });

    const result = await pool.query('SELECT * FROM atomic_swaps WHERE id = $1', [swapId]);
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'COMPLETE') return res.status(409).json({ error: 'Swap is not COMPLETE' });

    await pool.query(
      `UPDATE atomic_swaps SET buyer_qbtc_claim_txid = $1, updated_at = NOW() WHERE id = $2`,
      [claimTxid, swapId],
    );

    return res.json({ ok: true, claimTxid });
  } catch (err: any) {
    console.error('POST /api/swap/claim/qbtc:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record claim' });
  }
});

// ─── EVM Withdraw Monitor ───────────────────────────────────────────────────

async function pollEvmLocked() {
  const evmRpcUrl   = process.env.EVM_RPC_URL || '';
  const htlcAddress = process.env.EVM_HTLC_CONTRACT || '';
  if (!evmRpcUrl || !htlcAddress) return;

  try {
    const provider = new ethers.JsonRpcProvider(evmRpcUrl);
    const htlcAbi = [
      'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
    ];
    const htlc = new ethers.Contract(htlcAddress, htlcAbi, provider);

    const result = await pool.query(`SELECT * FROM atomic_swaps WHERE status = 'EVM_LOCKED'`);
    for (const swap of result.rows) {
      if (!swap.evm_contract_id) continue;
      try {
        const id = swap.evm_contract_id.startsWith('0x') ? swap.evm_contract_id : `0x${swap.evm_contract_id}`;
        const d = await htlc.getContract(id);
        const withdrawn: boolean = d[6];
        const preimage: string   = d[8];

        if (withdrawn && preimage && preimage !== ethers.ZeroHash) {
          const secretHex = preimage.startsWith('0x') ? preimage.slice(2) : preimage;
          const revealedHash = crypto.createHash('sha256').update(Buffer.from(secretHex, 'hex')).digest('hex');
          if (revealedHash !== String(swap.secret_hash).toLowerCase()) {
            console.error(`[monitor] Hash mismatch for swap ${swap.id}`);
            continue;
          }
          await pool.query(`UPDATE atomic_swaps SET secret = $1, status = 'COMPLETE', updated_at = NOW() WHERE id = $2`, [secretHex, swap.id]);
          console.log(`[monitor] Swap ${swap.id} → COMPLETE`);

          // Record trade price tick
          const qbtcAmt = parseFloat(swap.qbtc_amount);
          const usdcAmt = parseFloat(swap.usdc_amount);
          if (qbtcAmt > 0) {
            const tradePrice = usdcAmt / qbtcAmt;
            await pool.query(
              `INSERT INTO price_ticks (tick_type, price_per_qbtc, qbtc_amount, usdc_amount, swap_id, created_at) VALUES ('TRADE', $1, $2, $3, $4, NOW())`,
              [tradePrice, swap.qbtc_amount, swap.usdc_amount, swap.id],
            );
          }
        } else {
          const now = Math.floor(Date.now() / 1000);
          const refunded: boolean = d[7];
          if (refunded || (swap.evm_locktime && now > swap.evm_locktime + SWAP_EVM_GRACE_SECS)) {
            await pool.query(`UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [swap.id]);
            console.log(`[monitor] Swap ${swap.id} → EXPIRED`);
          }
        }
      } catch (swapErr: any) {
        console.error(`[monitor] Swap ${swap.id}:`, swapErr?.message);
      }
    }
  } catch (err: any) {
    console.error('[monitor] Poll error:', err?.message);
  }
}

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[swap-server] Listening on 0.0.0.0:${PORT}`);
  console.log(`[swap-server] Health check: http://localhost:${PORT}/api/swap/health`);

  // Ensure buyer_qbtc_claim_txid column exists
  try {
    await pool.query(`ALTER TABLE atomic_swaps ADD COLUMN IF NOT EXISTS buyer_qbtc_claim_txid TEXT`);
    console.log(`[swap-server] DB migration: buyer_qbtc_claim_txid column ensured`);
  } catch (err: any) {
    console.error('[swap-server] DB migration error:', err.message);
  }

  // Start EVM withdraw monitor
  setInterval(pollEvmLocked, MONITOR_POLL_MS);
  console.log(`[swap-server] EVM withdraw monitor started (${MONITOR_POLL_MS / 1000}s interval)`);
});
