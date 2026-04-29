// client/src/lib/bitcoinService.ts
// Bitcoin utility functions for sending transactions

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

const ECPair = ECPairFactory(ecc);

// Types
export interface BitcoinFeeEstimate {
  fastestFee: number;    // sat/vB
  halfHourFee: number;   // sat/vB
  hourFee: number;       // sat/vB
  economyFee: number;    // sat/vB
  minimumFee: number;    // sat/vB
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // satoshis
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

export interface UTXOSelection {
  selectedUTXOs: UTXO[];
  totalInput: number;
  estimatedFee: number;
  change: number;
}

// Constants
const DUST_THRESHOLD = 546; // sats
const BLOCKSTREAM_API = 'https://blockstream.info/api';

// Bitcoin address validation patterns
const BITCOIN_ADDRESS_PATTERNS = [
  /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,        // P2PKH mainnet (starts with 1)
  /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,        // P2SH mainnet (starts with 3)
  /^bc1q[a-z0-9]{38,58}$/,                 // Native SegWit mainnet (bc1q)
  /^bc1p[a-z0-9]{58}$/,                    // Taproot mainnet (bc1p)
  /^m[a-km-zA-HJ-NP-Z1-9]{25,34}$/,       // P2PKH testnet (starts with m)
  /^n[a-km-zA-HJ-NP-Z1-9]{25,34}$/,       // P2PKH testnet (starts with n)
  /^2[a-km-zA-HJ-NP-Z1-9]{25,34}$/,       // P2SH testnet (starts with 2)
  /^tb1q[a-z0-9]{38,58}$/,                 // Native SegWit testnet (tb1q)
  /^tb1p[a-z0-9]{58}$/,                    // Taproot testnet (tb1p)
];

// Conversion utilities
export function satsToBTC(sats: number): number {
  return sats / 100000000;
}

export function btcToSats(btc: number): number {
  return Math.round(btc * 100000000);
}

// Fetch current Bitcoin fee estimates
export async function fetchBitcoinFees(): Promise<BitcoinFeeEstimate> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API}/fee-estimates`);
    if (!response.ok) throw new Error('Failed to fetch fee estimates');
    
    const data = await response.json();
    
    return {
      fastestFee: Math.ceil(data['1'] || 20),
      halfHourFee: Math.ceil(data['3'] || 15),
      hourFee: Math.ceil(data['6'] || 10),
      economyFee: Math.ceil(data['144'] || 5),
      minimumFee: Math.ceil(data['1008'] || 1),
    };
  } catch (error) {
    console.error('Error fetching Bitcoin fees:', error);
    // Fallback to reasonable defaults
    return {
      fastestFee: 20,
      halfHourFee: 15,
      hourFee: 10,
      economyFee: 5,
      minimumFee: 1,
    };
  }
}

// Fetch UTXOs for an address
export async function fetchBitcoinUTXOs(address: string): Promise<UTXO[]> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API}/address/${address}/utxo`);
    if (!response.ok) throw new Error('Failed to fetch UTXOs');
    
    const utxos: UTXO[] = await response.json();
    return utxos;
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    throw error;
  }
}

// Select UTXOs for transaction (simple greedy algorithm)
export function selectUTXOs(
  utxos: UTXO[],
  targetAmount: number,
  feeRate: number
): UTXOSelection | null {
  // Sort UTXOs by value (largest first)
  const sortedUTXOs = [...utxos].sort((a, b) => b.value - a.value);
  
  const selectedUTXOs: UTXO[] = [];
  let totalInput = 0;

  // Estimate transaction size
  // Base size + (inputs * 148) + (outputs * 34)
  // Assuming 2 outputs (recipient + change)
  const calculateFee = (numInputs: number): number => {
    const baseSize = 10;
    const inputSize = 148;
    const outputSize = 34;
    const txSize = baseSize + (numInputs * inputSize) + (2 * outputSize);
    return Math.ceil(txSize * feeRate);
  };

  for (const utxo of sortedUTXOs) {
    selectedUTXOs.push(utxo);
    totalInput += utxo.value;

    const estimatedFee = calculateFee(selectedUTXOs.length);
    const total = targetAmount + estimatedFee;

    if (totalInput >= total) {
      const change = totalInput - total;
      
      // If change is too small (dust), add it to fee
      if (change > 0 && change < DUST_THRESHOLD) {
        return {
          selectedUTXOs,
          totalInput,
          estimatedFee: estimatedFee + change,
          change: 0,
        };
      }

      return {
        selectedUTXOs,
        totalInput,
        estimatedFee,
        change,
      };
    }
  }

  // Not enough funds
  return null;
}

// Validate Bitcoin address
// Supports all Bitcoin address formats:
// - Legacy P2PKH (1...)
// - Legacy P2SH (3...)
// - Native SegWit/Bech32 (bc1q...)
// - Taproot/Bech32m (bc1p...)
export function validateBitcoinAddress(address: string, network?: 'mainnet' | 'testnet'): boolean {
  try {
    // Try the specified network first, then fall back to the other
    const nets = network === 'testnet'
      ? [bitcoin.networks.testnet, bitcoin.networks.bitcoin]
      : [bitcoin.networks.bitcoin, bitcoin.networks.testnet];
    for (const net of nets) {
      try {
        bitcoin.address.toOutputScript(address, net);
        return true;
      } catch { /* try next */ }
    }
    return BITCOIN_ADDRESS_PATTERNS.some(pattern => pattern.test(address));
  } catch {
    return BITCOIN_ADDRESS_PATTERNS.some(pattern => pattern.test(address));
  }
}

// Derive WIF from hex private key
export function deriveWIFFromPrivateKey(privateKeyHex: string): string {
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  return keyPair.toWIF();
}

// Build Bitcoin transaction
export async function buildBitcoinTransaction(
  wif: string,
  fromAddress: string,
  toAddress: string,
  amount: number,
  feeRate: number
): Promise<{ raw: string; txid: string }> {
  try {
    // Fetch UTXOs
    const utxos = await fetchBitcoinUTXOs(fromAddress);
    
    // Select UTXOs
    const selection = selectUTXOs(utxos, amount, feeRate);
    if (!selection) {
      throw new Error('Insufficient funds');
    }

    // Create transaction
    const keyPair = ECPair.fromWIF(wif);
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });

    // Add inputs
    for (const utxo of selection.selectedUTXOs) {
      const txHex = await fetchTransactionHex(utxo.txid);
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(txHex, 'hex'),
      });
    }

    // Add output (recipient)
    psbt.addOutput({
      address: toAddress,
      value: amount,
    });

    // Add change output if needed
    if (selection.change > DUST_THRESHOLD) {
      psbt.addOutput({
        address: fromAddress,
        value: selection.change,
      });
    }

    // Sign all inputs
    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    // Extract transaction
    const tx = psbt.extractTransaction();
    const raw = tx.toHex();
    const txid = tx.getId();

    return { raw, txid };
  } catch (error: any) {
    console.error('Error building transaction:', error);
    throw new Error(error.message || 'Failed to build transaction');
  }
}

// Fetch raw transaction hex
async function fetchTransactionHex(txid: string): Promise<string> {
  const response = await fetch(`${BLOCKSTREAM_API}/tx/${txid}/hex`);
  if (!response.ok) throw new Error('Failed to fetch transaction');
  return response.text();
}

// Broadcast Bitcoin transaction
export async function broadcastBitcoinTransaction(rawTx: string): Promise<string> {
  try {
    const response = await fetch(`${BLOCKSTREAM_API}/tx`, {
      method: 'POST',
      body: rawTx,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to broadcast transaction');
    }

    const txid = await response.text();
    return txid;
  } catch (error: any) {
    console.error('Error broadcasting transaction:', error);
    throw new Error(error.message || 'Failed to broadcast transaction');
  }
}
