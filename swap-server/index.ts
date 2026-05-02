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
import rateLimit from 'express-rate-limit';

const { Pool } = pg;

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3099;

const SWAP_QBTC_TIMELOCK_SECS     = 48 * 3600; // 48 h
const SWAP_EVM_TIMELOCK_SECS      = 24 * 3600; // 24 h
const SWAP_EVM_GRACE_SECS         = 3600;       // 1 h grace
const MONITOR_POLL_MS             = 60_000;     // 60 s
// Maximum age of a signed challenge (prevents replay attacks)
const SIGNATURE_MAX_AGE_SECS      = 300;        // 5 min
// How far in the future a client timestamp may be (clock skew tolerance)
const SIGNATURE_FUTURE_TOLERANCE_SECS = 60;     // 1 min

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Verify that a timestamp is recent (within SIGNATURE_MAX_AGE_SECS).
 * Returns an error string or null if the timestamp is acceptable.
 */
function checkTimestamp(timestamp: number | string): string | null {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return 'timestamp must be a positive Unix timestamp (seconds)';
  const now = Math.floor(Date.now() / 1000);
  if (ts > now + SIGNATURE_FUTURE_TOLERANCE_SECS) return 'timestamp is too far in the future';
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

/** Build the canonical signed message for each swap action. */
function buildCanonicalMessage(action: 'CREATE_OFFER', evmAddress: string, qbtcAmount: string, usdcAmount: string, secretHash: string, timestamp: number): string;
function buildCanonicalMessage(action: 'CREATE_BID', evmAddress: string, qbtcAmount: string, usdcAmount: string, secretHash: string, timestamp: number): string;
function buildCanonicalMessage(action: 'ACCEPT', offerId: string, evmAddress: string, timestamp: number): string;
function buildCanonicalMessage(action: 'ACCEPT_BID', offerId: string, evmAddress: string, timestamp: number): string;
function buildCanonicalMessage(action: 'CANCEL', offerId: string, timestamp: number): string;
function buildCanonicalMessage(action: 'LOCK_OFFER', offerId: string, qbtcHtlcTxid: string, timestamp: number): string;
function buildCanonicalMessage(action: 'LOCK_QBTC', swapId: string, qbtcHtlcTxid: string, timestamp: number): string;
function buildCanonicalMessage(action: 'SECRET_SELLER', swapId: string, timestamp: number): string;
function buildCanonicalMessage(action: 'CLAIM_QBTC', swapId: string, claimTxid: string, timestamp: number): string;
function buildCanonicalMessage(action: string, ...args: (string | number)[]): string {
  return `QBTC_SWAP:${action}:${args.join(':')}`;
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

// ─── Phase 3: Multi-chain pair support ───────────────────────────────────────

const V2_SUPPORTED_CHAINS = ['QBTC', 'BTC', 'ETH', 'BNB', 'USDC', 'XRP'] as const;
type V2ChainId = typeof V2_SUPPORTED_CHAINS[number];

/**
 * Validate that base and quote are distinct, supported chains.
 * Throws 400 if invalid.
 */
function validatePair(base: unknown, quote: unknown): asserts base is V2ChainId {
  if (typeof base !== 'string' || !V2_SUPPORTED_CHAINS.includes(base as V2ChainId)) {
    throw Object.assign(new Error(`Unsupported base chain: ${base}`), { statusCode: 400 });
  }
  if (typeof quote !== 'string' || !V2_SUPPORTED_CHAINS.includes(quote as V2ChainId)) {
    throw Object.assign(new Error(`Unsupported quote chain: ${quote}`), { statusCode: 400 });
  }
  if (base === quote) {
    throw Object.assign(new Error('base and quote chains must differ'), { statusCode: 400 });
  }
}

// ─── v2 canonical message builders ───────────────────────────────────────────

/** v2 canonical messages include the pair so they can't be replayed across pairs. */
function buildV2Message(
  action: string,
  baseChain: string,
  quoteChain: string,
  ...parts: (string | number)[]
): string {
  return `QBTC_SWAP_V2:${action}:${baseChain}:${quoteChain}:${parts.join(':')}`;
}

// ─── Chain lock verification helper ──────────────────────────────────────────

/**
 * Verify a lock on any supported chain.
 *
 * For EVM chains (USDC/ETH/BNB): queries the HTLC contract via ethers.
 * For QBTC: queries the QBTC node RPC.
 * For BTC: queries Blockstream Esplora.
 * For XRP: checks the escrow object exists on the ledger.
 *
 * Returns { valid: true } if confirmed, { valid: false, reason } otherwise.
 */
async function verifyLockOnChain(
  chain: string,
  lockId: string,
  expectedAmount: string,
  expectedSecretHash: string,
  lockAddress?: string,
): Promise<{ valid: boolean; reason?: string }> {
  try {
    switch (chain) {
      case 'USDC':
      case 'ETH':
      case 'BNB':
        return await _verifyEvmLock(chain, lockId, expectedAmount, expectedSecretHash);
      case 'QBTC':
        return await _verifyQbtcLock(lockId, expectedAmount, lockAddress);
      case 'BTC':
        return await _verifyBtcLock(lockId, expectedAmount);
      case 'XRP':
        return await _verifyXrpLock(lockId, expectedAmount, expectedSecretHash);
      default:
        return { valid: false, reason: `Unknown chain: ${chain}` };
    }
  } catch (err: any) {
    return { valid: false, reason: err.message };
  }
}

async function _verifyEvmLock(
  chain: string,
  lockId: string,
  expectedAmount: string,
  expectedSecretHash: string,
): Promise<{ valid: boolean; reason?: string }> {
  const rpcUrl      = chain === 'ETH'  ? (process.env.ETH_RPC_URL  || process.env.EVM_RPC_URL || '')
                    : chain === 'BNB'  ? (process.env.BNB_RPC_URL  || '')
                    : (process.env.EVM_RPC_URL || '');
  const htlcAddr    = chain === 'ETH'  ? (process.env.ETH_HTLC_CONTRACT || '')
                    : chain === 'BNB'  ? (process.env.BNB_HTLC_CONTRACT || '')
                    : (process.env.EVM_HTLC_CONTRACT || '');
  const isNative    = chain !== 'USDC';

  if (!rpcUrl || !htlcAddr) return { valid: false, reason: `${chain} RPC not configured` };

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const htlcAbi = isNative
    ? ['function getContract(bytes32 contractId) view returns (address sender, address receiver, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)']
    : ['function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)'];

  const htlc = new ethers.Contract(htlcAddr, htlcAbi, provider);
  const id   = lockId.startsWith('0x') ? lockId : `0x${lockId}`;
  const d    = await htlc.getContract(id);

  const amountIdx   = isNative ? 2 : 3;
  const hashlockIdx = isNative ? 3 : 4;
  const withdrawnIdx = isNative ? 5 : 6;
  const refundedIdx  = isNative ? 6 : 7;

  if (d[withdrawnIdx]) return { valid: false, reason: 'Already withdrawn' };
  if (d[refundedIdx])  return { valid: false, reason: 'Already refunded' };

  const expectedHash = normalizeHex32(expectedSecretHash).toLowerCase();
  const actualHash   = String(d[hashlockIdx]).toLowerCase();
  if (expectedHash !== actualHash) return { valid: false, reason: 'Hashlock mismatch' };

  const decimals = isNative ? 18 : 6;
  const expectedUnits = decimalToBaseUnits(expectedAmount, decimals);
  const actualAmount: bigint = BigInt(d[amountIdx]);
  if (actualAmount < expectedUnits) return { valid: false, reason: `Amount too low: got ${actualAmount}, need ${expectedUnits}` };

  return { valid: true };
}

async function _verifyQbtcLock(
  lockId: string,
  expectedAmount: string,
  lockAddress?: string,
): Promise<{ valid: boolean; reason?: string }> {
  // lockId format: "txid:vout" or just "txid" (vout defaults to 0)
  const [txid, voutStr] = lockId.split(':');
  const vout = parseInt(voutStr || '0', 10);

  const expectedSats = qbtcToSats(expectedAmount);

  // Primary: getrawtransaction (works when txindex enabled or tx still in mempool)
  try {
    const tx = await qbtcRpcCall('getrawtransaction', [txid, true]);
    if (tx) {
      if (!tx.confirmations || tx.confirmations < 1) return { valid: false, reason: 'Transaction not confirmed' };
      const voutData = tx.vout?.[vout];
      if (!voutData) return { valid: false, reason: `vout ${vout} not found in tx` };
      const val = typeof voutData.value === 'number' ? voutData.value.toFixed(8) : String(voutData.value ?? '0');
      if (qbtcToSats(val) < expectedSats) return { valid: false, reason: 'Amount too low' };
      return { valid: true };
    }
  } catch {
    // getrawtransaction fails once TX is mined on nodes without txindex — fall through to scantxoutset
  }

  // Fallback: scantxoutset — queries the confirmed UTXO set directly, no txindex needed
  if (!lockAddress) return { valid: false, reason: 'Transaction not confirmed (txindex disabled; lockAddress required for fallback)' };
  try {
    const scan: any = await qbtcRpcCall('scantxoutset', ['start', [{ desc: `addr(${lockAddress})` }]]);
    if (!scan || !scan.unspents) return { valid: false, reason: 'Transaction not confirmed' };
    const match = (scan.unspents as any[]).find((u: any) => u.txid === txid && Number(u.vout) === vout);
    if (!match) return { valid: false, reason: 'Transaction not confirmed' };
    const val = typeof match.amount === 'number' ? match.amount.toFixed(8) : String(match.amount ?? '0');
    if (qbtcToSats(val) < expectedSats) return { valid: false, reason: 'Amount too low' };
    return { valid: true };
  } catch (err: any) {
    return { valid: false, reason: `QBTC RPC error: ${err.message}` };
  }
}

async function _verifyBtcLock(
  lockId: string,
  expectedAmount: string,
): Promise<{ valid: boolean; reason?: string }> {
  const [txid, voutStr] = lockId.split(':');
  const vout = parseInt(voutStr || '0', 10);
  const esploraBase = process.env.BTC_ESPLORA_URL || 'https://blockstream.info/testnet';

  const resp = await fetch(`${esploraBase}/api/tx/${txid}`, { signal: AbortSignal.timeout(10_000) });
  if (resp.status === 404) return { valid: false, reason: 'Transaction not confirmed' }; // not yet indexed — treat as unconfirmed
  if (!resp.ok) return { valid: false, reason: `Esplora returned ${resp.status}` };

  const tx = await resp.json() as any;
  if (!tx.status?.confirmed) return { valid: false, reason: 'Transaction not confirmed' };

  const output = tx.vout?.[vout];
  if (!output) return { valid: false, reason: `vout ${vout} not found` };

  // BTC amounts in satoshis from Esplora
  const expectedSats = qbtcToSats(expectedAmount); // same 8-decimal unit
  if (BigInt(output.value) < expectedSats) return { valid: false, reason: 'Amount too low' };

  return { valid: true };
}

async function _verifyXrpLock(
  lockId: string,
  _expectedAmount: string,
  _expectedSecretHash: string,
): Promise<{ valid: boolean; reason?: string }> {
  const wsUrl = process.env.XRPL_WS_URL;
  if (!wsUrl) return { valid: false, reason: 'XRPL_WS_URL not configured' };

  const [account, seqStr] = lockId.split(':');
  if (!account || !seqStr) return { valid: false, reason: 'Invalid XRP lockId (expected account:sequence)' };

  const { Client } = await import('xrpl') as any;
  const client = new Client(wsUrl);
  await client.connect();
  try {
    const resp = await client.request({ command: 'account_objects', account, type: 'escrow' });
    const objects: any[] = resp.result?.account_objects || [];
    const seq = parseInt(seqStr, 10);
    const exists = objects.some((o: any) => o.LedgerEntryType === 'Escrow' && o.Sequence === seq);
    if (!exists) return { valid: false, reason: 'Escrow not found on ledger' };
    return { valid: true };
  } finally {
    await client.disconnect();
  }
}

// ─── Express app ────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1); // Trust Vercel/proxy X-Forwarded-For so express-rate-limit works correctly

const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (corsOrigins.length === 0) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[swap-server] FATAL: CORS_ORIGINS must be set in production. Refusing to start with permissive CORS.');
    process.exit(1);
  }
  console.warn('[swap-server] WARNING: CORS_ORIGINS is not set. Defaulting to localhost origins (http://localhost:3000, http://localhost:5173, http://localhost:5174) — do NOT use in production!');
  // Restrict to common local-development origins so we never accept arbitrary origins even in dev
  corsOrigins.push('http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174');
}
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// ─── Rate limiting ──────────────────────────────────────────────────────────

/** General read-endpoint rate limit: 120 req / min per IP */
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Write-endpoint rate limit: 20 req / min per IP — protects against
 *  fake-offer flooding and DB connection exhaustion (H-7). */
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/swap/offer',        writeLimiter);
app.use('/api/swap/buy-offer',    writeLimiter);
app.use('/api/swap/accept',       writeLimiter);
app.use('/api/swap/accept-buy',   writeLimiter);
app.use('/api/swap/cancel',       writeLimiter);
app.use('/api/swap/lock',         writeLimiter);
app.use('/api/swap/secret',       writeLimiter);
app.use('/api/swap',              readLimiter);

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

    const canonicalMsg = buildCanonicalMessage('CREATE_OFFER', sellerEvmAddress.toLowerCase(), qbtcAmount, usdcAmountRequested, secretHash.toLowerCase(), Number(timestamp));
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

    const canonicalMsg = buildCanonicalMessage('CREATE_BID', buyerEvmAddress.toLowerCase(), qbtcAmount, usdcAmountOffered, secretHash.toLowerCase(), Number(timestamp));
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

    const canonicalMsg = buildCanonicalMessage('ACCEPT_BID', offerId, sellerEvmAddress.toLowerCase(), Number(timestamp));
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
      swapId: swap.public_id,
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

    const canonicalMsg = buildCanonicalMessage('CANCEL', offerId, Number(timestamp));
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

    const canonicalMsg = buildCanonicalMessage('ACCEPT', offerId, buyerEvmAddress.toLowerCase(), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, buyerEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    // Use a serializable transaction with SELECT FOR UPDATE to prevent a race
    // condition where two concurrent buyers both pass the status check and each
    // create an atomic_swap row for the same offer (H-5).
    const client = await pool.connect();
    let swap: any;
    let offer: any;
    try {
      await client.query('BEGIN');

      const offerResult = await client.query(
        'SELECT * FROM swap_offers WHERE id = $1 FOR UPDATE',
        [offerId],
      );
      offer = offerResult.rows[0];
      if (!offer) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Offer not found' });
      }
      if (offer.status !== 'OPEN' && offer.status !== 'LOCKED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Offer is no longer open' });
      }

      const secretHash  = offer.secret_hash;
      if (!secretHash) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'Offer is missing secretHash (legacy offer)' });
      }

      const now          = Math.floor(Date.now() / 1000);
      const qbtcLocktime = offer.qbtc_locktime || (now + SWAP_QBTC_TIMELOCK_SECS);
      const evmLocktime  = now + SWAP_EVM_TIMELOCK_SECS;

      // Determine initial status based on whether seller already locked QBTC
      const initialStatus = offer.qbtc_htlc_txid ? 'QBTC_LOCKED' : 'PENDING_QBTC_LOCK';

      // C-3: secret is NOT propagated from the offer — the plaintext preimage is
      // never stored server-side. The EVM monitor will write it once it is
      // revealed on-chain by the seller when they withdraw USDC.
      const swapResult = await client.query(
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
      swap = swapResult.rows[0];

      await client.query("UPDATE swap_offers SET status = 'MATCHED' WHERE id = $1", [offerId]);
      await client.query('COMMIT');

      return res.json({
        swapId: swap.public_id,
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
    } catch (txErr: any) {
      await client.query('ROLLBACK').catch((rbErr: any) => {
        console.error('POST /api/swap/accept: ROLLBACK failed:', rbErr?.message);
      });
      throw txErr;
    } finally {
      client.release();
    }
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
    const result = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [req.params.swapId]);
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
    const { offerId, qbtcHtlcTxid, qbtcHtlcAddress, signature, timestamp } = req.body || {};
    if (!offerId || !qbtcHtlcTxid || !qbtcHtlcAddress) {
      return res.status(400).json({ error: 'offerId, qbtcHtlcTxid, and qbtcHtlcAddress are required' });
    }
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'signature is required' });
    }
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN') return res.status(409).json({ error: `Cannot lock QBTC for offer in status: ${offer.status}` });

    // Verify seller's EVM signature — prevents griefing by unauthorised parties
    const canonicalMsg = buildCanonicalMessage('LOCK_OFFER', String(offerId), String(qbtcHtlcTxid), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, offer.seller_evm_address);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    // Verify HTLC transaction on-chain (require at least 1 confirmation to prevent double-spend)
    try {
      const tx = await qbtcRpcCall('getrawtransaction', [qbtcHtlcTxid, true]);
      if (!tx?.confirmations || tx.confirmations < 1) {
        return res.status(422).json({ error: 'QBTC HTLC tx must have at least 1 confirmation before locking' });
      }
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
    const { swapId, qbtcHtlcTxid, qbtcHtlcAddress, signature, timestamp } = req.body || {};
    if (!swapId || !qbtcHtlcTxid || !qbtcHtlcAddress) {
      return res.status(400).json({ error: 'swapId, qbtcHtlcTxid, and qbtcHtlcAddress are required' });
    }
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'signature is required' });
    }
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'PENDING_QBTC_LOCK') {
      return res.status(409).json({ error: `Cannot lock QBTC in status: ${swap.status}` });
    }

    // Verify seller's EVM signature — prevents griefing by unauthorised parties
    const canonicalMsg = buildCanonicalMessage('LOCK_QBTC', String(swapId), String(qbtcHtlcTxid), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, swap.seller_evm_address);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    // Verify HTLC transaction on-chain (require at least 1 confirmation to prevent double-spend)
    try {
      const tx = await qbtcRpcCall('getrawtransaction', [qbtcHtlcTxid, true]);
      if (!tx?.confirmations || tx.confirmations < 1) {
        return res.status(422).json({ error: 'QBTC HTLC tx must have at least 1 confirmation before locking' });
      }
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
      `UPDATE atomic_swaps SET qbtc_htlc_txid = $1, qbtc_htlc_address = $2, status = 'QBTC_LOCKED', updated_at = NOW() WHERE public_id = $3::uuid`,
      [qbtcHtlcTxid, qbtcHtlcAddress, swap.public_id],
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

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
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

      // Accepted window: [expectedTimelock - 60s, expectedTimelock].
      // The lower bound (- 60s) accommodates normal network latency between
      // reading swap details and on-chain submission. The upper bound equals
      // expectedTimelock exactly — timelocks set in the future are rejected
      // because they delay the seller's on-chain refund window beyond the
      // protocol-agreed value. Any timelock below expectedTimelock - 60s
      // is also rejected as it provides less security than agreed.
      const TIMELOCK_TOLERANCE = BigInt(60);
      const timelockInRange =
        timelock >= expectedTimelock - TIMELOCK_TOLERANCE &&
        timelock <= expectedTimelock;

      if (withdrawn || refunded) return res.status(422).json({ error: 'EVM HTLC is already settled/refunded' });
      if (hashlock !== expectedHash) return res.status(422).json({ error: 'EVM HTLC hashlock mismatch' });
      if (receiver !== expectedReceiver) return res.status(422).json({ error: 'EVM HTLC receiver mismatch' });
      if (!timelockInRange) return res.status(422).json({ error: 'EVM HTLC timelock mismatch' });
      if (amount !== expectedAmount) return res.status(422).json({ error: 'EVM HTLC amount mismatch' });
      if (expectedUsdc && tokenContract !== expectedUsdc.toLowerCase()) return res.status(422).json({ error: 'EVM HTLC token contract mismatch' });
    } catch (verifyErr: any) {
      return res.status(422).json({ error: `Failed to verify EVM HTLC: ${verifyErr.message}` });
    }

    await pool.query(
      `UPDATE atomic_swaps SET evm_contract_id = $1, status = 'EVM_LOCKED', updated_at = NOW() WHERE public_id = $2::uuid`,
      [evmContractId, swap.public_id],
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
    const { swapId, signature, timestamp } = req.body || {};
    if (!swapId || !signature) return res.status(400).json({ error: 'swapId and signature are required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'EVM_LOCKED' && swap.status !== 'COMPLETE') return res.status(409).json({ error: `Secret unavailable in status: ${swap.status}` });
    if (!swap.qbtc_htlc_txid || !swap.evm_contract_id) return res.status(409).json({ error: 'Swap lock legs incomplete' });
    if (!swap.secret) return res.status(422).json({ error: 'Secret not available yet' });

    // Timestamp is included in the message to prevent replay attacks
    const message = buildCanonicalMessage('SECRET_SELLER', String(swap.public_id), Number(timestamp));
    let recovered = '';
    try { recovered = ethers.verifyMessage(message, String(signature)).toLowerCase(); } catch { return res.status(400).json({ error: 'Invalid seller signature' }); }
    if (recovered !== String(swap.seller_evm_address).toLowerCase()) return res.status(403).json({ error: 'Signature mismatch' });

    return res.json({ swapId: swap.public_id, message, secret: swap.secret });
  } catch (err: any) {
    console.error('POST /api/swap/secret/seller:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to retrieve secret' });
  }
});

// ─── POST /api/swap/claim/qbtc — Record buyer's QBTC claim txid ────────────

app.post('/api/swap/claim/qbtc', async (req, res) => {
  try {
    const { swapId, claimTxid, signature, timestamp } = req.body || {};
    if (!swapId || !claimTxid) return res.status(400).json({ error: 'swapId and claimTxid required' });
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const result = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'COMPLETE') return res.status(409).json({ error: 'Swap is not COMPLETE' });

    // Verify buyer's EVM signature — prevents arbitrary parties from setting the claim txid
    const canonicalMsg = buildCanonicalMessage('CLAIM_QBTC', String(swapId), String(claimTxid), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, swap.buyer_evm_address);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    await pool.query(
      `UPDATE atomic_swaps SET buyer_qbtc_claim_txid = $1, updated_at = NOW() WHERE public_id = $2::uuid`,
      [claimTxid, swap.public_id],
    );

    return res.json({ ok: true, claimTxid });
  } catch (err: any) {
    console.error('POST /api/swap/claim/qbtc:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record claim' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── PHASE 3 — V2 MULTI-CHAIN ENDPOINTS ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//
// All v2 endpoints live under /api/swap/v2/ and are pair-agnostic.
// Legacy QBTC/USDC endpoints remain unchanged under /api/swap/.
//
// V2 State machine:
//   PENDING_SIDE_A → SIDE_A_LOCKED → SIDE_B_LOCKED → COMPLETE
//                 ↘ EXPIRED / REFUNDED
//
// ─── POST /api/swap/v2/offer ────────────────────────────────────────────────
// Maker posts a new offer to sell base chain asset for quote chain asset.
//
// Body:
//   baseChain, quoteChain       — pair identifiers
//   baseAmount                  — amount of base asset maker is selling
//   quoteAmount                 — amount of quote asset maker wants in return
//   secretHash                  — SHA-256(secret), 32-byte hex (client-generated)
//   makerLocktime               — Unix timestamp for base chain HTLC expiry
//   makerChainAddress           — maker's address on the base chain
//   authEvmAddress              — EVM address used to sign this request
//   signature, timestamp        — EVM personal_sign authentication
//
// Returns the created offer row (camelCase).

app.post('/api/swap/v2/offer', writeLimiter, async (req, res) => {
  try {
    const {
      baseChain, quoteChain,
      baseAmount, quoteAmount,
      secretHash, makerLocktime,
      makerChainAddress, makerPubKeyHex,
      authEvmAddress,
      signature, timestamp,
    } = req.body || {};

    // ── Input validation ────────────────────────────────────────────────────
    validatePair(baseChain, quoteChain);
    if (!baseAmount  || typeof baseAmount  !== 'string') return res.status(400).json({ error: 'baseAmount is required' });
    if (!quoteAmount || typeof quoteAmount !== 'string') return res.status(400).json({ error: 'quoteAmount is required' });
    if (!secretHash  || !/^[0-9a-fA-F]{64}$/.test(secretHash)) return res.status(400).json({ error: 'secretHash must be 64 hex chars' });
    if (!makerLocktime || !Number.isFinite(Number(makerLocktime)) || Number(makerLocktime) <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'makerLocktime must be a future Unix timestamp' });
    }
    if (!makerChainAddress || typeof makerChainAddress !== 'string') return res.status(400).json({ error: 'makerChainAddress is required' });
    if (!authEvmAddress    || typeof authEvmAddress    !== 'string') return res.status(400).json({ error: 'authEvmAddress is required' });
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });

    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    // ── Auth (EVM personal_sign) ─────────────────────────────────────────────
    const canonicalMsg = buildV2Message(
      'CREATE_OFFER', baseChain, quoteChain,
      authEvmAddress.toLowerCase(), baseAmount, quoteAmount,
      secretHash.toLowerCase(), Number(makerLocktime), Number(timestamp),
    );
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    // ── Insert ───────────────────────────────────────────────────────────────
    const result = await pool.query(`
      INSERT INTO swap_offers (
        base_chain, quote_chain,
        base_amount, quote_amount,
        secret_hash, qbtc_locktime,
        maker_chain_address, maker_pub_key_hex,
        auth_evm_address,
        offer_type, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ASK','OPEN',NOW())
      RETURNING *
    `, [
      baseChain, quoteChain,
      baseAmount, quoteAmount,
      secretHash.toLowerCase(), Number(makerLocktime),
      makerChainAddress, makerPubKeyHex || null,
      authEvmAddress.toLowerCase(),
    ]);

    const offer = result.rows[0];
    return res.status(201).json(toCamelCase(offer));
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/swap/v2/offer:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create offer' });
  }
});

// ─── GET /api/swap/v2/offers ─────────────────────────────────────────────────
// List open offers for a specific pair.
// Query params: base (required), quote (required), limit (default 50)

app.get('/api/swap/v2/offers', readLimiter, async (req, res) => {
  try {
    const base  = String(req.query.base  || '');
    const quote = String(req.query.quote || '');
    const limit = Math.min(Number(req.query.limit || 50), 200);

    validatePair(base, quote);

    const result = await pool.query(`
      SELECT * FROM swap_offers
      WHERE base_chain = $1 AND quote_chain = $2
        AND status IN ('OPEN','LOCKED')
        AND offer_type = 'ASK'
      ORDER BY created_at ASC
      LIMIT $3
    `, [base, quote, limit]);

    return res.json(result.rows.map(toCamelCase));
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('GET /api/swap/v2/offers:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch offers' });
  }
});

// ─── GET /api/swap/v2/offers/all ─────────────────────────────────────────────
// List all open ASK offers across every pair (multi-chain marketplace browse).
// No pair filter required. Limit: 200, ordered by created_at DESC.
// NOTE: Must be registered BEFORE the /api/swap/v2/:swapId catch-all route.

app.get('/api/swap/v2/offers/all', readLimiter, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM swap_offers
      WHERE status = 'OPEN'
        AND offer_type = 'ASK'
        AND base_chain IS NOT NULL
        AND quote_chain IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 200
    `);

    return res.json(result.rows.map(toCamelCase));
  } catch (err: any) {
    console.error('GET /api/swap/v2/offers/all:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch all offers' });
  }
});

// ─── POST /api/swap/v2/offer/:offerId/cancel ─────────────────────────────────
// Maker cancels their own OPEN offer.
// Body: authEvmAddress, signature, timestamp

app.post('/api/swap/v2/offer/:offerId/cancel', writeLimiter, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { authEvmAddress, signature, timestamp } = req.body || {};

    if (!authEvmAddress || typeof authEvmAddress !== 'string') return res.status(400).json({ error: 'authEvmAddress is required' });
    if (!signature      || typeof signature      !== 'string') return res.status(400).json({ error: 'signature is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const offerResult = await pool.query('SELECT * FROM swap_offers WHERE id = $1', [offerId]);
    const offer = offerResult.rows[0];
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'OPEN') return res.status(409).json({ error: `Cannot cancel offer in status: ${offer.status}` });

    // Verify the signer is the maker
    if (offer.auth_evm_address.toLowerCase() !== authEvmAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Not the offer owner' });
    }

    const canonicalMsg = buildV2Message('CANCEL_OFFER', offer.base_chain, offer.quote_chain, offerId, authEvmAddress.toLowerCase(), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    await pool.query("UPDATE swap_offers SET status = 'CANCELLED' WHERE id = $1", [offerId]);
    return res.json({ status: 'CANCELLED' });
  } catch (err: any) {
    console.error('POST /api/swap/v2/offer/cancel:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to cancel offer' });
  }
});

// ─── POST /api/swap/v2/accept/:offerId ───────────────────────────────────────
// Taker accepts an open offer.  Creates an atomic_swap record.
//
// Body:
//   takerChainAddress   — taker's address on the quote chain (where they lock)
//   authEvmAddress      — EVM address used to sign
//   signature, timestamp

app.post('/api/swap/v2/accept/:offerId', writeLimiter, async (req, res) => {
  try {
    const { offerId } = req.params;
    const { takerChainAddress, takerPubKeyHex, authEvmAddress, signature, timestamp } = req.body || {};

    if (!takerChainAddress || typeof takerChainAddress !== 'string') {
      return res.status(400).json({ error: 'takerChainAddress is required' });
    }
    if (!authEvmAddress || typeof authEvmAddress !== 'string') {
      return res.status(400).json({ error: 'authEvmAddress is required' });
    }
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });

    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const offerResult = await client.query(
        'SELECT * FROM swap_offers WHERE id = $1 FOR UPDATE',
        [offerId],
      );
      const offer = offerResult.rows[0];
      if (!offer)                  { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
      if (offer.status !== 'OPEN' && offer.status !== 'LOCKED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Offer is no longer open' });
      }

      // Auth — taker signs with their EVM key
      const canonicalMsg = buildV2Message(
        'ACCEPT_OFFER', offer.base_chain, offer.quote_chain,
        offerId, authEvmAddress.toLowerCase(), Number(timestamp),
      );
      try {
        assertEvmSignature(canonicalMsg, signature, authEvmAddress);
      } catch (authErr: any) {
        await client.query('ROLLBACK');
        return res.status(authErr.statusCode || 403).json({ error: authErr.message });
      }

      const now           = Math.floor(Date.now() / 1000);
      const sideALocktime = Number(offer.qbtc_locktime) || (now + SWAP_QBTC_TIMELOCK_SECS);
      const sideBLocktime = now + SWAP_EVM_TIMELOCK_SECS;

      // Propagate maker's pubkey from offer; store taker's pubkey if provided
      // (required for BTC HTLC script reconstruction at claim time)
      const sideAPubKeyHex = offer.maker_pub_key_hex || null;
      const sideBPubKeyHex = (typeof takerPubKeyHex === 'string' && takerPubKeyHex.trim()) ? takerPubKeyHex.trim() : null;

      const swapResult = await client.query(`
        INSERT INTO atomic_swaps (
          offer_id, base_chain, quote_chain,
          side_a_amount, side_b_amount,
          side_a_chain_address, side_b_chain_address,
          auth_evm_address_a, auth_evm_address_b,
          secret_hash,
          side_a_locktime, side_b_locktime,
          side_a_pub_key_hex, side_b_pub_key_hex,
          status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDING_SIDE_A',NOW(),NOW())
        RETURNING *
      `, [
        offerId, offer.base_chain, offer.quote_chain,
        offer.base_amount, offer.quote_amount,
        offer.maker_chain_address, takerChainAddress,
        String(offer.auth_evm_address || '').toLowerCase(),
        authEvmAddress.toLowerCase(),
        offer.secret_hash,
        sideALocktime, sideBLocktime,
        sideAPubKeyHex, sideBPubKeyHex,
      ]);
      const swap = swapResult.rows[0];

      await client.query("UPDATE swap_offers SET status = 'MATCHED' WHERE id = $1", [offerId]);
      await client.query('COMMIT');

      return res.json({
        ...toCamelCase(swap),
        swapId:       swap.public_id,
        secretHash:   offer.secret_hash,
        sideALocktime,
        sideBLocktime,
        baseChain:    offer.base_chain,
        quoteChain:   offer.quote_chain,
        baseAmount:   offer.base_amount,
        quoteAmount:  offer.quote_amount,
      });
    } catch (txErr: any) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/swap/v2/accept:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to accept offer' });
  }
});

// ─── POST /api/swap/v2/swap/:swapId/cancel ───────────────────────────────────
// Maker aborts a swap that is still in PENDING_SIDE_A (nothing locked yet).
// Body: authEvmAddress, signature, timestamp

app.post('/api/swap/v2/swap/:swapId/cancel', writeLimiter, async (req, res) => {
  try {
    const { swapId } = req.params;
    const { authEvmAddress, signature, timestamp } = req.body || {};

    if (!authEvmAddress || typeof authEvmAddress !== 'string') return res.status(400).json({ error: 'authEvmAddress is required' });
    if (!signature      || typeof signature      !== 'string') return res.status(400).json({ error: 'signature is required' });
    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'PENDING_SIDE_A') return res.status(409).json({ error: `Cannot cancel swap in status: ${swap.status}` });

    if (swap.auth_evm_address_a.toLowerCase() !== authEvmAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Not the swap maker' });
    }

    const canonicalMsg = buildV2Message('CANCEL_SWAP', swap.base_chain, swap.quote_chain, swapId, authEvmAddress.toLowerCase(), Number(timestamp));
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    await pool.query("DELETE FROM atomic_swaps WHERE public_id = $1", [swapId]);
    return res.json({ status: 'CANCELLED' });
  } catch (err: any) {
    console.error('POST /api/swap/v2/swap/cancel:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to cancel swap' });
  }
});

// ─── POST /api/swap/v2/lock/side-a ───────────────────────────────────────────
// Maker records their on-chain lock (HTLC / escrow) for the base asset.
// This is the first lock in the swap — maker locks first.
//
// Body:
//   swapId          — swap public_id (UUID)
//   lockId          — chain-specific lock identifier:
//                     Bitcoin/QBTC: "txid:vout"
//                     EVM:          "0x<contractId bytes32>"
//                     XRP:          "account:offerSequence"
//   lockAddress     — HTLC address (P2WSH for BTC/QBTC; optional for others)
//   authEvmAddress  — maker's EVM address for signing
//   signature, timestamp

app.post('/api/swap/v2/lock/side-a', writeLimiter, async (req, res) => {
  try {
    const { swapId, lockId, lockAddress, htlcScriptHex, authEvmAddress, signature, timestamp } = req.body || {};

    if (!swapId   || typeof swapId   !== 'string') return res.status(400).json({ error: 'swapId is required' });
    if (!lockId   || typeof lockId   !== 'string') return res.status(400).json({ error: 'lockId is required' });
    if (!authEvmAddress || typeof authEvmAddress !== 'string') return res.status(400).json({ error: 'authEvmAddress is required' });
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });

    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'PENDING_SIDE_A') {
      return res.status(409).json({ error: `Cannot lock side-A in status: ${swap.status}` });
    }

    // Auth — maker signs
    const canonicalMsg = buildV2Message(
      'LOCK_SIDE_A', swap.base_chain, swap.quote_chain,
      swapId, lockId, Number(timestamp),
    );
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }
    if (authEvmAddress.toLowerCase() !== String(swap.auth_evm_address_a || '').toLowerCase()) {
      return res.status(403).json({ error: 'Signer does not match maker for this swap' });
    }

    // Verify lock on-chain
    const verification = await verifyLockOnChain(
      swap.base_chain, lockId,
      swap.side_a_amount || swap.qbtc_amount || '0',
      swap.secret_hash,
      lockAddress,
    );
    if (!verification.valid) {
      const httpStatus = /not confirmed/i.test(verification.reason || '') ? 425 : 422;
      return res.status(httpStatus).json({ error: `Lock verification failed: ${verification.reason}` });
    }

    const htlcScriptValA = (typeof htlcScriptHex === 'string' && htlcScriptHex.trim()) ? htlcScriptHex.trim() : null;
    await pool.query(`
      UPDATE atomic_swaps
      SET side_a_lock_id = $1, side_a_lock_address = $2, side_a_htlc_script = $3, status = 'SIDE_A_LOCKED', updated_at = NOW()
      WHERE public_id = $4::uuid
    `, [lockId, lockAddress || null, htlcScriptValA, swapId]);

    return res.json({ status: 'SIDE_A_LOCKED', swapId, lockId });
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/swap/v2/lock/side-a:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record side-A lock' });
  }
});

// ─── POST /api/swap/v2/lock/side-b ───────────────────────────────────────────
// Taker records their on-chain lock for the quote asset.
// The second lock — taker locks after maker's lock is confirmed.

app.post('/api/swap/v2/lock/side-b', writeLimiter, async (req, res) => {
  try {
    const { swapId, lockId, lockAddress, authEvmAddress, signature, timestamp } = req.body || {};

    if (!swapId   || typeof swapId   !== 'string') return res.status(400).json({ error: 'swapId is required' });
    if (!lockId   || typeof lockId   !== 'string') return res.status(400).json({ error: 'lockId is required' });
    if (!authEvmAddress || typeof authEvmAddress !== 'string') return res.status(400).json({ error: 'authEvmAddress is required' });
    if (!signature || typeof signature !== 'string') return res.status(400).json({ error: 'signature is required' });

    const tsErr = checkTimestamp(timestamp);
    if (tsErr) return res.status(400).json({ error: tsErr });

    const swapResult = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = swapResult.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.status !== 'SIDE_A_LOCKED') {
      return res.status(409).json({ error: `Cannot lock side-B in status: ${swap.status}` });
    }

    // Auth — taker signs
    const canonicalMsg = buildV2Message(
      'LOCK_SIDE_B', swap.base_chain, swap.quote_chain,
      swapId, lockId, Number(timestamp),
    );
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }
    if (authEvmAddress.toLowerCase() !== String(swap.auth_evm_address_b || '').toLowerCase()) {
      return res.status(403).json({ error: 'Signer does not match taker for this swap' });
    }

    // Verify lock on-chain
    const verification = await verifyLockOnChain(
      swap.quote_chain, lockId,
      swap.side_b_amount || swap.usdc_amount || '0',
      swap.secret_hash,
      lockAddress,
    );
    if (!verification.valid) {
      const httpStatus = /not confirmed/i.test(verification.reason || '') ? 425 : 422;
      return res.status(httpStatus).json({ error: `Lock verification failed: ${verification.reason}` });
    }

    await pool.query(`
      UPDATE atomic_swaps
      SET side_b_lock_id = $1, side_b_lock_address = $2, status = 'SIDE_B_LOCKED', updated_at = NOW()
      WHERE public_id = $3::uuid
    `, [lockId, lockAddress || null, swapId]);

    return res.json({ status: 'SIDE_B_LOCKED', swapId, lockId });
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('POST /api/swap/v2/lock/side-b:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to record side-B lock' });
  }
});

// ─── GET /api/swap/v2/stats ───────────────────────────────────────────────────
// Aggregate stats filtered by pair (optional).
// Query params: base, quote (both optional; if omitted, aggregates all pairs)

app.get('/api/swap/v2/stats', readLimiter, async (req, res) => {
  try {
    const base  = String(req.query.base  || '').trim() || null;
    const quote = String(req.query.quote || '').trim() || null;

    if (base || quote) {
      if (!base || !quote) return res.status(400).json({ error: 'Provide both base and quote, or neither' });
      validatePair(base, quote);
    }

    const pairFilter = base
      ? `AND base_chain = '${base.replace(/'/g, '')}' AND quote_chain = '${quote!.replace(/'/g, '')}'`
      : '';

    const swapStats = await pool.query(`
      SELECT
        base_chain, quote_chain,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'COMPLETE')::int  AS completed,
        COUNT(*) FILTER (WHERE status = 'EXPIRED')::int   AS expired,
        COUNT(*) FILTER (WHERE status IN ('PENDING_SIDE_A','SIDE_A_LOCKED','SIDE_B_LOCKED'))::int AS active
      FROM atomic_swaps
      WHERE base_chain IS NOT NULL ${pairFilter}
      GROUP BY base_chain, quote_chain
      ORDER BY completed DESC
    `);

    const offerStats = await pool.query(`
      SELECT
        base_chain, quote_chain,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int    AS open,
        COUNT(*) FILTER (WHERE status = 'MATCHED')::int AS matched
      FROM swap_offers
      WHERE base_chain IS NOT NULL ${pairFilter}
      GROUP BY base_chain, quote_chain
      ORDER BY open DESC
    `);

    return res.json({
      swaps:  swapStats.rows.map(toCamelCase),
      offers: offerStats.rows.map(toCamelCase),
    });
  } catch (err: any) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('GET /api/swap/v2/stats:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
});

// ─── GET /api/swap/v2/pairs ───────────────────────────────────────────────────
// List all supported chain pairs with active order book depth.

app.get('/api/swap/v2/pairs', readLimiter, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        base_chain, quote_chain,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_offers,
        MIN(CASE WHEN status = 'OPEN' THEN (quote_amount::numeric / NULLIF(base_amount::numeric, 0)) END) AS best_ask,
        MAX(CASE WHEN status = 'OPEN' THEN (quote_amount::numeric / NULLIF(base_amount::numeric, 0)) END) AS best_bid
      FROM swap_offers
      WHERE base_chain IS NOT NULL AND base_amount IS NOT NULL AND quote_amount IS NOT NULL
      GROUP BY base_chain, quote_chain
      ORDER BY open_offers DESC
    `);
    return res.json(result.rows.map(toCamelCase));
  } catch (err: any) {
    console.error('GET /api/swap/v2/pairs:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch pairs' });
  }
});

// ─── GET /api/swap/v2/by-address ─────────────────────────────────────────────
// Return active + recent v2 swaps for a given EVM address (maker or taker).
// Query param: evmAddress

app.get('/api/swap/v2/by-address', readLimiter, async (req, res) => {
  try {
    const evmAddress = String(req.query.evmAddress || '').trim().toLowerCase();
    if (!evmAddress) return res.status(400).json({ error: 'evmAddress query param is required' });

    const result = await pool.query(
      `SELECT * FROM atomic_swaps
       WHERE LOWER(auth_evm_address_a) = $1 OR LOWER(auth_evm_address_b) = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [evmAddress],
    );

    const swaps = result.rows.map((row: any) => {
      const mapped: any = toCamelCase(row);
      if (row.status !== 'COMPLETE') delete mapped.secret;
      return mapped;
    });
    return res.json(swaps);
  } catch (err: any) {
    console.error('GET /api/swap/v2/by-address:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch swaps' });
  }
});

// ─── GET /api/swap/v2/:swapId ────────────────────────────────────────────────
// Fetch a v2 swap by public_id.  Returns secret only when COMPLETE.
// NOTE: Must be registered AFTER all static /api/swap/v2/<name> routes.

app.get('/api/swap/v2/:swapId', readLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM atomic_swaps WHERE public_id = $1::uuid',
      [req.params.swapId],
    );
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });

    const mapped: any = toCamelCase(swap);
    if (swap.status !== 'COMPLETE') delete mapped.secret;
    return res.json(mapped);
  } catch (err: any) {
    console.error('GET /api/swap/v2/:swapId:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to fetch swap' });
  }
});

// ─── POST /api/swap/v2/claim/side-b ─────────────────────────────────────────
// Maker reports they withdrew ETH from the HTLC, revealing the secret.
// Server verifies SHA-256(secret) === secretHash, stores the secret, sets COMPLETE.
// The taker can then fetch the swap (secret is returned when COMPLETE) and claim XRP.

app.post('/api/swap/v2/claim/side-b', writeLimiter, async (req, res) => {
  try {
    const { swapId, secret, claimTxHash, authEvmAddress, signature, timestamp } = req.body || {};
    if (!swapId || !secret || !authEvmAddress || !signature || !timestamp) {
      return res.status(400).json({ error: 'swapId, secret, authEvmAddress, signature, timestamp required' });
    }
    if (!/^[0-9a-fA-F]{64}$/.test(secret)) return res.status(400).json({ error: 'secret must be 64 hex chars' });

    const result = await pool.query('SELECT * FROM atomic_swaps WHERE public_id = $1::uuid', [swapId]);
    const swap = result.rows[0];
    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    // Idempotent: if already COMPLETE, return success (EvmMonitor may have beaten the client)
    if (swap.status === 'COMPLETE') return res.json({ status: 'COMPLETE', swapId });
    if (swap.status !== 'SIDE_B_LOCKED') return res.status(409).json({ error: `Cannot claim in status: ${swap.status}` });
    if (authEvmAddress.toLowerCase() !== String(swap.auth_evm_address_a || '').toLowerCase()) {
      return res.status(403).json({ error: 'Only the maker (side-A) can claim side-B' });
    }

    // Verify secret matches secretHash
    const revealedHash = crypto.createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
    if (revealedHash.toLowerCase() !== String(swap.secret_hash || '').toLowerCase()) {
      return res.status(422).json({ error: 'Secret does not match secretHash for this swap' });
    }

    // Verify signature
    const canonicalMsg = `QBTC_SWAP_V2:CLAIM_SIDE_B:${swap.base_chain}:${swap.quote_chain}:${swapId}:${claimTxHash || ''}:${Number(timestamp)}`;
    try {
      assertEvmSignature(canonicalMsg, signature, authEvmAddress);
    } catch (authErr: any) {
      return res.status(authErr.statusCode || 403).json({ error: authErr.message });
    }

    await pool.query(
      `UPDATE atomic_swaps SET secret = $1, status = 'COMPLETE', updated_at = NOW() WHERE public_id = $2::uuid`,
      [secret, swapId],
    );

    return res.json({ status: 'COMPLETE', swapId });
  } catch (err: any) {
    console.error('POST /api/swap/v2/claim/side-b:', err.message);
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

  // Legacy QBTC/USDC EVM monitor — kept running until Phase 3 migration is complete
  setInterval(pollEvmLocked, MONITOR_POLL_MS);
  console.log(`[swap-server] EVM withdraw monitor started (${MONITOR_POLL_MS / 1000}s interval)`);

  // Multi-chain monitors (Phase 2) — started for any chains that have env vars configured
  const { startAllMonitors, stopAllMonitors } = await import('./adapters/index.ts');
  const monitors = startAllMonitors(pool, MONITOR_POLL_MS);

  // Graceful shutdown
  const shutdown = () => {
    stopAllMonitors(monitors);
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT',  shutdown);
});
