// client/src/lib/transactionService.ts
// Multi-chain transaction history fetching

import axios from 'axios';
import type { Chain } from './balanceService';

export interface Transaction {
  hash: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  to: string;
  from: string;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  chain: Chain;
  blockNumber?: number;
  fee?: string;
}

/**
 * Fetch Ethereum transactions via Etherscan API (Sepolia)
 */
export async function fetchEthereumTransactions(address: string): Promise<Transaction[]> {
  try {
    // Using public Etherscan API (rate limited - consider getting API key)
    const response = await axios.get(
      `https://api-sepolia.etherscan.io/api`,
      {
        params: {
          module: 'account',
          action: 'txlist',
          address,
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: 10, // Last 10 transactions
          sort: 'desc',
        },
      }
    );

    if (response.data.status !== '1') {
      console.error('Etherscan API error:', response.data.message);
      return [];
    }

    return response.data.result.map((tx: any) => ({
      hash: tx.hash,
      type: tx.to.toLowerCase() === address.toLowerCase() ? 'receive' : 'send',
      amount: (parseInt(tx.value) / 1e18).toFixed(6),
      token: 'ETH',
      to: tx.to,
      from: tx.from,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000),
      status: tx.txreceipt_status === '1' ? 'confirmed' : 'failed',
      chain: 'ethereum' as const,
      blockNumber: parseInt(tx.blockNumber),
      fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
    }));
  } catch (error) {
    console.error('Failed to fetch Ethereum transactions:', error);
    return [];
  }
}

/**
 * Fetch Bitcoin transactions via Blockstream API
 */
export async function fetchBitcoinTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}/txs`
    );

    const txs = response.data.slice(0, 10); // Last 10 transactions

    return txs.map((tx: any) => {
      // Determine if send or receive
      const isReceive = tx.vout.some((out: any) => 
        out.scriptpubkey_address === address
      );

      // Calculate amount
      let amount = 0;
      if (isReceive) {
        tx.vout.forEach((out: any) => {
          if (out.scriptpubkey_address === address) {
            amount += out.value;
          }
        });
      } else {
        tx.vin.forEach((input: any) => {
          if (input.prevout?.scriptpubkey_address === address) {
            amount += input.prevout.value;
          }
        });
      }

      return {
        hash: tx.txid,
        type: isReceive ? 'receive' : 'send',
        amount: (amount / 100000000).toFixed(8), // Satoshis to BTC
        token: 'BTC',
        to: tx.vout[0]?.scriptpubkey_address || 'Multiple',
        from: tx.vin[0]?.prevout?.scriptpubkey_address || 'Multiple',
        timestamp: new Date(tx.status.block_time * 1000),
        status: tx.status.confirmed ? 'confirmed' : 'pending',
        chain: 'bitcoin' as const,
        blockNumber: tx.status.block_height,
      };
    });
  } catch (error) {
    console.error('Failed to fetch Bitcoin transactions:', error);
    return [];
  }
}

/**
 * Fetch BSC transactions via BSCScan API (Testnet)
 */
export async function fetchBSCTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await axios.get(
      `https://api-testnet.bscscan.com/api`,
      {
        params: {
          module: 'account',
          action: 'txlist',
          address,
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: 10,
          sort: 'desc',
        },
      }
    );

    if (response.data.status !== '1') {
      return [];
    }

    return response.data.result.map((tx: any) => ({
      hash: tx.hash,
      type: tx.to.toLowerCase() === address.toLowerCase() ? 'receive' : 'send',
      amount: (parseInt(tx.value) / 1e18).toFixed(6),
      token: 'BNB',
      to: tx.to,
      from: tx.from,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000),
      status: tx.txreceipt_status === '1' ? 'confirmed' : 'failed',
      chain: 'bsc' as const,
      blockNumber: parseInt(tx.blockNumber),
    }));
  } catch (error) {
    console.error('Failed to fetch BSC transactions:', error);
    return [];
  }
}

/**
 * Fetch XRP transactions via XRPL public node
 */
export async function fetchXRPTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await axios.post('https://s1.ripple.com:51234/', {
      method: 'account_tx',
      params: [
        {
          account: address,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: 10,
        },
      ],
    });

    if (!response.data.result?.transactions) {
      return [];
    }

    return response.data.result.transactions.map((item: any) => {
      const tx = item.tx;
      const meta = item.meta;
      
      const isReceive = tx.Destination === address;
      const amount = tx.Amount ? (parseInt(tx.Amount) / 1000000).toFixed(6) : '0';

      return {
        hash: tx.hash,
        type: isReceive ? 'receive' : 'send',
        amount,
        token: 'XRP',
        to: tx.Destination,
        from: tx.Account,
        timestamp: new Date((tx.date + 946684800) * 1000), // Ripple epoch
        status: meta.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
        chain: 'xrp' as const,
        blockNumber: tx.ledger_index,
      };
    });
  } catch (error) {
    console.error('Failed to fetch XRP transactions:', error);
    return [];
  }
}

/**
 * Fetch Solana transactions via RPC (Devnet)
 */
export async function fetchSolanaTransactions(address: string): Promise<Transaction[]> {
  try {
    const response = await axios.post(
      'https://api.devnet.solana.com',
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          address,
          { limit: 10 },
        ],
      }
    );

    if (!response.data.result) {
      return [];
    }

    // Note: This only gets signatures, not full transaction details
    // For production, you'd need to call getTransaction for each signature
    return response.data.result.map((sig: any) => ({
      hash: sig.signature,
      type: 'send', // Would need full tx to determine
      amount: '0', // Would need full tx to get amount
      token: 'SOL',
      to: 'Unknown',
      from: address,
      timestamp: new Date(sig.blockTime * 1000),
      status: sig.err ? 'failed' : 'confirmed',
      chain: 'solana' as const,
      blockNumber: sig.slot,
    }));
  } catch (error) {
    console.error('Failed to fetch Solana transactions:', error);
    return [];
  }
}

/**
 * Fetch transactions for specific chain
 */
export async function fetchChainTransactions(
  chain: Chain,
  address: string
): Promise<Transaction[]> {
  switch (chain) {
    case 'ethereum':
      return fetchEthereumTransactions(address);
    case 'bitcoin':
      return fetchBitcoinTransactions(address);
    case 'bsc':
      return fetchBSCTransactions(address);
    case 'xrp':
      return fetchXRPTransactions(address);
    case 'solana':
      return fetchSolanaTransactions(address);
    default:
      return [];
  }
}

/**
 * Fetch transactions for all chains
 */
export async function fetchAllTransactions(addresses: {
  ethereum: string;
  bitcoin: string;
  bsc: string;
  xrp: string;
  solana: string;
}): Promise<Transaction[]> {
  try {
    const [ethTxs, btcTxs, bscTxs, xrpTxs, solTxs] = await Promise.all([
      fetchEthereumTransactions(addresses.ethereum),
      fetchBitcoinTransactions(addresses.bitcoin),
      fetchBSCTransactions(addresses.bsc),
      fetchXRPTransactions(addresses.xrp),
      fetchSolanaTransactions(addresses.solana),
    ]);

    // Combine and sort by timestamp
    const allTxs = [...ethTxs, ...btcTxs, ...bscTxs, ...xrpTxs, ...solTxs];
    allTxs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Cache transactions
    localStorage.setItem('cached_transactions', JSON.stringify({
      transactions: allTxs,
      timestamp: Date.now(),
    }));

    return allTxs;
  } catch (error) {
    console.error('Failed to fetch all transactions:', error);
    return [];
  }
}

/**
 * Get cached transactions
 */
export function getC*

