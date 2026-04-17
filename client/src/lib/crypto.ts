// client/src/lib/crypto.ts
// Hybrid post-quantum cryptography utilities
// Uses ML-DSA-65 (Dilithium3) for post-quantum security + ECDSA for compatibility
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  PQC IMPLEMENTATION SPLIT — READ BEFORE MODIFYING                      │
// │                                                                         │
// │  This file (crypto.ts) implements generic hybrid-wallet signing using   │
// │  ML-DSA-65 (Dilithium3, security level 3) via @noble/post-quantum.     │
// │  Key sizes: PK=1952 B, Sig=3309 B.                                     │
// │                                                                         │
// │  The QBTC on-chain flow uses a DIFFERENT implementation:                │
// │    • dilithium-wasm/dilithiumWasm.ts  — ML-DSA-44 (Dilithium2, level 2)│
// │    • qbtcService.ts                  — uses the WASM wrapper above      │
// │  Key sizes: PK=1312 B, Sig=2420 B.                                     │
// │                                                                         │
// │  These two implementations are INTENTIONALLY SEPARATE and are NOT       │
// │  cross-compatible:                                                       │
// │    • crypto.ts  → generic hybrid-wallet UI only                        │
// │    • qbtcService.ts → QBTC node on-chain transactions only             │
// │                                                                         │
// │  ML-DSA-65 signatures produced here CANNOT be verified by the QBTC     │
// │  node, which expects ML-DSA-44 / Dilithium2. Do NOT mix these paths.   │
// └─────────────────────────────────────────────────────────────────────────┘

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as bip39 from 'bip39';

/**
 * Hybrid key pair containing both post-quantum (ML-DSA) and classical (ECDSA) keys
 * This provides security against both classical and quantum attacks
 */
export interface HybridKeyPair {
  // ML-DSA (Dilithium) keys for post-quantum security
  mlDsaPublicKey: string;
  mlDsaSecretKey: Uint8Array; // Never expose or transmit
  
  // ECDSA secp256k1 keys for EVM compatibility
  ecdsaPublicKey: string;
  ecdsaPrivateKey: Uint8Array; // Never expose or transmit
}

/**
 * Hybrid signature containing both ML-DSA and ECDSA signatures
 */
export interface HybridSignature {
  mlDsaSignature: string;
  ecdsaSignature: string;
  algorithm: 'hybrid-ml-dsa-65-ecdsa-secp256k1';
  timestamp: number;
}

/**
 * Generate a hybrid key pair with both ML-DSA and ECDSA keys
 * ML-DSA provides post-quantum security, ECDSA provides EVM compatibility
 * 
 * SECURITY NOTE: In production, keys should be derived from WebAuthn credentials
 * and stored in the device's secure enclave. Never store raw private keys.
 */
export async function generateHybridKeys(): Promise<HybridKeyPair> {
  try {
    // Generate cryptographically secure random seed
    const seed = crypto.getRandomValues(new Uint8Array(32));
    
    // Generate ML-DSA-65 (Dilithium) key pair.
    // Any failure here is fatal — random bytes are NOT a valid substitute for
    // a real ML-DSA key pair, so we let the exception propagate to the outer
    // catch which surfaces a user-visible error.
    const mlDsaKeys = ml_dsa65.keygen(seed);
    
    // Generate ECDSA secp256k1 key pair (for EVM compatibility)
    const ecdsaPrivateKey = crypto.getRandomValues(new Uint8Array(32));
    const ecdsaPublicKey = secp256k1.getPublicKey(ecdsaPrivateKey);
    
    return {
      mlDsaPublicKey: bytesToHex(mlDsaKeys.publicKey),
      mlDsaSecretKey: mlDsaKeys.secretKey,
      ecdsaPublicKey: bytesToHex(ecdsaPublicKey),
      ecdsaPrivateKey: ecdsaPrivateKey,
    };
  } catch (error) {
    console.error('Key generation failed:', error);
    throw new Error('Failed to generate cryptographic keys. Please try again or use a different browser.');
  }
}

/**
 * Sign a message using hybrid cryptography (ML-DSA + ECDSA)
 * Both signatures must verify for the transaction to be considered valid
 * 
 * This provides defense-in-depth:
 * - If ECDSA is broken by quantum computers, ML-DSA remains secure
 * - If ML-DSA has implementation issues, ECDSA provides fallback security
 * 
 * @param message - The message bytes to sign
 * @param keys - Optional key pair (if not provided, uses stored keys)
 */
export async function hybridSign(
  message: Uint8Array,
  keys?: HybridKeyPair
): Promise<HybridSignature> {
  // In production, keys would be retrieved from secure enclave via WebAuthn
  // For demo, we generate ephemeral keys if none provided
  const keyPair = keys || await generateHybridKeys();
  
  // Hash the message for ECDSA signing (secp256k1 expects a 32-byte digest)
  const messageHash = sha256(message);

  // Sign with ML-DSA (post-quantum).
  // Per FIPS 204, ML-DSA performs its own internal hashing — pass the raw
  // message, NOT a prehash, to remain spec-compliant and preserve full
  // collision-resistance properties.
  // Any failure here is fatal — a zero-filled placeholder is NOT a valid
  // ML-DSA signature and will not verify, so we let the exception propagate.
  const mlDsaSignature = ml_dsa65.sign(keyPair.mlDsaSecretKey, message);

  // Sign with ECDSA (classical, EVM-compatible) — uses SHA-256 prehash
  const ecdsaSignature = secp256k1.sign(messageHash, keyPair.ecdsaPrivateKey);
  
  return {
    mlDsaSignature: bytesToHex(mlDsaSignature),
    ecdsaSignature: ecdsaSignature.toCompactHex(),
    algorithm: 'hybrid-ml-dsa-65-ecdsa-secp256k1',
    timestamp: Date.now(),
  };
}

/**
 * Verify a hybrid signature
 * Both ML-DSA and ECDSA signatures must be valid
 */
export function verifyHybridSignature(
  message: Uint8Array,
  signature: HybridSignature,
  mlDsaPublicKey: string,
  ecdsaPublicKey: string
): boolean {
  try {
    // ECDSA operates on the SHA-256 hash of the message
    const messageHash = sha256(message);

    // Verify ECDSA signature (always required - this is our baseline security)
    const ecdsaSig = secp256k1.Signature.fromCompact(signature.ecdsaSignature);
    const ecdsaValid = secp256k1.verify(
      ecdsaSig.toCompactRawBytes(),
      messageHash,
      hexToBytes(ecdsaPublicKey)
    );
    
    if (!ecdsaValid) {
      console.error('ECDSA signature verification failed');
      return false;
    }
    
    // Verify ML-DSA signature against the raw message (FIPS 204 — ML-DSA
    // performs its own internal hashing; passing a prehash here would fail
    // to verify signatures produced by hybridSign).
    // If it throws or returns false the whole verification fails — we never
    // silently accept an invalid PQC signature.
    const mlDsaValid = ml_dsa65.verify(
      hexToBytes(mlDsaPublicKey),
      message,
      hexToBytes(signature.mlDsaSignature)
    );
    
    // Both must be valid for hybrid verification to pass
    return ecdsaValid && mlDsaValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Generate a BIP-39 mnemonic for backup purposes
 * WARNING: This should only be used as a last-resort recovery option
 * Passkeys are the primary authentication method
 */
export function generateMnemonic(): string {
  try {
    return bip39.generateMnemonic(256); // 24 words for maximum security
  } catch (error) {
    console.error('Mnemonic generation failed:', error);
    throw new Error('Failed to generate recovery phrase. Please try again.');
  }
}

/**
 * Validate a BIP-39 mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    return bip39.validateMnemonic(mnemonic);
  } catch (error) {
    console.error('Mnemonic validation failed:', error);
    return false;
  }
}

/**
 * Derive a seed from a mnemonic for key recovery
 */
export async function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Promise<Uint8Array> {
  try {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    const seedBuffer = await bip39.mnemonicToSeed(mnemonic, passphrase);
    return new Uint8Array(seedBuffer);
  } catch (error) {
    console.error('Seed derivation failed:', error);
    throw new Error('Failed to derive seed from recovery phrase.');
  }
}
