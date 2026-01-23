// client/src/lib/transactionService.ts
// Multi-chain transaction history fetching with mainnet/testnet support

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
 * Fetch Ethereum transactions via Etherscan API
 */
export async function fetchEthereumTransactions(
  address: string, 
  useMainnet = false
): Promise<Transaction[]> {
  try {
    const apiUrl = useMainnet
      ? 'https://api.etherscan.io/api'
      : 'https://api-sepolia.etherscan.io/api';
    
    console.log(`🔍 Fetching ETH transactions from ${useMainnet ? 'MAINNET' : 'SEPOLIA'} for:`, address);
    
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
  } catch (error) {
    console.error('❌ Failed to fetch Ethereum transactions:', error);
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
    
    const response = await axios.get(apiUrl);
    const txs = response.data.slice(0, 20);

    const transactions = txs.map((tx: any) => {
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
        to: tx.vout[0]?.scriptpubkey_address || 'Multiple',
        from: tx.vin[0]?.prevout?.scriptpubkey_address || 'Multiple',
        timestamp: new Date(tx.status.block_time * 1000),
        status: tx.status.confirmed ? 'confirmed' : 'pending',
        chain: 'bitcoin' as const,
        blockNumber: tx.status.block_height,
      };
    });

    console.log(`✅ Found ${transactions.length} BTC transactions`);
    return transactions;
  } catch (error) {
    console.error('❌ Failed to fetch Bitcoin transactions:', error);
    return [];
  }
}

/**
 * Fetch BSC transactions via BSCScan API
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
      },
    });

    if (response.data.status !== '1') {
      console.warn('⚠️ BSCScan API error:', response.data.message);
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
  } catch (error) {
    console.error('❌ Failed to fetch BSC transactions:', error);
    return [];
  }
}

/**
 * Fetch XRP transactions via XRPL public node
 */
export async function fetchXRPTransactions(
  address: string,
  useMainnet = true
): Promise<Transaction[]> {
  try {
    const rpcUrl = useMainnet
      ? 'https://s1.ripple.com:51234/'
      : 'https://s.altnet.rippletest.net:51234/';
    
    console.log(`🔍 Fetching XRP transactions from ${useMainnet ? 'MAINNET' : 'TESTNET'} for:`, address);
    
    const response = await axios.post(rpcUrl, {
      method: 'account_tx',
      params: [{
        account: address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit: 20,
      }],
    });

    if (!response.data.result?.transactions) {
      console.warn('⚠️ No XRP transactions found');
      return [];
    }

    const txs = response.data.result.transactions.map((item: any) => {
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
        timestamp: new Date((tx.date + 946684800) * 1000), // Ripple epoch offset
        status: meta.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
        chain: 'xrp' as const,
        blockNumber: item.ledger_index,
        fee: (parseInt(tx.Fee) / 1000000).toFixed(6),
      };
    });

    console.log(`✅ Found ${txs.length} XRP transactions`);
    return txs;
  } catch (error) {
    console.error('❌ Failed to fetch XRP transactions:', error);
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
      params: [
        address,
        { limit: 20 }
      ],
    });

    if (!response.data.result) {
      console.warn('⚠️ No Solana transactions found');
      return [];
    }

    // Fetch details for each signature
    const txDetails = await Promise.all(
      response.data.result.slice(0, 10).map(async (sig: any) => {
        try {
          const detailResponse = await axios.post(rpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
          });

          const tx = detailResponse.data.result;
          if (!tx) return null;

          const preBalance = tx.meta.preBalances[0] || 0;
          const postBalance = tx.meta.postBalances[0] || 0;
          const diff = Math.abs(postBalance - preBalance) / 1000000000;

          return {
            hash: sig.signature,
            type: postBalance > preBalance ? 'receive' : 'send',
            amount: diff.toFixed(6),
            token: 'SOL',
            to: address,
            from: address,
            timestamp: new Date(sig.blockTime * 1000),
            status: sig.err ? 'failed' : 'confirmed',
            chain: 'solana' as const,
            blockNumber: sig.slot,
            fee: (tx.meta.fee / 1000000000).toFixed(6),
          };
        } catch {
          return null;
        }
      })
    );

    const transactions = txDetails.filter((tx): tx is Transaction => tx !== null);
    console.log(`✅ Found ${transactions.length} SOL transactions`);
    return transactions;
  } catch (error) {
    console.error('❌ Failed to fetch Solana transactions:', error);
    return [];
  }
}

/**
 * Fetch transactions for a specific chain
 */
export async function fetchChainTransactions(
  chain: Chain,
  address: string,
  useMainnet = false
): Promise<Transaction[]> {
  console.log(`📡 Fetching ${chain} transactions for ${address} (${useMainnet ? 'mainnet' : 'testnet'})`);
  
  switch (chain) {
    case 'ethereum':
      return fetchEthereumTransactions(address, useMainnet);
    case 'bitcoin':
      return fetchBitcoinTransactions(address, useMainnet);
    case 'bsc':
      return fetchBSCTransactions(address, useMainnet);
    case 'xrp':
      return fetchXRPTransactions(address, useMainnet);
    case 'solana':
      return fetchSolanaTransactions(address, useMainnet);
    default:
      return [];
  }
}
