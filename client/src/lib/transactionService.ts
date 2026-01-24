// client/src/lib/transactionService.ts
// Multi-chain transaction fetching service

import axios from 'axios';
import { xrplService } from './xrpService';
import { dropsToXrp } from 'xrpl';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

export interface Transaction {
  hash: string;
  type: 'send' | 'receive';
  amount: string;
  token: string;
  to: string;
  from: string;
  timestamp: Date;
  status: 'confirmed' | 'pending' | 'failed';
  chain: Chain;
  blockNumber?: number;
  fee?: string;
}

/**
 * Fetch Ethereum transactions via Etherscan API v2
 */
export async function fetchEthereumTransactions(
  address: string, 
  useMainnet = false
): Promise<Transaction[]> {
  try {
    // Updated to v2 API endpoints
    const apiUrl = useMainnet
      ? 'https://api.etherscan.io/v2/api'
      : 'https://api-sepolia.etherscan.io/v2/api';
    
    console.log(`🔍 Fetching ETH transactions from ${useMainnet ? 'MAINNET' : 'SEPOLIA'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        chainid: useMainnet ? 1 : 11155111, // Mainnet = 1, Sepolia = 11155111
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset: 20,
        sort: 'desc',
        apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
      },
    });

    console.log('📦 Etherscan API Response:', response.data);

    if (response.data.status !== '1') {
      console.warn('⚠️ Etherscan API error:', response.data.message);
      return [];
    }

    const txs = response.data.result.map((tx: any) => ({
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

    console.log(`✅ Found ${txs.length} ETH transactions`);
    return txs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Ethereum transactions:', error.message);
    return [];
  }
}

/**
 * Fetch Bitcoin transactions via Blockstream API
 */
export async function fetchBitcoinTransactions(
  address: string,
  useMainnet = true
): Promise<Transaction[]> {
  try {
    const apiUrl = useMainnet
      ? `https://blockstream.info/api/address/${address}/txs`
      : `https://blockstream.info/testnet/api/address/${address}/txs`;
    
    console.log(`🔍 Fetching BTC transactions from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      timeout: 10000,
    });
    
    console.log('📦 BTC API Response:', response.data);

    const txs: Transaction[] = response.data.slice(0, 20).map((tx: any) => {
      // Determine if this is a send or receive
      const isReceive = tx.vout.some((out: any) => 
        out.scriptpubkey_address === address
      );
      
      // Calculate amount (sum of relevant outputs)
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
        amount: (amount / 100000000).toFixed(8),
        token: 'BTC',
        to: tx.vout[0]?.scriptpubkey_address || '',
        from: tx.vin[0]?.prevout?.scriptpubkey_address || '',
        timestamp: new Date(tx.status.block_time * 1000),
        status: tx.status.confirmed ? 'confirmed' : 'pending',
        chain: 'bitcoin' as const,
        blockNumber: tx.status.block_height,
        fee: (tx.fee / 100000000).toFixed(8),
      };
    });

    console.log(`✅ Found ${txs.length} BTC transactions`);
    return txs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Bitcoin transactions:', error.message);
    return [];
  }
}

/**
 * Fetch BSC transactions via BscScan API (similar to Etherscan)
 */
export async function fetchBSCTransactions(
  address: string,
  useMainnet = false
): Promise<Transaction[]> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.bscscan.com/api'
      : 'https://api-testnet.bscscan.com/api';
    
    console.log(`🔍 Fetching BNB transactions from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.get(apiUrl, {
      params: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset: 20,
        sort: 'desc',
        apikey: import.meta.env.VITE_BSCSCAN_API_KEY || '',
      },
    });

    console.log('📦 BscScan API Response:', response.data);

    if (response.data.status !== '1') {
      console.warn('⚠️ BscScan API error:', response.data.message);
      return [];
    }

    const txs = response.data.result.map((tx: any) => ({
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
      fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
    }));

    console.log(`✅ Found ${txs.length} BNB transactions`);
    return txs;
  } catch (error: any) {
    console.error('❌ Failed to fetch BSC transactions:', error.message);
    return [];
  }
}

/**
 * Fetch XRP transactions using official xrpl.js library
 */
export async function fetchXRPTransactions(
  address: string,
  useMainnet = true
): Promise<Transaction[]> {
  try {
    const txs = await xrplService.getTransactions(address, useMainnet, 20);
    
    const transactions: Transaction[] = txs.map((item: any) => {
      const tx = item.tx;
      const meta = item.meta;
      
      const isReceive = tx.Destination === address;
      
      let amount = '0';
      if (typeof tx.Amount === 'string') {
        amount = dropsToXrp(tx.Amount);
      } else if (tx.Amount?.value) {
        amount = tx.Amount.value;
      }
      
      return {
        hash: tx.hash,
        type: isReceive ? 'receive' : 'send',
        amount: parseFloat(amount).toFixed(6),
        token: 'XRP',
        to: tx.Destination || '',
        from: tx.Account || '',
        timestamp: new Date((tx.date + 946684800) * 1000),
        status: meta.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
        chain: 'xrp' as const,
        blockNumber: tx.ledger_index,
        fee: dropsToXrp(tx.Fee),
      };
    });
    
    console.log(`✅ Found ${transactions.length} XRP transactions`);
    return transactions;
  } catch (error: any) {
    console.error('❌ Failed to fetch XRP transactions:', error.message);
    return [];
  }
}

/**
 * Fetch Solana transactions via RPC
 */
export async function fetchSolanaTransactions(
  address: string,
  useMainnet = false
): Promise<Transaction[]> {
  try {
    const rpcUrl = useMainnet
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com';
    
    console.log(`🔍 Fetching SOL transactions from ${useMainnet ? 'MAINNET' : 'DEVNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit: 20 }],
    }, {
      timeout: 10000,
    });

    console.log('📦 SOL API Response:', response.data);

    if (!response.data.result) {
      return [];
    }

    const txs: Transaction[] = response.data.result.map((tx: any) => ({
      hash: tx.signature,
      type: 'receive', // Would need to fetch full tx to determine
      amount: '0', // Would need to fetch full tx details
      token: 'SOL',
      to: address,
      from: '',
      timestamp: new Date(tx.blockTime * 1000),
      status: tx.err ? 'failed' : 'confirmed',
      chain: 'solana' as const,
      blockNumber: tx.slot,
    }));

    console.log(`✅ Found ${txs.length} SOL transactions`);
    return txs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Solana transactions:', error.message);
    return [];
  }
}

/**
 * Fetch transactions for any chain
 */
export async function fetchChainTransactions(
  chain: Chain,
  address: string,
  useMainnet = false
): Promise<Transaction[]> {
  console.log(`📡 Fetching ${chain} transactions for ${address} (${useMainnet ? 'mainnet' : 'testnet'})`);
  
  try {
    switch (chain) {
      case 'ethereum':
        return await fetchEthereumTransactions(address, useMainnet);
      case 'bitcoin':
        return await fetchBitcoinTransactions(address, useMainnet);
      case 'bsc':
        return await fetchBSCTransactions(address, useMainnet);
      case 'xrp':
        return await fetchXRPTransactions(address, useMainnet);
      case 'solana':
        return await fetchSolanaTransactions(address, useMainnet);
      default:
        return [];
    }
  } catch (error) {
    console.error(`Failed to fetch ${chain} transactions:`, error);
    return [];
  }
}
