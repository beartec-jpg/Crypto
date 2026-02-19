/**
 * Cold Signer Service - Multi-chain transaction signing
 * Ported from client/src/lib/walletService.ts
 */

import { ethers } from 'ethers';
import { Wallet as XRPLWallet } from 'xrpl';
import { HDKey } from '@scure/bip32';
import * as bip39 from 'bip39';
import { Chain, UnsignedTransaction } from '../types/coldTypes';
import { reconstructMnemonic } from './shamirService';

const DERIVATION_PATHS: Record<Chain, string> = {
  ethereum: "m/44'/60'/0'/0/0",
  bsc: "m/44'/60'/0'/0/0", // BSC uses same path as ETH
  xrp: "m/44'/144'/0'/0/0",
};

/**
 * Derive private key from mnemonic for a specific chain
 */
function derivePrivateKey(mnemonic: string, chain: Chain): Uint8Array {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdkey = HDKey.fromMasterSeed(seed);
  
  const path = DERIVATION_PATHS[chain];
  const segments = path.split('/').slice(1); // Remove 'm'
  
  let derived = hdkey;
  for (const segment of segments) {
    const hardened = segment.endsWith("'");
    const index = parseInt(segment.replace("'", ''));
    const actualIndex = hardened ? index + 0x80000000 : index;
    
    derived = derived.deriveChild(actualIndex);
  }

  if (!derived.privateKey) {
    throw new Error('Failed to derive private key');
  }

  return derived.privateKey;
}

/**
 * Zero out sensitive data from memory
 */
function zeroMemory(data: string): void {
  // Overwrite the string reference (best effort in JS)
  if (typeof data === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any) = '\0'.repeat(data.length);
  }
}

/**
 * Sign an Ethereum/BSC transaction
 */
async function signEthereumTransaction(
  privateKey: Uint8Array,
  txData: UnsignedTransaction['tx']
): Promise<string> {
  // Convert Uint8Array to hex string for ethers
  const privateKeyHex = '0x' + Array.from(privateKey)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const wallet = new ethers.Wallet(privateKeyHex);

  const tx = {
    to: txData.to,
    value: ethers.parseEther(txData.amount),
    nonce: txData.nonce || 0,
    gasLimit: txData.gasLimit || '21000',
    maxFeePerGas: txData.maxFeePerGas || '30000000000',
    chainId: txData.chainId || 1,
  };

  const signedTx = await wallet.signTransaction(tx);
  return signedTx;
}

/**
 * Sign an XRP transaction
 */
function signXRPTransaction(
  privateKey: Uint8Array,
  txData: UnsignedTransaction['tx']
): string {
  // Convert first 16 bytes of private key to seed for XRP
  const seedBytes = privateKey.slice(0, 16);
  const seed = Buffer.from(seedBytes).toString('hex').toUpperCase();
  
  const wallet = XRPLWallet.fromSeed(seed);

  const tx: any = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: txData.destination || txData.to,
    Amount: String(parseFloat(txData.amount) * 1_000_000), // Convert XRP to drops
    Fee: String(parseFloat(txData.fee) * 1_000_000), // Convert XRP to drops
    Sequence: txData.sequence || 0,
  };

  if (txData.destinationTag !== undefined) {
    tx.DestinationTag = txData.destinationTag;
  }

  const signed = wallet.sign(tx);
  return signed.tx_blob;
}

/**
 * Sign a transaction using cold signer shares
 * @param coldShare Base64-encoded cold share
 * @param hotShare Base64-encoded hot share from QR
 * @param unsignedTx Transaction data from QR
 * @returns Signed transaction hex string
 */
export async function signTransaction(
  coldShare: string,
  hotShare: string,
  unsignedTx: UnsignedTransaction
): Promise<string> {
  let mnemonic = '';
  
  try {
    // Reconstruct mnemonic from 2 shares
    mnemonic = reconstructMnemonic([coldShare, hotShare]);

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic reconstructed from shares');
    }

    const { chain } = unsignedTx.tx;

    // Derive private key for the chain
    const privateKey = derivePrivateKey(mnemonic, chain);

    let signedTx: string;

    // Sign based on chain
    switch (chain) {
      case 'ethereum':
      case 'bsc':
        signedTx = await signEthereumTransaction(privateKey, unsignedTx.tx);
        break;
      
      case 'xrp':
        signedTx = signXRPTransaction(privateKey, unsignedTx.tx);
        break;
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    // Zero out sensitive data
    privateKey.fill(0);
    
    return signedTx;
  } finally {
    // Always zero out mnemonic from memory
    zeroMemory(mnemonic);
    mnemonic = '';
  }
}

/**
 * Get address for a chain from mnemonic
 */
export function getAddress(mnemonic: string, chain: Chain): string {
  const privateKey = derivePrivateKey(mnemonic, chain);

  let address: string;

  switch (chain) {
    case 'ethereum':
    case 'bsc': {
      const privateKeyHex = '0x' + Array.from(privateKey)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const wallet = new ethers.Wallet(privateKeyHex);
      address = wallet.address;
      break;
    }
    
    case 'xrp': {
      const seedBytes = privateKey.slice(0, 16);
      const seed = Buffer.from(seedBytes).toString('hex').toUpperCase();
      const wallet = XRPLWallet.fromSeed(seed);
      address = wallet.address;
      break;
    }
    
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }

  // Zero out private key
  privateKey.fill(0);

  return address;
}
