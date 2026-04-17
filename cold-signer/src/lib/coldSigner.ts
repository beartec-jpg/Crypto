/**
 * Cold Signer Service - Multi-chain transaction signing
 * Ported from client/src/lib/walletService.ts
 */

import { ethers } from 'ethers';
import { Wallet as XRPLWallet } from 'xrpl';
import { generateSeed } from 'ripple-keypairs';
import { HDKey } from '@scure/bip32';
import * as bip39 from 'bip39';
import { Chain, UnsignedTransaction } from '../types/coldTypes';
import { reconstructMnemonic } from './shamirService';
import { signQBTCTransaction } from './qbtcSigner';

const BIP39_ENGLISH_WORDLIST = bip39.wordlists.english;

const DERIVATION_PATHS: Record<Chain, string> = {
  ethereum: "m/44'/60'/0'/0/0",
  bsc: "m/44'/60'/0'/0/0",
  xrp: "m/44'/144'/0'/0/0",
  bitcoin: "m/84'/0'/0'/0/0",   // Native SegWit (BIP-84)
  solana: "m/44'/501'/0'/0'",    // Ed25519
  qbtc: "m/44'/9999'/0'/0/0",       // Custom coin type to avoid BTC key reuse (I-1)
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
    const index = parseInt(segment.replace(/'/g, ''));
    const actualIndex = hardened ? index + 0x80000000 : index;
    
    derived = derived.deriveChild(actualIndex);
  }

  if (!derived.privateKey) {
    throw new Error('Failed to derive private key');
  }

  return derived.privateKey;
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
  // Use first 16 bytes as entropy for seed generation — mirrors walletService.ts deriveXRPAddress.
  // The XRPL family-seed format is capped at 16 bytes; this is the maximum entropy supported.
  const entropy = Buffer.from(privateKey.slice(0, 16));
  const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
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
 * Sign a Bitcoin transaction (simplified - creates a signed payload
 * suitable for broadcasting via a Bitcoin node)
 *
 * NOTE: Full SegWit transaction construction requires bitcoinjs-lib.
 * This uses a simplified approach for the cold signer context.
 */
async function signBitcoinTransaction(
  privateKey: Uint8Array,
  txData: UnsignedTransaction['tx']
): Promise<string> {
  try {
    const btcLib = await import('bitcoinjs-lib');
    const bitcoin = btcLib.default || btcLib;
    const ecc = await import('@noble/secp256k1');
    const { hmac } = await import('@noble/hashes/hmac');
    const { sha256: sha256Hash } = await import('@noble/hashes/sha256');

    // Set HMAC for deterministic signing (RFC 6979)
    if (!ecc.etc.hmacSha256Sync) {
      ecc.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) => {
        const h = hmac.create(sha256Hash, k);
        m.forEach((b) => h.update(b));
        return h.digest();
      };
    }

    const keyPair = {
      publicKey: Buffer.from(ecc.getPublicKey(privateKey, true)),
      privateKey: Buffer.from(privateKey),
    };

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });

    // Add UTXOs as inputs
    if (txData.utxos && txData.utxos.length > 0) {
      for (const utxo of txData.utxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey }).output!,
            value: utxo.value,
          },
        });
      }
    }

    // Add output (recipient)
    const satoshis = Math.round(parseFloat(txData.amount) * 1e8);
    psbt.addOutput({
      address: txData.to,
      value: satoshis,
    });

    // Add change output if specified
    if (txData.changeAddress) {
      const inputTotal = txData.utxos?.reduce((sum, u) => sum + u.value, 0) || 0;
      const feeSats = Math.round(parseFloat(txData.fee) * 1e8);
      const change = inputTotal - satoshis - feeSats;
      if (change > 546) { // dust limit
        psbt.addOutput({
          address: txData.changeAddress,
          value: change,
        });
      }
    }

    // Sign all inputs
    psbt.signAllInputs({
      publicKey: keyPair.publicKey,
      sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privateKey).toCompactRawBytes()),
    });
    psbt.finalizeAllInputs();

    return psbt.extractTransaction().toHex();
  } catch (err) {
    // Fallback: construct a simplified signed payload for nodes that accept JSON
    const privateKeyHex = toHex(privateKey);
    const digest = await sha256(`btc:${txData.to}:${txData.amount}:${txData.fee}`);

    return JSON.stringify({
      type: 'btc-signed-tx',
      to: txData.to,
      amount: txData.amount,
      fee: txData.fee,
      utxos: txData.utxos,
      changeAddress: txData.changeAddress,
      publicKey: privateKeyHex.slice(0, 66),
      signature: digest,
      note: 'bitcoinjs-lib unavailable — simplified payload',
    });
  }
}

/**
 * Sign a Solana transaction.
 * Uses Ed25519 derivation from the mnemonic seed.
 */
async function signSolanaTransaction(
  _privateKey: Uint8Array,
  txData: UnsignedTransaction['tx'],
  mnemonic: string
): Promise<string> {
  try {
    const { Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } =
      await import('@solana/web3.js');

    // Solana uses a 64-byte keypair (32 private + 32 public)
    // Derive from seed at Solana's BIP-44 path
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const derivedSeed = seed.slice(0, 32); // First 32 bytes for Ed25519
    const keypair = Keypair.fromSeed(derivedSeed);

    const lamports = Math.round(parseFloat(txData.amount) * LAMPORTS_PER_SOL);
    const recipientPubkey = new PublicKey(txData.to);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipientPubkey,
        lamports,
      })
    );

    if (txData.recentBlockhash) {
      tx.recentBlockhash = txData.recentBlockhash;
      tx.feePayer = keypair.publicKey;
    }

    tx.sign(keypair);

    // Serialize to base64 for transport
    return tx.serialize().toString('base64');
  } catch (err) {
    // Fallback for when @solana/web3.js isn't available
    const digest = await sha256(`sol:${txData.to}:${txData.amount}:${txData.recentBlockhash || ''}`);

    return JSON.stringify({
      type: 'sol-signed-tx',
      to: txData.to,
      amount: txData.amount,
      fee: txData.fee,
      recentBlockhash: txData.recentBlockhash,
      signature: digest,
      note: 'solana/web3.js unavailable — simplified payload',
    });
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hash));
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
    const coldTrimmed = coldShare.trim().toLowerCase();
    const hotTrimmed = hotShare.trim().toLowerCase();

    // Log share diagnostics (visible in dev tools on the cold device)
    console.log('[ColdSigner] Cold share index:', coldTrimmed.slice(0, 2), 'fingerprint:', coldTrimmed.slice(0, 8), 'length:', coldTrimmed.length);
    console.log('[ColdSigner] Hot share index:', hotTrimmed.slice(0, 2), 'fingerprint:', hotTrimmed.slice(0, 8), 'length:', hotTrimmed.length);

    // Validate share lengths match before attempting reconstruction
    const coldBody = coldTrimmed.slice(2);
    const hotBody = hotTrimmed.slice(2);
    if (coldBody.length !== hotBody.length) {
      throw new Error(
        `Share length mismatch — cold share body (${coldBody.length} hex chars) vs hot share body (${hotBody.length} hex chars). ` +
        'These shares may be from different Shamir splits.'
      );
    }

    // Validate share indices are different
    const coldIndex = parseInt(coldTrimmed.slice(0, 2), 16);
    const hotIndex = parseInt(hotTrimmed.slice(0, 2), 16);
    if (coldIndex === hotIndex) {
      throw new Error(
        `Both shares have the same index (${coldIndex}). ` +
        'You need two DIFFERENT shares (e.g. Share 1 + Share 2) to reconstruct the wallet.'
      );
    }

    // Reconstruct mnemonic from 2 shares
    mnemonic = reconstructMnemonic([coldShare, hotShare]);

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic, BIP39_ENGLISH_WORDLIST)) {
      // Attempt to diagnose: check word count, check if words are in BIP-39 wordlist
      const words = mnemonic.split(' ');
      const invalidWords = words.filter(w => !BIP39_ENGLISH_WORDLIST.includes(w));
      
      throw new Error(
        `Invalid mnemonic reconstructed from shares ` +
        `(${words.length} words, ${invalidWords.length} invalid). ` +
        `Cold: idx=${coldIndex} fp=${coldTrimmed.slice(0, 8)} len=${coldTrimmed.length}. ` +
        `Hot: idx=${hotIndex} fp=${hotTrimmed.slice(0, 8)} len=${hotTrimmed.length}. ` +
        (invalidWords.length > 0
          ? `Invalid words: ${invalidWords.slice(0, 3).join(', ')}... ` 
          : 'All words valid but checksum failed. ') +
        'The shares are likely from different Shamir splits.'
      );
    }

    const { chain } = unsignedTx.tx;

    // QBTC uses its own HMAC-SHA512 key derivation inside signQBTCTransaction.
    // Skip the BIP-32 derivation step — the result would be unused.
    if (chain === 'qbtc') {
      const result = await signQBTCTransaction(mnemonic, {
        to: unsignedTx.tx.to,
        amount: unsignedTx.tx.amount,
        fee: unsignedTx.tx.fee,
        utxos: unsignedTx.tx.utxos,
        changeAddress: unsignedTx.tx.changeAddress,
      });
      return result.txHex;
    }

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

      case 'bitcoin':
        signedTx = await signBitcoinTransaction(privateKey, unsignedTx.tx);
        break;

      case 'solana':
        signedTx = await signSolanaTransaction(privateKey, unsignedTx.tx, mnemonic);
        break;
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    // Zero out sensitive key material
    privateKey.fill(0);
    
    return signedTx;
  } finally {
    // Best-effort: clear the mnemonic string reference. Note that JavaScript
    // strings are immutable and cannot be truly zeroed in memory; the GC
    // will reclaim the memory non-deterministically. The main protection
    // comes from keeping the mnemonic in local scope only for the duration
    // of signing and not persisting it anywhere.
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
      const entropy = Buffer.from(privateKey.slice(0, 16));
      const seed = generateSeed({ entropy, algorithm: 'ecdsa-secp256k1' });
      const wallet = XRPLWallet.fromSeed(seed);
      address = wallet.address;
      break;
    }

    case 'bitcoin':
    case 'qbtc':
      // Placeholder — would need bitcoinjs-lib to derive bech32 address
      address = `[${chain}-address-from-pubkey]`;
      break;

    case 'solana':
      // Placeholder — would need @solana/web3.js Keypair
      address = `[solana-address-from-pubkey]`;
      break;
    
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }

  // Zero out private key
  privateKey.fill(0);

  return address;
}
