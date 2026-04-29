/**
 * BitcoinMonitor.ts
 *
 * Server-side monitor for Bitcoin-family chains: QBTC and BTC.
 *
 * QBTC: polls the QBTC node RPC (`gettxout`, `getrawtransaction`) to detect
 *       when an HTLC output is spent.  Extracts the preimage from the first
 *       push-data in the unlocking script / witness.
 *
 * BTC:  polls Blockstream Esplora (`GET /api/tx/:txid/outspend/:vout`) to
 *       detect a spend.  Loads the spending tx and extracts the preimage from
 *       the witness stack.
 *
 * Both implementations look for the secret as the *first* witness item that
 * is exactly 32 bytes long (the HTLC claim witness layout is [sig, secret,
 * 0x01, script]).
 *
 * NOTE: Full UTXO scan for identifying the HTLC output index (vout) is a
 * Phase 7 enhancement.  For now, vout=0 is assumed (HTLC address funded as
 * first output).  Real integrations should store vout in the swap record.
 */

import https from 'https';
import http from 'http';
import type { Pool } from 'pg';
import { BaseMonitor } from './IChainAdapter.ts';
import type { IChainMonitor, LockVerification, ChainId } from './IChainAdapter.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BitcoinMonitorConfig {
  chain: ChainId;
  /** QBTC node JSON-RPC URL (used for QBTC chain only) */
  qbtcRpcUrl?: string;
  /** Blockstream Esplora base URL (used for BTC chain only) */
  esploraUrl?: string;
  /** Grace period in seconds after HTLC locktime before declaring EXPIRED */
  graceSecs?: number;
}

// ─── BitcoinMonitor ───────────────────────────────────────────────────────────

export class BitcoinMonitor extends BaseMonitor implements IChainMonitor {
  readonly chain: ChainId;
  private readonly config: BitcoinMonitorConfig;
  private readonly graceSecs: number;

  constructor(config: BitcoinMonitorConfig) {
    super();
    this.chain    = config.chain;
    this.config   = config;
    this.graceSecs = config.graceSecs ?? 7200;
  }

  // ── IChainMonitor ───────────────────────────────────────────────────────────

  async verifyLock(
    lockId: string,
    _expectedAmount: string,
    _expectedHash: string,
  ): Promise<LockVerification> {
    // TODO (Phase 7): decode script from txout and verify hashlock + amount
    try {
      const txid = lockId.split(':')[0];
      const raw  = await this._getRawTx(txid);
      if (!raw) return { valid: false, reason: 'Transaction not found' };
      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `RPC error: ${err.message}` };
    }
  }

  async getRevealedSecret(lockId: string): Promise<string | null> {
    try {
      const [txid, voutStr] = lockId.split(':');
      const vout = parseInt(voutStr || '0', 10);
      return this.chain === 'QBTC'
        ? this._getSecretQbtc(txid, vout)
        : this._getSecretBtc(txid, vout);
    } catch {
      return null;
    }
  }

  async isExpiredOrRefunded(lockId: string, timelockUnix: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    return now > timelockUnix + this.graceSecs;
  }

  // ── BaseMonitor.pollSwaps ───────────────────────────────────────────────────

  protected async pollSwaps(): Promise<void> {
    // Watch two cases:
    //   1. base_chain = $1 (e.g. BTC/ETH): swap is SIDE_A_LOCKED while waiting for taker to
    //      lock quote; once both locked, the MAKER claims the quote asset (handled by
    //      EvmMonitor/XrplMonitor).  We also keep legacy QBTC states for backward compat.
    //   2. quote_chain = $1 (e.g. ETH/BTC): swap is SIDE_B_LOCKED — taker locked BTC and
    //      we must detect when the MAKER claims that BTC (revealing the secret) so we can
    //      mark COMPLETE and let the taker claim the other side.
    const result = await this.pool.query(`
      SELECT * FROM atomic_swaps
      WHERE (
        status IN ('PENDING_QBTC_LOCK', 'QBTC_LOCKED', 'SIDE_A_LOCKED')
        AND (
          base_chain = $1
          OR (base_chain IS NULL AND $1 = 'QBTC')
        )
      ) OR (
        status = 'SIDE_B_LOCKED'
        AND quote_chain = $1
      )
    `, [this.chain]);

    for (const swap of result.rows) {
      await this._processSwap(swap);
    }
  }

  private async _processSwap(swap: any): Promise<void> {
    // Determine which lockId to watch depending on which side is the BTC/QBTC chain
    const isBtcQuoteChain = swap.quote_chain === this.chain && swap.status === 'SIDE_B_LOCKED';
    const lockId: string | null = isBtcQuoteChain
      ? (swap.side_b_lock_id || null)
      : (swap.qbtc_htlc_txid || swap.side_a_lock_id);
    if (!lockId) return;

    const locktime: number = isBtcQuoteChain
      ? (swap.side_b_locktime || 0)
      : (swap.qbtc_locktime || swap.side_a_locktime || 0);
    const now = Math.floor(Date.now() / 1000);

    if (locktime > 0 && now > locktime + this.graceSecs) {
      await this.pool.query(
        `UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
        [swap.id],
      );
      console.log(`[BitcoinMonitor:${this.chain}] Swap ${swap.id} → EXPIRED`);
      return;
    }

    try {
      const secret = await this.getRevealedSecret(lockId);
      if (secret) {
        await this.pool.query(
          `UPDATE atomic_swaps SET secret = $1, status = 'COMPLETE', updated_at = NOW() WHERE id = $2`,
          [secret, swap.id],
        );
        console.log(`[BitcoinMonitor:${this.chain}] Swap ${swap.id} → COMPLETE`);
      }
    } catch (err: any) {
      console.error(`[BitcoinMonitor:${this.chain}] Swap ${swap.id}:`, err?.message);
    }
  }

  // ── QBTC helpers ────────────────────────────────────────────────────────────

  private async _getSecretQbtc(txid: string, vout: number): Promise<string | null> {
    // Check if the HTLC output is spent
    const txout = await this._qbtcRpc('gettxout', [txid, vout, true]);
    if (txout !== null) return null; // still unspent

    // Find the spending transaction by scanning mempool / chain
    // TODO (Phase 7): use `getblockchaininfo` + block scan.
    // For now use `getrawtransaction` on the *spending* tx if known.
    // The server stores the HTLC txid but not the spending txid —
    // a full implementation would use `gettxout` includeMempool=true
    // combined with ZMQ notifications.
    return null;
  }

  private async _getRawTx(txid: string): Promise<any | null> {
    if (this.chain === 'QBTC') {
      return this._qbtcRpc('getrawtransaction', [txid, true]);
    }
    return this._esploraGet<any>(`/api/tx/${txid}`);
  }

  // ── BTC / Esplora helpers ───────────────────────────────────────────────────

  private async _getSecretBtc(txid: string, vout: number): Promise<string | null> {
    // Check if the UTXO is spent
    const spend = await this._esploraGet<{
      spent: boolean;
      txid: string;
      vin: number;
    }>(`/api/tx/${txid}/outspend/${vout}`);

    if (!spend?.spent) return null;

    // Load the spending transaction and look for the preimage in witness
    const spendTx = await this._esploraGet<{
      vin: Array<{ witness: string[] }>;
    }>(`/api/tx/${spend.txid}`);

    if (!spendTx) return null;

    // The HTLC claim witness is: [sig, secret, 0x01, script]
    // The refund witness is:      [sig, 0x00, script]
    // Find the first 32-byte push that isn't 0x00 or 0x01
    for (const input of spendTx.vin || []) {
      for (const item of input.witness || []) {
        if (item.length === 64 && item !== '00' && item !== '01') {
          // 32 bytes = 64 hex chars — this is our preimage candidate
          return item.toLowerCase();
        }
      }
    }
    return null;
  }

  // ── RPC / HTTP helpers ──────────────────────────────────────────────────────

  private async _qbtcRpc(method: string, params: unknown[]): Promise<any> {
    const url = this.config.qbtcRpcUrl;
    if (!url) throw new Error('qbtcRpcUrl not configured');

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const data = await this._httpPost(url, body, {
      'Content-Type': 'application/json',
    });
    const json = JSON.parse(data);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  private async _esploraGet<T>(path: string): Promise<T | null> {
    const base = this.config.esploraUrl || 'https://blockstream.info/testnet';
    const url  = `${base}${path}`;
    try {
      const data = await this._httpGet(url);
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  private _httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private _httpPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod    = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
      };
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

export function createBitcoinMonitor(chain: 'QBTC' | 'BTC'): BitcoinMonitor | null {
  if (chain === 'QBTC') {
    const rpcUrl = process.env.QBTC_RPC_URL || 'http://localhost:18443';
    return new BitcoinMonitor({ chain: 'QBTC', qbtcRpcUrl: rpcUrl });
  }
  if (chain === 'BTC') {
    const esploraUrl = process.env.BTC_ESPLORA_URL || 'https://blockstream.info/testnet';
    return new BitcoinMonitor({ chain: 'BTC', esploraUrl });
  }
  return null;
}
