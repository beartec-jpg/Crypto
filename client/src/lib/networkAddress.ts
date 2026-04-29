import type { Chain } from './balanceService';
import type { TokenNetwork } from './tokenService';

export interface WalletAddresses {
  ethereum: string;
  bitcoin: string;
  bitcoinTestnet?: string;
  bsc: string;
  xrp: string;
  xrpTestnet?: string;
  solana: string;
  solanaTestnet?: string;
  qbtc: string;
  qbtcMainnet?: string;
  qbtcVault?: string;
  qbtcVaultMainnet?: string;
}

export function getChainNetworkAddress(
  addresses: WalletAddresses,
  chain: Chain,
  network: TokenNetwork = 'mainnet'
): string {
  if (chain === 'qbtc') {
    return network === 'mainnet'
      ? (addresses.qbtcMainnet || addresses.qbtc)
      : addresses.qbtc;
  }

  if (chain === 'bitcoin') {
    return network === 'testnet'
      ? (addresses.bitcoinTestnet || '')
      : addresses.bitcoin;
  }

  if (chain === 'xrp') {
    return network === 'testnet'
      ? (addresses.xrpTestnet || addresses.xrp)
      : addresses.xrp;
  }

  if (chain === 'solana') {
    return network === 'testnet'
      ? (addresses.solanaTestnet || '')
      : addresses.solana;
  }

  return addresses[chain];
}

export function getVaultNetworkAddress(
  addresses: WalletAddresses,
  network: TokenNetwork = 'mainnet'
): string {
  return network === 'mainnet'
    ? (addresses.qbtcVaultMainnet || addresses.qbtcVault || '')
    : (addresses.qbtcVault || addresses.qbtcVaultMainnet || '');
}
