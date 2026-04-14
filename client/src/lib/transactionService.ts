// client/src/lib/transactionService.ts
// Multi-chain transaction fetching service - MAINNET ONLY

import axios from 'axios';
import { xrplService } from './xrpService';
import { dropsToXrp } from 'xrpl';
import { QBTCChain } from './qbtcService';
import type { TokenNetwork } from './tokenService';

export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana' | 'qbtc';

const qbtcChain = new QBTCChain();

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
 * Fetch Ethereum transactions via Etherscan API v2 (native ETH + ERC20 tokens)
 */
export async function fetchEthereumTransactions(address: string, network: TokenNetwork = 'mainnet'): Promise<Transaction[]> {
  try {
    const chainId = network === 'testnet' ? 11155111 : 1;
    const label = network === 'testnet' ? 'Sepolia' : 'MAINNET';
    console.log(`🔍 Fetching ETH transactions from ${label} for:`, address);
    
    const baseParams = {
      chainid: chainId,
      module: 'account',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 20,
      sort: 'desc',
      apikey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
    };

    // Fetch native ETH transfers and ERC20 token transfers in parallel
    const [nativeResp, tokenResp] = await Promise.all([
      axios.get('https://api.etherscan.io/v2/api', { params: { ...baseParams, action: 'txlist' } }),
      axios.get('https://api.etherscan.io/v2/api', { params: { ...baseParams, action: 'tokentx' } }),
    ]);

    const nativeTxs: Transaction[] = nativeResp.data.status === '1'
      ? nativeResp.data.result.map((tx: any) => ({
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
        }))
      : [];

    const tokenTxs: Transaction[] = tokenResp.data.status === '1'
      ? tokenResp.data.result.map((tx: any) => ({
          hash: tx.hash,
          type: tx.to.toLowerCase() === address.toLowerCase() ? 'receive' : 'send',
          amount: (parseInt(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal) || 18)).toFixed(6),
          token: tx.tokenSymbol || 'ERC20',
          to: tx.to,
          from: tx.from,
          timestamp: new Date(parseInt(tx.timeStamp) * 1000),
          status: 'confirmed' as const,
          chain: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber),
          fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
        }))
      : [];

    const allTxs = [...nativeTxs, ...tokenTxs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    console.log(`✅ Found ${nativeTxs.length} ETH + ${tokenTxs.length} token transactions on ${label}`);
    return allTxs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Ethereum transactions:', error.message);
    return [];
  }
}

/**
 * Fetch Bitcoin transactions via Blockstream API
 */
export async function fetchBitcoinTransactions(address: string): Promise<Transaction[]> {
  try {
    console.log('🔍 Fetching BTC transactions from MAINNET for:', address);
    
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}/txs`,
      { timeout: 10000 }
    );

    const txs: Transaction[] = response.data.slice(0, 20).map((tx: any) => {
      const isReceive = tx.vout.some((out: any) => 
        out.scriptpubkey_address === address
      );
      
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
 * Fetch BSC transactions via BscScan API (native BNB + BEP20 tokens)
 */
export async function fetchBSCTransactions(address: string, network: TokenNetwork = 'mainnet'): Promise<Transaction[]> {
  try {
    const baseUrl = network === 'testnet' ? 'https://api-testnet.bscscan.com/api' : 'https://api.bscscan.com/api';
    const label = network === 'testnet' ? 'BSC Testnet' : 'MAINNET';
    console.log(`🔍 Fetching BNB transactions from ${label} for:`, address);
    
    const baseParams = {
      module: 'account',
      address,
      startblock: 0,
      endblock: 99999999,
      page: 1,
      offset: 20,
      sort: 'desc',
      apikey: import.meta.env.VITE_BSCSCAN_API_KEY || '',
    };

    const [nativeResp, tokenResp] = await Promise.all([
      axios.get(baseUrl, { params: { ...baseParams, action: 'txlist' } }),
      axios.get(baseUrl, { params: { ...baseParams, action: 'tokentx' } }),
    ]);

    const nativeTxs: Transaction[] = nativeResp.data.status === '1'
      ? nativeResp.data.result.map((tx: any) => ({
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
        }))
      : [];

    const tokenTxs: Transaction[] = tokenResp.data.status === '1'
      ? tokenResp.data.result.map((tx: any) => ({
          hash: tx.hash,
          type: tx.to.toLowerCase() === address.toLowerCase() ? 'receive' : 'send',
          amount: (parseInt(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal) || 18)).toFixed(6),
          token: tx.tokenSymbol || 'BEP20',
          to: tx.to,
          from: tx.from,
          timestamp: new Date(parseInt(tx.timeStamp) * 1000),
          status: 'confirmed' as const,
          chain: 'bsc' as const,
          blockNumber: parseInt(tx.blockNumber),
          fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
        }))
      : [];

    const allTxs = [...nativeTxs, ...tokenTxs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    console.log(`✅ Found ${nativeTxs.length} BNB + ${tokenTxs.length} token transactions on ${label}`);
    return allTxs;
  } catch (error: any) {
    console.error('❌ Failed to fetch BSC transactions:', error.message);
    return [];
  }
}

/**
 * Fetch XRP transactions using official xrpl.js library
 */
export async function fetchXRPTransactions(address: string, network: TokenNetwork = 'mainnet'): Promise<Transaction[]> {
  try {
    const txs = await xrplService.getTransactions(address, network === 'mainnet', 20);
    
    const transactions: Transaction[] = txs.map((item: any) => {
      const tx = item.tx;
      const meta = item.meta;
      
      const isReceive = tx.Destination === address;
      
      let amount = '0';
      if (typeof tx.Amount === 'string') {
        amount = dropsToXrp(tx.Amount).toString();
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
        fee: dropsToXrp(tx.Fee).toString(),
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
export async function fetchSolanaTransactions(address: string): Promise<Transaction[]> {
  try {
    console.log('🔍 Fetching SOL transactions from MAINNET for:', address);
    
    const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
    const rpcUrl = HELIUS_KEY 
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
      : 'https://rpc.ankr.com/solana';
    
    const response = await axios.post(rpcUrl, {  // ← YOU NEED THIS LINE!
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

    return txs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Solana transactions:', error.message);
    return [];
  }
}

export async function fetchQBTCTransactions(address: string): Promise<Transaction[]> {
  try {
    return await qbtcChain.listTransactions(address, 20);
  } catch (error: any) {
    console.error('❌ Failed to fetch QBTC transactions:', error.message);
    return [];
  }
}

/**
 * Fetch transactions for any chain
 */
export async function fetchChainTransactions(
  chain: Chain,
  address: string,
  network: TokenNetwork = 'mainnet'
): Promise<Transaction[]> {
  console.log(`📡 Fetching ${chain} transactions for ${address} (${network})`);
  
  try {
    switch (chain) {
      case 'ethereum':
        return await fetchEthereumTransactions(address, network);
      case 'bitcoin':
        return await fetchBitcoinTransactions(address);
      case 'bsc':
        return await fetchBSCTransactions(address, network);
      case 'xrp':
        return await fetchXRPTransactions(address, network);
      case 'solana':
        return await fetchSolanaTransactions(address);
      case 'qbtc':
        return await fetchQBTCTransactions(address);
      default:
        return [];
    }
  } catch (error) {
    console.error(`Failed to fetch ${chain} transactions:`, error);
    return [];
  }
}
