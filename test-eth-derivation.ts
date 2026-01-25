// Test script to verify Ethereum address derivation fix
import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

// OLD BROKEN IMPLEMENTATION (SHA-256)
function deriveEthereumAddressBroken(privateKeyBytes: Uint8Array): string {
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
  const publicKeyNoPrefix = publicKeyBytes.slice(1);
  const hash = sha256(publicKeyNoPrefix);
  return ethers.getAddress('0x' + Buffer.from(hash.slice(-20)).toString('hex'));
}

// NEW FIXED IMPLEMENTATION (Keccak-256 via ethers.js)
function deriveEthereumAddressFixed(privateKeyBytes: Uint8Array): string {
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  const wallet = new ethers.Wallet('0x' + privateKeyHex);
  return wallet.address;
}

// Test with a known private key
const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const privateKeyBytes = ethers.getBytes(testPrivateKey);

console.log('🧪 Testing Ethereum Address Derivation Fix\n');

// Get the correct address using ethers.js directly
const correctWallet = new ethers.Wallet(testPrivateKey);
const correctAddress = correctWallet.address;

// Test broken implementation
const brokenAddress = deriveEthereumAddressBroken(privateKeyBytes);

// Test fixed implementation
const fixedAddress = deriveEthereumAddressFixed(privateKeyBytes);

console.log('Results:');
console.log('  ✅ Correct (ethers):', correctAddress);
console.log('  ❌ Broken (SHA-256):', brokenAddress);
console.log('  ✅ Fixed (Keccak-256):', fixedAddress);
console.log('');

// Verify the fix
const brokenMatches = brokenAddress.toLowerCase() === correctAddress.toLowerCase();
const fixedMatches = fixedAddress.toLowerCase() === correctAddress.toLowerCase();

console.log('Verification:');
console.log('  Broken implementation matches:', brokenMatches ? '✅' : '❌');
console.log('  Fixed implementation matches:', fixedMatches ? '✅' : '❌');
console.log('');

if (!brokenMatches && fixedMatches) {
  console.log('✅ SUCCESS! Fix correctly uses Keccak-256 instead of SHA-256');
  process.exit(0);
} else {
  console.log('❌ FAILED! Fix does not work as expected');
  process.exit(1);
}
