// client/src/lib/crypto.ts
// Hybrid post-quantum cryptography utilities
// Uses Falcon-512 for post-quantum security + ECDSA for compatibility

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import * as bip39 from 'bip39';
import { falconSign, falconVerify, generateFalconKeyPair } from './falconSigner';

/**
 * Hybrid key pair containing both post-quantum (Falcon) and classical (ECDSA) keys
 * This provides security against both classical and quantum attacks.
 */
export interface HybridKeyPair {
  // Falcon keys for post-quantum security
  falconPublicKey: string;
  falconSecretKey: Uint8Array; // Never expose or transmit

  // ECDSA secp256k1 keys for EVM compatibility
  ecdsaPublicKey: string;
  ecdsaPrivateKey: Uint8Array; // Never expose or transmit
}

/**
 * Hybrid signature containing both Falcon and ECDSA signatures
 */
export interface HybridSignature {
  falconSignature: string;
  ecdsaSignature: string;
  algorithm: 'hybrid-falcon-512-ecdsa-secp256k1';
  timestamp: number;
}

/**
 * Generate a hybrid key pair with both Falcon and ECDSA keys
 */
export async function generateHybridKeys(): Promise<HybridKeyPair> {
  try {
    const falconKeys = await generateFalconKeyPair();
    const ecdsaPrivateKey = crypto.getRandomValues(new Uint8Array(32));
    const ecdsaPublicKey = secp256k1.getPublicKey(ecdsaPrivateKey);

    return {
      falconPublicKey: bytesToHex(falconKeys.publicKey),
      falconSecretKey: falconKeys.secretKey,
      ecdsaPublicKey: bytesToHex(ecdsaPublicKey),
      ecdsaPrivateKey,
    };
  } catch (error) {
    console.error('Key generation failed:', error);
    throw new Error('Failed to generate cryptographic keys. Please try again or use a different browser.');
  }
}

/**
 * Sign a message using hybrid cryptography (Falcon + ECDSA)
 */
export async function hybridSign(
  message: Uint8Array,
  keys?: HybridKeyPair
): Promise<HybridSignature> {
  const keyPair = keys || await generateHybridKeys();
  const messageHash = sha256(message);

  const falconSignature = await falconSign(message, keyPair.falconSecretKey);
  const ecdsaSignature = secp256k1.sign(messageHash, keyPair.ecdsaPrivateKey);

  return {
    falconSignature: bytesToHex(falconSignature),
    ecdsaSignature: ecdsaSignature.toCompactHex(),
    algorithm: 'hybrid-falcon-512-ecdsa-secp256k1',
    timestamp: Date.now(),
  };
}

/**
 * Verify a hybrid signature
 * Both Falcon and ECDSA signatures must be valid.
 */
export async function verifyHybridSignature(
  message: Uint8Array,
  signature: HybridSignature,
  falconPublicKey: string,
  ecdsaPublicKey: string
): Promise<boolean> {
  try {
    const messageHash = sha256(message);

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

    const falconValid = await falconVerify(
      hexToBytes(signature.falconSignature),
      message,
      hexToBytes(falconPublicKey)
    );

    return ecdsaValid && falconValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Generate a BIP-39 mnemonic for backup purposes.
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
 * Validate a BIP-39 mnemonic.
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
 * Derive a seed from a mnemonic for key recovery.
 */
export async function mnemonicToSeed(mnemonic: string, passphrase = ''): Promise<Uint8Array> {
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
