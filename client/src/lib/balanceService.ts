// client/src/lib/balanceService.ts
// Multi-chain balance fetching service

import axios from 'axios';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export interface ChainBalance {
  chain: Chain;
  balance: string;
  usdValue?: number;
  usdPrice?: number;
}

interface CoinGeckoPrices {
  ethereum: { usd: number };
  bitcoin: { usd: number };
  binancecoin: { usd: number };
  ripple: { usd: number };
  solana: { usd: number };
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
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch prices:', error);
    // Return fallback prices
    return {
      ethereum: { usd: 2000 },
      bitcoin: { usd: 40000 },
      binancecoin: { usd: 300 },
      ripple: { usd: 0.5 },
      solana: { usd: 100 },
    };
  }
}

/**
 * Fetch Ethereum balance via Etherscan API (Sepolia)
 */
export async function fetchEthereumBalance(address: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api-sepolia.etherscan.io/api`,
      {
        params: {
          module: 'account',
          action: 'balance',
          address,
          tag: 'latest',
        },
      }
    );

    if (response.data.status === '1') {
      // Convert Wei to ETH
      const balanceWei = response.data.result;
      const balanceEth = parseFloat(balanceWei) / 1e18;
      return balanceEth.toFixed(6);
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch Ethereum balance:', error);
    return '0';
  }
}

/**
 * Fetch Bitcoin balance via Blockstream API
 */
export async function fetchBitcoinBalance(address: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}`
    );

    // Balance is in satoshis, convert to BTC
    const balanceSats = response.data.chain_stats.funded_txo_sum - 
                        response.data.chain_stats.spent_txo_sum;
    const balanceBTC = balanceSats / 100000000;
    return balanceBTC.toFixed(8);
  } catch (error) {
    console.error('Failed to fetch Bitcoin balance:', error);
    return '0';
  }
}

/**
 * Fetch BSC balance via BSCScan API (Testnet)
 */
export async function fetchBSCBalance(address: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api-testnet.bscscan.com/api`,
      {
        params: {
          module: 'account',
          action: 'balance',
          address,
          tag: 'latest',
        },
      }
    );

    if (response.data.status === '1') {
      const balanceWei = response.data.result;
      const balanceBNB = parseFloat(balanceWei) / 1e18;
      return balanceBNB.toFixed(6);
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch BSC balance:', error);
    return '0';
  }
}

/**
 * Fetch XRP balance via XRPL public node
 */
export async function fetchXRPBalance(address: string): Promise<string> {
  try {
    const response = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_info',
      params: [
        {
          account: address,
          ledger_index: 'validated',
        },
      ],
    });

    if (response.data.result?.account_data?.Balance) {
      // Balance is in drops, convert to XRP (1 XRP = 1,000,000 drops)
      const balanceDrops = parseInt(response.data.result.account_data.Balance);
      const balanceXRP = balanceDrops / 1000000;
      return balanceXRP.toFixed(6);
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch XRP balance:', error);
    return '0';
  }
}

/**
 * Fetch Solana balance via RPC (Devnet)
 */
export async function fetchSolanaBalance(address: string): Promise<string> {
  try {
    const response = await axios.post(
      'https://api.devnet.solana.com',
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }
    );

    if (response.data.result?.value !== undefined) {
      // Balance is in lamports, convert to SOL (1 SOL = 1,000,000,000 lamports)
      const balanceLamports = response.data.result.value;
      const balanceSOL = balanceLamports / 1000000000;
      return balanceSOL.toFixed(6);
    }
    return '0';
  } catch (error) {
    console.error('Failed to fetch Solana balance:', error);
    return '0';
  }
}

/**
 * Fetch balance for a specific chain
 */
export async function fetchChainBalance(
  chain: Chain,
  address: string
): Promise<ChainBalance> {
  let balance = '0';

  switch (chain) {
    case 'ethereum':
      balance = await fetchEthereumBalance(address);
      break;
    case 'bitcoin':
      balance = await fetchBitcoinBalance(address);
      break;
    case 'bsc':
      balance = await fetchBSCBalance(address);
      break;
    case 'xrp':
      balance = await fetchXRPBalance(address);
      break;
    case 'solana':
      balance = await fetchSolanaBalance(address);
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
}): Promise<ChainBalance[]> {
  try {
    // Fetch prices first
    const prices = await fetchPrices();

    // Fetch all balances in parallel
    const [ethBalance, btcBalance, bscBalance, xrpBalance, solBalance] = await Promise.all([
      fetchEthereumBalance(addresses.ethereum),
      fetchBitcoinBalance(addresses.bitcoin),
      fetchBSCBalance(addresses.bsc),
      fetchXRPBalance(addresses.xrp),
      fetchSolanaBalance(addresses.solana),
    ]);

    // Calculate USD values
    const balances: ChainBalance[] = [
      {
        chain: 'ethereum',
        balance: ethBalance,
        usdValue: parseFloat(ethBalance) * prices.ethereum.usd,
        usdPrice: prices.ethereum.usd,
      },
      {
        chain: 'bitcoin',
        balance: btcBalance,
        usdValue: parseFloat(btcBalance) * prices.bitcoin.usd,
        usdPrice: prices.bitcoin.usd,
      },
      {
        chain: 'bsc',
        balance: bscBalance,
        usdValue: parseFloat(bscBalance) * prices.binancecoin.usd,
        usdPrice: prices.binancecoin.usd,
      },
      {
        chain: 'xrp',
        balance: xrpBalance,
        usdValue: parseFloat(xrpBalance) * prices.ripple.usd,
        usdPrice: prices.ripple.usd,
      },
      {
        chain: 'solana',
        balance: solBalance,
        usdValue: parseFloat(solBalance) * prices.solana.usd,
        usdPrice: prices.solana.usd,
      },
    ];

    // Cache the results
    localStorage.setItem('cached_balances', JSON.stringify({
      balances,
      timestamp: Date.now(),
    }));

    return balances;
  } catch (error) {
    console.error('Failed to fetch all balances:', error);
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

    // Cache expires after 5 minutes
    if (age > 300000) return null;

    return balances;
  } catch {
    return null;
  }
}
