// client/src/lib/walletService.ts
// Multi-chain embedded wallet service with BTC, ETH, XRP, BSC support

import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from '@noble/hashes/utils';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';

// Supported chains
export type Chain = 'ethereum' | 'bitcoin' | 'bsc' | 'xrp' | 'solana';

interface WalletDB extends DBSchema {
  wallets: {
    key: string;
    value: {
      id: string;
      encryptedMnemonic: string;
      addresses: {
        ethereum: string;
        bitcoin: string;
        bsc: string;
        xrp: string;
        solana: string;
      };
      publicKeys: {
        ethereum: string;
        bitcoin: string;
        bsc: string;
        xrp: string;
        solana: string;
      };
      createdAt: string;
      salt: string;
    };
  };
}

interface Wallet {
  id: string;
  addresses: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  };
  createdAt: string;
}

interface UnlockedWallet extends Wallet {
  mnemonic: string;
  privateKeys: {
    ethereum: string;
    bitcoin: string;
    bsc: string;
    xrp: string;
    solana: string;
  };
}

const DB_NAME = 'beartec_wallet';
const DB_VERSION = 1;

// BIP44 Derivation Paths
const DERIVATION_PATHS = {
  ethereum: "m/44'/60'/0'/0/0",   // ETH
  bitcoin: "m/44'/0'/0'/0/0",     // BTC
  bsc: "m/44'/60'/0'/0/0",        // BSC (same as ETH)
  xrp: "m/44'/144'/0'/0/0",       // XRP
  solana: "m/44'/501'/0'/0/0",    // SOL
};

// Helper to derive BIP44 path using @scure/bip32
function derivePath(node: HDKey, path: string): HDKey {
  const segments = path.split('/').slice(1); // Remove 'm'
  let derived = node;
  
  for (const segment of segments) {
    const hardened = segment.endsWith("'");
    const index = parseInt(segment.replace("'", ''));
    derived = derived.derive(hardened ? index + 0x80000000 : index);
  }
  
  return derived;
}

// Initialize IndexedDB
async function getDB(): Promise<IDBPDatabase<WalletDB>> {
  return openDB<WalletDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('wallets')) {
        db.createObjectStore('wallets', { keyPath: 'id' });
      }
    },
  });
}

// Encrypt data using password
function encryptData(data: string, password: string, salt: Uint8Array): string {
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const dataBytes = new TextEncoder().encode(data);
  const encrypted = new Uint8Array(dataBytes.length);
  
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ key[i % key.length];
  }
  
  return Buffer.from(encrypted).toString('hex');
}

// Decrypt data using password
function decryptData(encryptedHex: string, password: string, salt: Uint8Array): string {
  const key = pbkdf2(sha256, password, salt, { c: 100000, dkLen: 32 });
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decrypted = new Uint8Array(encrypted.length);
  
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length];
  }
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Derive Ethereum/BSC address from private key
 */
function deriveEthereumAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyNoPrefix = publicKeyBytes.slice(1); // Remove 0x04 prefix
  const hash = sha256(publicKeyNoPrefix);
  return ethers.getAddress('0x' + Buffer.from(hash.slice(-20)).toString('hex'));
}

/**
 * Derive Bitcoin address from private key (P2PKH)
 */
function deriveBitcoinAddress(privateKeyBytes: Uint8Array): string {
  // Get compressed public key
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  
  // SHA256 then RIPEMD160
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte (0x00 for mainnet)
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  
  // Combine and encode to Base58
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58Encode(addressBytes);
}

/**
 * Derive XRP address from private key
 */
function deriveXRPAddress(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
  
  // SHA256 then RIPEMD160
  const sha256Hash = sha256(publicKeyBytes);
  const ripemd160Hash = ripemd160(sha256Hash);
  
  // Add version byte (0x00 for XRP)
  const versionedHash = new Uint8Array(21);
  versionedHash[0] = 0x00;
  versionedHash.set(ripemd160Hash, 1);
  
  // Double SHA256 for checksum
  const checksum = sha256(sha256(versionedHash)).slice(0, 4);
  
  // Combine and encode to Base58 (XRP uses custom alphabet)
  const addressBytes = new Uint8Array(25);
  addressBytes.set(versionedHash);
  addressBytes.set(checksum, 21);
  
  return base58EncodeXRP(addressBytes);
}

/**
 * Derive Solana address from private key (ed25519)
 */
function deriveSolanaAddress(seed: Uint8Array): string {
  // Solana uses ed25519, not secp256k1
  // For now, return a placeholder (we'll need @solana/web3.js for proper implementation)
  const hash = sha256(seed);
  return base58Encode(hash);
}

/**
 * Base58 encoding (Bitcoin alphabet)
 */
function base58Encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let encoded = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }
  
  // Add leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = '1' + encoded;
  }
  
  return encoded;
}

/**
 * Base58 encoding with XRP alphabet (rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz)
 */
function base58EncodeXRP(bytes: Uint8Array): string {
  const ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let encoded = '';
  
  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }
  
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    encoded = 'r' + encoded;
  }
  
  return encoded;
}

/**
 * Create a new multi-chain wallet from BIP39 mnemonic
 */
export async function createWallet(password: string): Promise<Wallet> {
  try {
    console.log('Creating new multi-chain wallet...');
    
    // Generate 24-word mnemonic (256 bits entropy)
    const mnemonic = bip39.generateMnemonic(256);
    console.log('Generated mnemonic');
    
    // Derive seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    
    // Derive keys for each chain
    const addresses: Wallet['addresses'] = {
      ethereum: '',
      bitcoin: '',
      bsc: '',
      xrp: '',
      solana: '',
    };
    
    const publicKeys: Record<Chain, string> = {
      ethereum: '',
      bitcoin: '',
      bsc: '',
      xrp: '',
      solana: '',
    };
    
    // Ethereum
    const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
    if (!ethNode.privateKey) throw new Error('Failed to derive ETH key');
    addresses.ethereum = deriveEthereumAddress(ethNode.privateKey);
    publicKeys.ethereum = Buffer.from(secp256k1.getPublicKey(ethNode.privateKey, false)).toString('hex');
    
    // Bitcoin
    const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
    if (!btcNode.privateKey) throw new Error('Failed to derive BTC key');
    addresses.bitcoin = deriveBitcoinAddress(btcNode.privateKey);
    publicKeys.bitcoin = Buffer.from(secp256k1.getPublicKey(btcNode.privateKey, true)).toString('hex');
    
    // BSC (same as Ethereum)
    addresses.bsc = addresses.ethereum;
    publicKeys.bsc = publicKeys.ethereum;
    
    // XRP
    const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
    if (!xrpNode.privateKey) throw new Error('Failed to derive XRP key');
    addresses.xrp = deriveXRPAddress(xrpNode.privateKey);
    publicKeys.xrp = Buffer.from(secp256k1.getPublicKey(xrpNode.privateKey, true)).toString('hex');
    
    // Solana
    const solNode = derivePath(root, DERIVATION_PATHS.solana);
    if (!solNode.privateKey) throw new Error('Failed to derive SOL key');
    addresses.solana = deriveSolanaAddress(solNode.privateKey);
    publicKeys.solana = Buffer.from(solNode.privateKey).toString('hex');
    
    console.log('Derived addresses:', addresses);
    
    // Encrypt mnemonic
    const salt = randomBytes(32);
    const encryptedMnemonic = encryptData(mnemonic, password, salt);
    
    // Store in IndexedDB
    const db = await getDB();
    const walletId = `wallet_${Date.now()}`;
    
    await db.put('wallets', {
      id: walletId,
      encryptedMnemonic,
      addresses,
      publicKeys,
      createdAt: new Date().toISOString(),
      salt: Buffer.from(salt).toString('hex'),
    });
    
    console.log('Multi-chain wallet stored in IndexedDB');
    
    // Store wallet ID in localStorage
    localStorage.setItem('current_wallet_id', walletId);
    localStorage.setItem('wallet_created', 'true');
    
    return {
      id: walletId,
      addresses,
      createdAt: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('Failed to create wallet:', error);
    throw new Error('Failed to create wallet. Please try again.');
  }
}

/**
 * Unlock wallet with password
 */
export async function unlockWallet(walletId: string, password: string): Promise<UnlockedWallet> {
  try {
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Decrypt mnemonic
    const salt = Buffer.from(wallet.salt, 'hex');
    const mnemonic = decryptData(wallet.encryptedMnemonic, password, salt);
    
    // Verify mnemonic is valid
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid password');
    }
    
    // Derive private keys
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    
    const privateKeys: UnlockedWallet['privateKeys'] = {
      ethereum: '',
      bitcoin: '',
      bsc: '',
      xrp: '',
      solana: '',
    };
    
    const ethNode = derivePath(root, DERIVATION_PATHS.ethereum);
    privateKeys.ethereum = ethNode.privateKey ? Buffer.from(ethNode.privateKey).toString('hex') : '';

    const btcNode = derivePath(root, DERIVATION_PATHS.bitcoin);
    privateKeys.bitcoin = btcNode.privateKey ? Buffer.from(btcNode.privateKey).toString('hex') : '';

    privateKeys.bsc = privateKeys.ethereum; // Same as ETH

    const xrpNode = derivePath(root, DERIVATION_PATHS.xrp);
    privateKeys.xrp = xrpNode.privateKey ? Buffer.from(xrpNode.privateKey).toString('hex') : '';

    const solNode = derivePath(root, DERIVATION_PATHS.solana);
    privateKeys.solana = solNode.privateKey ? Buffer.from(solNode.privateKey).toString('hex') : '';

    return {
      id: wallet.id,
      addresses: wallet.addresses,
      mnemonic,
      privateKeys,
      createdAt: wallet.createdAt,
    };
    
  } catch (error) {
    console.error('Failed to unlock wallet:', error);
    throw new Error('Failed to unlock wallet. Check your password.');
  }
}

/**
 * Get current wallet info (without private keys)
 */
export async function getCurrentWallet(): Promise<Wallet | null> {
  try {
    const walletId = localStorage.getItem('current_wallet_id');
    if (!walletId) return null;
    
    const db = await getDB();
    const wallet = await db.get('wallets', walletId);
    
    if (!wallet) return null;
    
    return {
      id: wallet.id,
      addresses: wallet.addresses,
      createdAt: wallet.createdAt,
    };
    
  } catch (error) {
    console.error('Failed to get current wallet:', error);
    return null;
  }
}

/**
 * Sign transaction for specific chain
 */
export async function signTransaction(
  walletId: string,
  password: string,
  chain: Chain,
  transaction: any
): Promise<string> {
  try {
    const wallet = await unlockWallet(walletId, password);
    const privateKey = wallet.privateKeys[chain];
    
    if (!privateKey) {
      throw new Error(`No private key found for chain: ${chain}`);
    }
    
    // Sign based on chain
    switch (chain) {
      case 'ethereum':
      case 'bsc': {
        const ethersWallet = new ethers.Wallet('0x' + privateKey);
        return await ethersWallet.signTransaction(transaction);
      }
      
      case 'bitcoin': {
        // Bitcoin transaction signing (would need bitcoinjs-lib)
        throw new Error('Bitcoin signing not yet implemented');
      }
      
      case 'xrp': {
        // XRP transaction signing (would need xrpl library)
        throw new Error('XRP signing not yet implemented');
      }
      
      case 'solana': {
        // Solana transaction signing (would need @solana/web3.js)
        throw new Error('Solana signing not yet implemented');
      }
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }
    
  } catch (error) {
    console.error('Failed to sign transaction:', error);
    throw new Error('Failed to sign transaction');
  }
}

/**
 * Export mnemonic (backup)
 */
export async function exportMnemonic(walletId: string, password: string): Promise<string> {
  const wallet = await unlockWallet(walletId, password);
  return wallet.mnemonic;
}

/**
 * Delete wallet
 */
export async function deleteWallet(walletId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('wallets', walletId);
    
    if (localStorage.getItem('current_wallet_id') === walletId) {
      localStorage.removeItem('current_wallet_id');
      localStorage.removeItem('wallet_created');
    }
    
  } catch (error) {
    console.error('Failed to delete wallet:', error);
    throw new Error('Failed to delete wallet');
  }
}
