/**
 * EvmMonitor.ts
 *
 * Server-side monitor for EVM chains: USDC (HashedTimelockERC20),
 * ETH and BNB (HashedTimelockETH — Phase 4).
 *
 * Polls for swaps in `SIDE_B_LOCKED` or legacy `EVM_LOCKED` status whose
 * side-B chain is an EVM chain.  When a withdrawal is detected the revealed
 * preimage is written to the DB and the swap moves to COMPLETE.
 *
 * Refactored from the inline `pollEvmLocked` function in swap-server/index.ts.
 * The legacy QBTC/USDC path (`evm_contract_id` column) continues to work via
 * the existing DB columns so no migration is required for live swaps.
 */

import { ethers } from 'ethers';
import crypto from 'crypto';
import type { Pool } from 'pg';
import { BaseMonitor } from './IChainAdapter.ts';
import type { IChainMonitor, LockVerification, ChainId } from './IChainAdapter.ts';

// ─── ABI (minimal — read-only polling) ────────────────────────────────────────

const ERC20_HTLC_GET_ABI = [
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
] as const;

const NATIVE_HTLC_GET_ABI = [
  'function getContract(bytes32 contractId) view returns (address sender, address receiver, uint256 amount, bytes32 hashlock, uint256 timelock, bool withdrawn, bool refunded, bytes32 preimage)',
] as const;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface EvmMonitorConfig {
  chain: ChainId;
  rpcUrl: string;
  htlcContractAddress: string;
  /** Set to true for native ETH/BNB HTLC (HashedTimelockETH); false for ERC-20 */
  isNative?: boolean;
  /** Grace period in seconds after EVM locktime before declaring EXPIRED */
  graceSecs?: number;
}

// ─── EvmMonitor ───────────────────────────────────────────────────────────────

export class EvmMonitor extends BaseMonitor implements IChainMonitor {
  readonly chain: ChainId;
  private readonly config: EvmMonitorConfig;
  private readonly graceSecs: number;

  constructor(config: EvmMonitorConfig) {
    super();
    this.chain = config.chain;
    this.config = config;
    this.graceSecs = config.graceSecs ?? 3600;
  }

  // ── IChainMonitor ───────────────────────────────────────────────────────────

  async verifyLock(
    lockId: string,
    expectedAmount: string,
    expectedHash: string,
  ): Promise<LockVerification> {
    try {
      const details = await this._getContractDetails(lockId);
      if (!details) return { valid: false, reason: 'Contract not found on chain' };

      if (details.withdrawn) return { valid: false, reason: 'HTLC already withdrawn' };
      if (details.refunded)  return { valid: false, reason: 'HTLC already refunded' };

      // Verify amount (allow ≥ expected to handle small overages)
      const expectedUnits = this._parseAmount(expectedAmount);
      if (details.amount < expectedUnits) {
        return { valid: false, reason: `Amount too low: got ${details.amount}, expected ${expectedUnits}` };
      }

      // Verify hashlock
      const normalizedHash = expectedHash.startsWith('0x') ? expectedHash.slice(2) : expectedHash;
      const contractHash   = details.hashlock.startsWith('0x') ? details.hashlock.slice(2) : details.hashlock;
      if (normalizedHash.toLowerCase() !== contractHash.toLowerCase()) {
        return { valid: false, reason: 'Secret hash mismatch' };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `RPC error: ${err.message}` };
    }
  }

  async getRevealedSecret(lockId: string): Promise<string | null> {
    try {
      const details = await this._getContractDetails(lockId);
      if (!details?.withdrawn) return null;
      if (!details.preimage || details.preimage === ethers.ZeroHash) return null;
      const hex = details.preimage.startsWith('0x') ? details.preimage.slice(2) : details.preimage;
      return hex.toLowerCase();
    } catch {
      return null;
    }
  }

  async isExpiredOrRefunded(lockId: string, timelockUnix: number): Promise<boolean> {
    try {
      const details = await this._getContractDetails(lockId);
      if (!details) return true;
      if (details.refunded) return true;
      const now = Math.floor(Date.now() / 1000);
      return now > timelockUnix + this.graceSecs;
    } catch {
      return false;
    }
  }

  // ── BaseMonitor.pollSwaps ───────────────────────────────────────────────────

  /**
   * Poll active EVM-locked swaps in the DB.
   * Handles both legacy `evm_contract_id` (QBTC/USDC) and future `side_b_lock_id`.
   */
  protected async pollSwaps(): Promise<void> {
    const rpcUrl      = this.config.rpcUrl;
    const htlcAddress = this.config.htlcContractAddress;
    if (!rpcUrl || !htlcAddress) return;

    // Query both legacy EVM_LOCKED and new multi-chain SIDE_B_LOCKED statuses
    // The quote_chain filter ensures this monitor only handles its chain
    const result = await this.pool.query(`
      SELECT * FROM atomic_swaps
      WHERE status IN ('EVM_LOCKED', 'SIDE_B_LOCKED')
        AND (
          quote_chain = $1
          OR (quote_chain IS NULL AND $1 = 'USDC')
        )
    `, [this.chain]);

    for (const swap of result.rows) {
      await this._processSwap(swap);
    }
  }

  private async _processSwap(swap: any): Promise<void> {
    // Support both legacy (evm_contract_id) and new (side_b_lock_id) columns
    const contractId: string | null = swap.evm_contract_id || swap.side_b_lock_id;
    if (!contractId) return;

    try {
      const details = await this._getContractDetails(contractId);
      if (!details) return;

      const { withdrawn, refunded, preimage } = details;

      if (withdrawn && preimage && preimage !== ethers.ZeroHash) {
        const secretHex = preimage.startsWith('0x') ? preimage.slice(2) : preimage;

        // Verify preimage matches the stored secret hash
        const revealedHash = crypto
          .createHash('sha256')
          .update(Buffer.from(secretHex, 'hex'))
          .digest('hex');

        const storedHash = String(swap.secret_hash || '').toLowerCase();
        if (storedHash && revealedHash !== storedHash) {
          console.error(`[EvmMonitor:${this.chain}] Hash mismatch for swap ${swap.id} — discarding`);
          return;
        }

        await this.pool.query(
          `UPDATE atomic_swaps SET secret = $1, status = 'COMPLETE', updated_at = NOW() WHERE id = $2`,
          [secretHex, swap.id],
        );
        console.log(`[EvmMonitor:${this.chain}] Swap ${swap.id} → COMPLETE`);

        // Record TRADE price tick (legacy QBTC/USDC columns used where present)
        await this._recordTradeTick(swap);

      } else if (refunded) {
        await this.pool.query(
          `UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
          [swap.id],
        );
        console.log(`[EvmMonitor:${this.chain}] Swap ${swap.id} → EXPIRED (refunded)`);

      } else {
        // Check if past timelock + grace
        const locktime: number = swap.evm_locktime || swap.side_b_locktime || 0;
        const now = Math.floor(Date.now() / 1000);
        if (locktime > 0 && now > locktime + this.graceSecs) {
          await this.pool.query(
            `UPDATE atomic_swaps SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
            [swap.id],
          );
          console.log(`[EvmMonitor:${this.chain}] Swap ${swap.id} → EXPIRED (timeout)`);
        }
      }
    } catch (err: any) {
      console.error(`[EvmMonitor:${this.chain}] Swap ${swap.id}:`, err?.message);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _getContractDetails(contractId: string): Promise<{
    amount: bigint;
    hashlock: string;
    timelock: bigint;
    withdrawn: boolean;
    refunded: boolean;
    preimage: string;
  } | null> {
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const abi = this.config.isNative ? NATIVE_HTLC_GET_ABI : ERC20_HTLC_GET_ABI;
    const htlc = new ethers.Contract(this.config.htlcContractAddress, abi, provider);
    const id = contractId.startsWith('0x') ? contractId : `0x${contractId}`;
    const d = await htlc.getContract(id);

    if (this.config.isNative) {
      return {
        amount:    d[2] as bigint,
        hashlock:  d[3] as string,
        timelock:  d[4] as bigint,
        withdrawn: d[5] as boolean,
        refunded:  d[6] as boolean,
        preimage:  d[7] as string,
      };
    }
    return {
      amount:    d[3] as bigint,
      hashlock:  d[4] as string,
      timelock:  d[5] as bigint,
      withdrawn: d[6] as boolean,
      refunded:  d[7] as boolean,
      preimage:  d[8] as string,
    };
  }

  private _parseAmount(amount: string): bigint {
    const decimals = this.config.isNative ? 18 : 6;
    const [whole = '0', frac = ''] = amount.split('.');
    const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
  }

  private async _recordTradeTick(swap: any): Promise<void> {
    try {
      const baseAmt  = parseFloat(swap.qbtc_amount  || swap.side_a_amount  || '0');
      const quoteAmt = parseFloat(swap.usdc_amount  || swap.side_b_amount  || '0');
      if (baseAmt > 0 && quoteAmt > 0) {
        await this.pool.query(
          `INSERT INTO price_ticks (tick_type, price_per_qbtc, qbtc_amount, usdc_amount, swap_id, created_at)
           VALUES ('TRADE', $1, $2, $3, $4, NOW())
           ON CONFLICT DO NOTHING`,
          [quoteAmt / baseAmt, swap.qbtc_amount || swap.side_a_amount, swap.usdc_amount || swap.side_b_amount, swap.id],
        );
      }
    } catch {
      // non-critical — price tick recording failure should not block swap completion
    }
  }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

/**
 * Create an EvmMonitor from environment variables.
 *
 * Required env vars per chain:
 *   USDC: EVM_RPC_URL, EVM_HTLC_CONTRACT
 *   ETH:  ETH_RPC_URL, ETH_HTLC_CONTRACT
 *   BNB:  BNB_RPC_URL, BNB_HTLC_CONTRACT
 */
export function createEvmMonitor(chain: 'USDC' | 'ETH' | 'BNB'): EvmMonitor | null {
  switch (chain) {
    case 'USDC': {
      const rpcUrl      = process.env.EVM_RPC_URL || '';
      const htlcAddress = process.env.EVM_HTLC_CONTRACT || '';
      if (!rpcUrl || !htlcAddress) return null;
      return new EvmMonitor({ chain: 'USDC', rpcUrl, htlcContractAddress: htlcAddress, isNative: false });
    }
    case 'ETH': {
      const rpcUrl      = process.env.ETH_RPC_URL || '';
      const htlcAddress = process.env.ETH_HTLC_CONTRACT || '';
      if (!rpcUrl || !htlcAddress) return null;
      return new EvmMonitor({ chain: 'ETH', rpcUrl, htlcContractAddress: htlcAddress, isNative: true });
    }
    case 'BNB': {
      const rpcUrl      = process.env.BNB_RPC_URL || '';
      const htlcAddress = process.env.BNB_HTLC_CONTRACT || '';
      if (!rpcUrl || !htlcAddress) return null;
      return new EvmMonitor({ chain: 'BNB', rpcUrl, htlcContractAddress: htlcAddress, isNative: true });
    }
  }
}
