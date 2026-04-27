/**
 * index.ts — Chain Adapter Factory
 *
 * Single entry point for all chain adapter instances.
 *
 * Usage (client-side):
 *   import { getAdapter, SUPPORTED_PAIRS } from '@/lib/adapters';
 *
 *   const adapter = getAdapter('USDC');
 *   const { lockId } = await adapter.lockFunds({ ... });
 *
 * All adapters implement IChainAdapter.  The factory selects the correct
 * implementation and default config automatically from env vars.
 */

export type { IChainAdapter, ChainId, LockParams, LockResult, ClaimParams, RefundParams, BitcoinUtxo, BtcSignerKey } from './IChainAdapter.ts';
export { SUPPORTED_CHAINS, SUPPORTED_PAIRS, isPairSupported } from './IChainAdapter.ts';

export { EvmAdapter, getEvmAdapterConfig } from './EvmAdapter.ts';
export type { EvmAdapterConfig } from './EvmAdapter.ts';

export { BitcoinAdapter, getBitcoinAdapterConfig, getUtxosBtc } from './BitcoinAdapter.ts';
export type { BitcoinAdapterConfig, BitcoinNetwork } from './BitcoinAdapter.ts';

export { XrplAdapter, getXrplAdapterConfig, encodeFulfillment, encodeCondition, decodeFulfillmentPreimage } from './XrplAdapter.ts';
export type { XrplAdapterConfig } from './XrplAdapter.ts';

import type { IChainAdapter, ChainId } from './IChainAdapter.ts';
import { EvmAdapter, getEvmAdapterConfig } from './EvmAdapter.ts';
import { BitcoinAdapter, getBitcoinAdapterConfig } from './BitcoinAdapter.ts';
import { XrplAdapter, getXrplAdapterConfig } from './XrplAdapter.ts';

/**
 * Get the default adapter for a given chain, configured from environment variables.
 *
 * Uses testnet by default.  Set VITE_SWAP_NETWORK=mainnet for production.
 */
export function getAdapter(chain: ChainId): IChainAdapter {
  const isTestnet = (import.meta.env.VITE_SWAP_NETWORK || 'testnet') !== 'mainnet';

  switch (chain) {
    case 'USDC':
      return new EvmAdapter(getEvmAdapterConfig('USDC'));
    case 'ETH':
      return new EvmAdapter(getEvmAdapterConfig('ETH'));
    case 'BNB':
      return new EvmAdapter(getEvmAdapterConfig('BNB'));
    case 'QBTC':
      return new BitcoinAdapter(getBitcoinAdapterConfig('QBTC', isTestnet ? 'testnet' : 'mainnet'));
    case 'BTC':
      return new BitcoinAdapter(getBitcoinAdapterConfig('BTC', isTestnet ? 'testnet' : 'mainnet'));
    case 'XRP':
      return new XrplAdapter(getXrplAdapterConfig(isTestnet));
    default:
      throw new Error(`No adapter available for chain: ${chain}`);
  }
}

/**
 * Get a pair of adapters for a swap — one for each side.
 *
 * The returned pair can be used to:
 *   baseAdapter.lockFunds(...)   — maker locks base chain
 *   quoteAdapter.lockFunds(...)  — taker locks quote chain
 *
 * @param base  Chain the maker is selling (e.g. 'QBTC')
 * @param quote Chain the taker is selling (e.g. 'USDC')
 */
export function getAdapterPair(
  base: ChainId,
  quote: ChainId,
): { baseAdapter: IChainAdapter; quoteAdapter: IChainAdapter } {
  return {
    baseAdapter: getAdapter(base),
    quoteAdapter: getAdapter(quote),
  };
}

/**
 * Determine which side of a swap the server must monitor to detect the secret.
 *
 * In standard HTLC protocol:
 *   - Maker locks base chain first (longer timelock)
 *   - Taker locks quote chain second (shorter timelock)
 *   - Maker reveals secret by claiming taker's (quote) funds
 *   - Server monitors the quote chain for the revealed preimage
 *
 * Returns 'base' if the server should monitor the base chain (unusual case),
 * or 'quote' for the standard case.
 */
export function getMonitoredSide(_base: ChainId, _quote: ChainId): 'base' | 'quote' {
  // Standard protocol: always monitor the quote (taker) chain
  return 'quote';
}
