// client/src/lib/balanceService.ts
// Multi-chain balance fetching service - supports MAINNET and TESTNET

import axios from 'axios';
import { xrplService } from './xrpService';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { QBTCChain } from './qbtcService';
import type { TokenNetwork } from './tokenService';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana' | 'qbtc';

export interface ChainBalance {
  chain: Chain;
  balance: string;
  usdValue?: number;
  usdPrice?: number;
  priceChange24h?: number;
}

const qbtcChain = new QBTCChain();

interface CoinGeckoPrices {
  ethereum: { usd: number; usd_24h_change: number };
  bitcoin: { usd: number; usd_24h_change: number };
  binancecoin: { usd: number; usd_24h_change: number };
  ripple: { usd: number; usd_24h_change: number };
  solana: { usd: number; usd_24h_change: number };
}

/**
 * Fetch current prices from CoinGecko
 */
export async function fetchPrices(): Promise<CoinGeckoPrices> {
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: 'ethereum,bitcoin,binancecoin,ripple,solana',
          vs_currencies: 'usd',
          include_24hr_change: 'true',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    return {
      ethereum: { usd: 2925, usd_24h_change: -0.6 },
      bitcoin: { usd: 94000, usd_24h_change: 1.2 },
      binancecoin: { usd: 648, usd_24h_change: 0.8 },
      ripple: { usd: 3.12, usd_24h_change: 2.1 },
      solana: { usd: 244, usd_24h_change: -1.4 },
    };
  }
}

/**
 * Fetch Ethereum balance via Etherscan API v2
 * Supports mainnet (chainid 1) and Sepolia testnet (chainid 11155111)
 */
export async function fetchEthereumBalance(address: string, network: TokenNetwork = 'mainnet'): Promise<string> {
  try {
    const chainId = network === 'testnet' ? 11155111 : 1;
    const networkLabel = network === 'testnet' ? 'TESTNET (Sepolia)' : 'MAINNET';
    console.log(`🔍 Fetching ETH balance from ${networkLabel} for:`, address);
    
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: chainId,
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
        apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
      },
      timeout: 10000,
    });

    console.log('📦 ETH API Response:', response.data);

    if (response.data.status === '1' && response.data.result) {
      const balanceWei = response.data.result;
      const balanceEth = parseFloat(balanceWei) / 1e18;
      console.log(`✅ ETH Balance (${networkLabel}):`, balanceEth, 'ETH');
      return balanceEth.toFixed(6);
    }
    
    console.warn('⚠️ ETH account not found or no balance');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch Ethereum balance:', error.message);
    return '0';
  }
}

/**
 * Fetch Bitcoin balance via Blockstream API
 */
export async function fetchBitcoinBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching BTC balance from MAINNET for:', address);
    
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}`,
      { timeout: 10000 }
    );
    
    console.log('📦 BTC API Response:', response.data);

    const balanceSats = response.data.chain_stats.funded_txo_sum - 
                        response.data.chain_stats.spent_txo_sum;
    const balanceBTC = balanceSats / 100000000;
    console.log('✅ BTC Balance:', balanceBTC, 'BTC');
    return balanceBTC.toFixed(8);
  } catch (error: any) {
    console.error('❌ Failed to fetch Bitcoin balance:', error.message);
    return '0';
  }
}

/**
 * Fetch BSC balance via RPC
 * Supports mainnet and Chapel testnet
 */
export async function fetchBSCBalance(address: string, network: TokenNetwork = 'mainnet'): Promise<string> {
  try {
    // BSC mainnet: https://bsc-dataseed.binance.org/
    // BSC testnet (Chapel): https://data-seed-prebsc-1-s1.binance.org:8545/
    const rpcUrl = network === 'testnet'
      ? 'https://data-seed-prebsc-1-s1.binance.org:8545/'
      : 'https://bsc-dataseed.binance.org/';
    const networkLabel = network === 'testnet' ? 'TESTNET (Chapel)' : 'MAINNET';
    console.log(`🔍 Fetching BNB balance from ${networkLabel} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }, { timeout: 10000 });

    console.log('📦 BNB RPC Response:', response.data);

    if (response.data.result) {
      const balanceWei = parseInt(response.data.result, 16);
      const balanceBNB = balanceWei / 1e18;
      console.log(`✅ BNB Balance (${networkLabel}):`, balanceBNB, 'BNB');
      return balanceBNB.toFixed(6);
    }
    
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch BSC balance:', error.message);
    return '0';
  }
}

/**
 * Fetch XRP balance using official xrpl.js library
 */
export async function fetchXRPBalance(address: string): Promise<string> {
  try {
    if (!xrplService.isValidAddress(address)) {
      console.error('❌ Invalid XRP address format:', address);
      return '0';
    }
    
    const result = await xrplService.getBalance(address, true); // Always mainnet
    
    if (result) {
      return parseFloat(result.balance).toFixed(6);
    }
    
    console.warn('⚠️ XRP account not found or not activated');
    return '0';
  } catch (error: any) {
    console.error('❌ Failed to fetch XRP balance:', error.message);
    return '0';
  }
}

/**
 * Fetch Solana balance via RPC
 */
export async function fetchSolanaBalance(address: string): Promise<string> {
  try {
    console.log('🔍 Fetching SOL balance from MAINNET for:', address);
    
const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
const rpcUrl = HELIUS_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : 'https://rpc.ankr.com/solana';

const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }, { 
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('📦 SOL API Response:', response.data);

    if (response.data.result?.value !== undefined) {
      const balanceLamports = response.data.result.value;
      const balanceSOL = balanceLamports / 1000000000;
      console.log('✅ SOL Balance:', balanceSOL, 'SOL');
      return balanceSOL.toFixed(6);
    }
    
    return '0';
  } catch (error: any) {
    // Gracefully handle rate limits
    if (error.response?.status === 403) {
      console.warn('⚠️ Solana RPC rate limited, returning 0');
      return '0';
    }
    console.error('❌ Failed to fetch Solana balance:', error.message);
    return '0';
  }
}

export async function fetchQBTCBalance(address: string): Promise<string> {
  try {
    return await qbtcChain.getBalance(address);
  } catch (error: any) {
    console.error('❌ Failed to fetch QBTC balance:', error.message);
    return '0';
  }
}

/**
 * Fetch current block/ledger number for a chain
 */
export async function fetchBlockNumber(chain: Chain): Promise<number | null> {
  try {
    switch (chain) {
      case 'ethereum': {
        const response = await axios.post('https://eth.llamarpc.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        return parseInt(response.data.result, 16);
      }

      case 'bitcoin': {
        const response = await axios.get(
          'https://blockstream.info/api/blocks/tip/height',
          { timeout: 5000 }
        );
        return response.data;
      }

      case 'bsc': {
        const response = await axios.post('https://bsc-dataseed.binance.org/', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });
        return parseInt(response.data.result, 16);
      }

      case 'xrp': {
        const ledgerIndex = await xrplService.getLedgerInfo(true);
        return ledgerIndex;
      }

      case 'solana': {
        const response = await axios.post('https://api.mainnet-beta.solana.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'getSlot',
          params: [],
        }, { timeout: 5000 });
        return response.data.result;
      }

      case 'qbtc': {
        return await qbtcChain.getBlockCount();
      }

      default:
        return null;
    }
  } catch (error: any) {
    console.error(`Failed to fetch block number for ${chain}:`, error.message);
    return null;
  }
}

/**
 * Fetch balance for a specific chain
 */
export async function fetchChainBalance(chain: Chain, address: string, network: TokenNetwork = 'mainnet'): Promise<ChainBalance> {
  let balance = '0';

  switch (chain) {
    case 'ethereum':
      balance = await fetchEthereumBalance(address, network);
      break;
    case 'bitcoin':
      balance = await fetchBitcoinBalance(address);
      break;
    case 'bsc':
      balance = await fetchBSCBalance(address, network);
      break;
    case 'xrp':
      balance = await fetchXRPBalance(address);
      break;
    case 'solana':
      balance = await fetchSolanaBalance(address);
      break;
    case 'qbtc':
      balance = await fetchQBTCBalance(address);
      break;
  }

  return { chain, balance };
}

/**
 * Fetch balances for all chains
 */
export async function fetchAllBalances(addresses: {
  ethereum: string;
  bitcoin: string;
  bsc: string;
  xrp: string;
  solana: string;
  qbtc: string;
}, network: TokenNetwork = 'mainnet'): Promise<ChainBalance[]> {
  try {
    const networkLabel = network === 'testnet' ? 'TESTNET' : 'MAINNET';
    const shouldValueInUsd = network === 'mainnet';
    console.log(`🌐 Fetching all ${networkLabel} balances`);
    
    const prices = await fetchPrices();

    const [ethBalance, btcBalance, bscBalance, xrpBalance, solBalance, qbtcBalance] = await Promise.all([
      fetchEthereumBalance(addresses.ethereum, network),
      fetchBitcoinBalance(addresses.bitcoin),
      fetchBSCBalance(addresses.bsc, network),
      fetchXRPBalance(addresses.xrp),
      fetchSolanaBalance(addresses.solana),
      fetchQBTCBalance(addresses.qbtc),
    ]);

    const balances: ChainBalance[] = [
      {
        chain: 'ethereum',
        balance: ethBalance,
        usdValue: shouldValueInUsd ? parseFloat(ethBalance) * prices.ethereum.usd : 0,
        usdPrice: shouldValueInUsd ? prices.ethereum.usd : 0,
        priceChange24h: shouldValueInUsd ? prices.ethereum.usd_24h_change : 0,
      },
      {
        chain: 'bitcoin',
        balance: btcBalance,
        usdValue: shouldValueInUsd ? parseFloat(btcBalance) * prices.bitcoin.usd : 0,
        usdPrice: shouldValueInUsd ? prices.bitcoin.usd : 0,
        priceChange24h: shouldValueInUsd ? prices.bitcoin.usd_24h_change : 0,
      },
      {
        chain: 'bsc',
        balance: bscBalance,
        usdValue: shouldValueInUsd ? parseFloat(bscBalance) * prices.binancecoin.usd : 0,
        usdPrice: shouldValueInUsd ? prices.binancecoin.usd : 0,
        priceChange24h: shouldValueInUsd ? prices.binancecoin.usd_24h_change : 0,
      },
      {
        chain: 'xrp',
        balance: xrpBalance,
        usdValue: shouldValueInUsd ? parseFloat(xrpBalance) * prices.ripple.usd : 0,
        usdPrice: shouldValueInUsd ? prices.ripple.usd : 0,
        priceChange24h: shouldValueInUsd ? prices.ripple.usd_24h_change : 0,
      },
      {
        chain: 'solana',
        balance: solBalance,
        usdValue: shouldValueInUsd ? parseFloat(solBalance) * prices.solana.usd : 0,
        usdPrice: shouldValueInUsd ? prices.solana.usd : 0,
        priceChange24h: shouldValueInUsd ? prices.solana.usd_24h_change : 0,
      },
      {
        chain: 'qbtc',
        balance: qbtcBalance,
        usdValue: 0,
        usdPrice: 0,
        priceChange24h: 0,
      },
    ];

    localStorage.setItem('cached_balances', JSON.stringify({
      balances,
      timestamp: Date.now(),
    }));

    console.log(`✅ All ${networkLabel} balances fetched successfully`);
    return balances;
  } catch (error) {
    console.error('❌ Failed to fetch all balances:', error);
    return [];
  }
}

/**
 * Get cached balances
 */
export function getCachedBalances(): ChainBalance[] | null {
  try {
    const cached = localStorage.getItem('cached_balances');
    if (!cached) return null;

    const { balances, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > 300000) return null;

    return balances;
  } catch {
    return null;
  }
}

/**
 * Token balance interface for SPL tokens
 */
export interface SPLTokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
}

/**
 * Fetch SPL token balances for a Solana wallet address
 */
export async function fetchSPLTokenBalances(walletAddress: string): Promise<SPLTokenBalance[]> {
  try {
    console.log('🔍 Fetching SPL token balances for:', walletAddress);
    
    // Create connection to Solana mainnet
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const pubkey = new PublicKey(walletAddress);
    
    // Fetch all token accounts owned by this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    });
    
    console.log(`📦 Found ${tokenAccounts.value.length} SPL token accounts`);
    
    // Parse token balances
    const balances: SPLTokenBalance[] = tokenAccounts.value
      .map(account => {
        const data = account.account.data.parsed.info;
        return {
          mint: data.mint,
          balance: parseInt(data.tokenAmount.amount),
          decimals: data.tokenAmount.decimals,
          uiAmount: data.tokenAmount.uiAmount || 0,
        };
      })
      .filter(token => token.uiAmount > 0); // Only include tokens with non-zero balance
    
    console.log('✅ SPL token balances fetched:', balances.length);
    return balances;
    
  } catch (error: any) {
    console.error('❌ Failed to fetch SPL token balances:', error.message);
    return [];
  }
}
