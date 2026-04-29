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

    // Fetch native ETH, internal ETH (HTLC claims), and ERC20 token transfers in parallel
    const [nativeResp, internalResp, tokenResp] = await Promise.all([
      axios.get('https://api.etherscan.io/v2/api', { params: { ...baseParams, action: 'txlist' } }),
      axios.get('https://api.etherscan.io/v2/api', { params: { ...baseParams, action: 'txlistinternal' } }),
      axios.get('https://api.etherscan.io/v2/api', { params: { ...baseParams, action: 'tokentx' } }),
    ]);

    // Build a map of internal ETH receives (e.g. HTLC claim payouts) keyed by tx hash.
    // These share the same hash as the outgoing contract call but carry the real ETH amount.
    const internalReceiveByHash = new Map<string, { amount: string; from: string; blockNumber: number; timeStamp: number }>();
    if (internalResp.data.status === '1') {
      for (const itx of internalResp.data.result) {
        if (
          itx.to?.toLowerCase() === address.toLowerCase() &&
          parseInt(itx.value) > 0 &&
          itx.isError === '0'
        ) {
          internalReceiveByHash.set(itx.hash, {
            amount: (parseInt(itx.value) / 1e18).toFixed(6),
            from: itx.from,
            blockNumber: parseInt(itx.blockNumber),
            timeStamp: parseInt(itx.timeStamp),
          });
        }
      }
    }

    // Map native txs. Zero-value outgoing contract calls that have a corresponding
    // internal ETH receive (e.g. HTLC withdraw/claim) are shown as the received amount.
    const nativeTxs: Transaction[] = nativeResp.data.status === '1'
      ? nativeResp.data.result.map((tx: any) => {
          const isOutgoingZeroValueCall =
            tx.to?.toLowerCase() !== address.toLowerCase() && parseInt(tx.value) === 0;
          const internalReceive = isOutgoingZeroValueCall
            ? internalReceiveByHash.get(tx.hash)
            : undefined;
          if (internalReceive) {
            // Upgrade: show this as the ETH received from the contract (e.g. HTLC claim)
            internalReceiveByHash.delete(tx.hash); // consumed — don't add again below
            return {
              hash: tx.hash,
              type: 'receive' as const,
              amount: internalReceive.amount,
              token: 'ETH',
              to: address,
              from: internalReceive.from,
              timestamp: new Date(parseInt(tx.timeStamp) * 1000),
              status: tx.txreceipt_status === '1' ? 'confirmed' as const : 'failed' as const,
              chain: 'ethereum' as const,
              blockNumber: parseInt(tx.blockNumber),
              fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
            };
          }
          return {
            hash: tx.hash,
            type: tx.to?.toLowerCase() === address.toLowerCase() ? 'receive' : 'send',
            amount: (parseInt(tx.value) / 1e18).toFixed(6),
            token: 'ETH',
            to: tx.to,
            from: tx.from,
            timestamp: new Date(parseInt(tx.timeStamp) * 1000),
            status: tx.txreceipt_status === '1' ? 'confirmed' : tx.isError === '1' ? 'failed' : 'confirmed',
            chain: 'ethereum' as const,
            blockNumber: parseInt(tx.blockNumber),
            fee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / 1e18).toFixed(6),
          } as Transaction;
        })
      : [];

    // Any remaining internal receives that had no corresponding native tx
    const internalTxs: Transaction[] = [...internalReceiveByHash.entries()].map(([hash, itx]) => ({
      hash,
      type: 'receive' as const,
      amount: itx.amount,
      token: 'ETH',
      to: address,
      from: itx.from,
      timestamp: new Date(itx.timeStamp * 1000),
      status: 'confirmed' as const,
      chain: 'ethereum' as const,
      blockNumber: itx.blockNumber,
    }));

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

    const allTxs = [...nativeTxs, ...internalTxs, ...tokenTxs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    console.log(`✅ Found ${nativeTxs.length} ETH + ${internalTxs.length} internal + ${tokenTxs.length} token transactions on ${label}`);
    return allTxs;
  } catch (error: any) {
    console.error('❌ Failed to fetch Ethereum transactions:', error.message);
    return [];
  }
}

/**
 * Fetch Bitcoin transactions via Blockstream API
 */
export async function fetchBitcoinTransactions(address: string, network: TokenNetwork = 'mainnet'): Promise<Transaction[]> {
  try {
    const baseUrl = network === 'testnet' ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';
    const label = network === 'testnet' ? 'TESTNET' : 'MAINNET';
    console.log(`🔍 Fetching BTC transactions from ${label} for:`, address);
    
    const response = await axios.get(
      `${baseUrl}/address/${address}/txs`,
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
    
    const transactions: Transaction[] = txs.flatMap((item: any) => {
      const tx = item.tx_json ?? item.tx ?? item;
      const meta = item.meta ?? {};
      if (!tx || meta.TransactionResult === 'tecNO_TARGET') return [];

      const txType: string = tx.TransactionType || '';

      // Determine direction and amount based on transaction type
      let isReceive = false;
      let amount = '0';
      let token = 'XRP';

      if (txType === 'Payment') {
        isReceive = tx.Destination === address;
        // Use delivered_amount from meta for accuracy (handles partial payments)
        const delivered = meta.delivered_amount ?? tx.Amount;
        if (typeof delivered === 'string') {
          amount = dropsToXrp(delivered).toString();
        } else if (delivered?.value) {
          amount = delivered.value;
          token = delivered.currency || 'XRP';
        }
      } else if (txType === 'EscrowCreate') {
        // Sending XRP into escrow — outgoing
        isReceive = false;
        if (typeof tx.Amount === 'string') amount = dropsToXrp(tx.Amount).toString();
      } else if (txType === 'EscrowFinish') {
        // Claiming from escrow — XRP goes to the Destination set in EscrowCreate
        // Read the deleted Escrow node's FinalFields to get Destination and Amount
        const escrowNode = (meta.AffectedNodes || []).find(
          (n: any) => n.DeletedNode?.LedgerEntryType === 'Escrow'
        );
        const escrowFields = escrowNode?.DeletedNode?.FinalFields || escrowNode?.DeletedNode?.PreviousFields;
        const escrowDestination: string | undefined = escrowFields?.Destination;
        // Receive if this address is the escrow's Destination (XRP recipient)
        // or if this account submitted the EscrowFinish for someone else's escrow
        isReceive = escrowDestination === address || (tx.Account === address && escrowFields?.Account !== address);
        if (escrowFields?.Amount && typeof escrowFields.Amount === 'string') {
          amount = dropsToXrp(escrowFields.Amount).toString();
        }
      } else if (txType === 'EscrowCancel') {
        // Cancelled escrow — funds returned to owner
        isReceive = tx.Account === address;
        const escrowNode = (meta.AffectedNodes || []).find(
          (n: any) => (n.DeletedNode || n.ModifiedNode)?.LedgerEntryType === 'Escrow'
        );
        const escrowFields = escrowNode?.DeletedNode?.FinalFields || escrowNode?.DeletedNode?.PreviousFields;
        if (escrowFields?.Amount && typeof escrowFields.Amount === 'string') {
          amount = dropsToXrp(escrowFields.Amount).toString();
        }
      } else {
        // Other tx types (OfferCreate etc.) — skip zero-value ones
        return [];
      }

      // Skip dust/zero transactions (e.g. pure fee payments with no value)
      if (parseFloat(amount) === 0) return [];

      return [{
        hash: tx.hash,
        type: isReceive ? 'receive' : 'send',
        amount: parseFloat(amount).toFixed(6),
        token,
        to: tx.Destination || tx.Account || '',
        from: tx.Account || '',
        timestamp: new Date(((tx.date ?? 0) + 946684800) * 1000),
        status: meta.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
        chain: 'xrp' as const,
        blockNumber: tx.ledger_index,
        fee: tx.Fee ? dropsToXrp(tx.Fee).toString() : '0',
      }];
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
export async function fetchSolanaTransactions(address: string, network: TokenNetwork = 'mainnet'): Promise<Transaction[]> {
  try {
    const label = network === 'testnet' ? 'TESTNET' : 'MAINNET';
    console.log(`🔍 Fetching SOL transactions from ${label} for:`, address);
    
    const HELIUS_KEY = import.meta.env.VITE_HELIUS_API_KEY || '';
    const rpcUrl = network === 'testnet'
      ? 'https://api.testnet.solana.com'
      : HELIUS_KEY 
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
        return await fetchBitcoinTransactions(address, network);
      case 'bsc':
        return await fetchBSCTransactions(address, network);
      case 'xrp':
        return await fetchXRPTransactions(address, network);
      case 'solana':
        return await fetchSolanaTransactions(address, network);
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
