/**
 * index.ts — Server-side chain monitor factory
 *
 * Single entry point for starting all chain monitors.
 *
 * Usage in swap-server/index.ts:
 *   import { startAllMonitors } from './adapters/index.ts';
 *   const monitors = startAllMonitors(pool);
 *   // monitors.length tells you how many are active (depends on env vars)
 *
 * A monitor is skipped silently if its required env vars are absent, so the
 * server boots on a clean deployment with only the env vars that are set.
 *
 * Required env vars per chain:
 *   USDC: EVM_RPC_URL, EVM_HTLC_CONTRACT
 *   ETH:  ETH_RPC_URL, ETH_HTLC_CONTRACT
 *   BNB:  BNB_RPC_URL, BNB_HTLC_CONTRACT
 *   QBTC: (automatic — always started, defaults to QBTC_RPC_URL || http://localhost:18443)
 *   BTC:  BTC_ESPLORA_URL  (optional override, defaults to Blockstream testnet)
 *   XRP:  XRPL_WS_URL
 */

import type { Pool } from 'pg';
import { createEvmMonitor, EvmMonitor } from './EvmMonitor.ts';
import { createBitcoinMonitor, BitcoinMonitor } from './BitcoinMonitor.ts';
import { createXrplMonitor, XrplMonitor } from './XrplMonitor.ts';
import type { BaseMonitor } from './IChainAdapter.ts';

export { EvmMonitor, createEvmMonitor };
export { BitcoinMonitor, createBitcoinMonitor };
export { XrplMonitor, createXrplMonitor };
export { BaseMonitor };
export type { IChainMonitor, LockVerification, ChainId } from './IChainAdapter.ts';

export type ActiveMonitor = EvmMonitor | BitcoinMonitor | XrplMonitor;

/**
 * Start all chain monitors that are configured in the environment.
 *
 * @param pool    Shared Postgres pool
 * @param pollMs  Poll interval in milliseconds (default 60 s)
 * @returns       Array of started monitors (may be fewer than 6 if env vars missing)
 */
export function startAllMonitors(pool: Pool, pollMs = 60_000): ActiveMonitor[] {
  const started: ActiveMonitor[] = [];

  function tryStart(label: string, monitor: ActiveMonitor | null): void {
    if (!monitor) {
      console.log(`[monitors] ${label}: skipped (env vars not set)`);
      return;
    }
    monitor.start(pool, pollMs);
    started.push(monitor);
    console.log(`[monitors] ${label}: started (poll every ${pollMs / 1000}s)`);
  }

  // EVM monitors — each requires its own RPC + HTLC contract env vars
  tryStart('EvmMonitor(USDC)', createEvmMonitor('USDC'));
  tryStart('EvmMonitor(ETH)',  createEvmMonitor('ETH'));
  tryStart('EvmMonitor(BNB)',  createEvmMonitor('BNB'));

  // Bitcoin-family monitors — QBTC always starts (RPC defaults to localhost)
  tryStart('BitcoinMonitor(QBTC)', createBitcoinMonitor('QBTC'));
  tryStart('BitcoinMonitor(BTC)',  createBitcoinMonitor('BTC'));

  // XRPL monitor — requires XRPL_WS_URL
  tryStart('XrplMonitor(XRP)', createXrplMonitor());

  console.log(`[monitors] ${started.length} monitor(s) active: ${started.map(m => m.chain).join(', ') || '(none)'}`);
  return started;
}

/**
 * Stop all running monitors cleanly.
 * Call this on SIGTERM / SIGINT.
 */
export function stopAllMonitors(monitors: ActiveMonitor[]): void {
  for (const m of monitors) {
    m.stop();
  }
  console.log(`[monitors] all ${monitors.length} monitor(s) stopped`);
}
