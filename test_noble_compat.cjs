// Cross-compatibility test: generate ML-DSA-44 keypair + signature with noble
// Output seed, message, public key, and signature in hex for the C test
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const { hmac } = require('@noble/hashes/hmac');
const { sha512 } = require('@noble/hashes/sha512');

// Use a fixed test seed (32 bytes)
const testSeed = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

// Test message (simulating a 32-byte sighash)
const testMsg = Buffer.from('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'hex');

console.log('=== Noble ML-DSA-44 test ===');
console.log('SEED=' + Buffer.from(testSeed).toString('hex'));
console.log('MSG=' + Buffer.from(testMsg).toString('hex'));

// Generate keypair from seed
const { publicKey, secretKey } = ml_dsa44.keygen(testSeed);
console.log('NOBLE_PK=' + Buffer.from(publicKey).toString('hex'));
console.log('NOBLE_PK_SIZE=' + publicKey.length);
console.log('NOBLE_SK_SIZE=' + secretKey.length);

// Sign the message
const sig = ml_dsa44.sign(testMsg, secretKey);
console.log('NOBLE_SIG=' + Buffer.from(sig).toString('hex'));
console.log('NOBLE_SIG_SIZE=' + sig.length);

// Self-verify
const ok = ml_dsa44.verify(sig, testMsg, publicKey);
console.log('NOBLE_SELF_VERIFY=' + (ok ? 'OK' : 'FAIL'));

// Print first 32 bytes of PK for quick comparison
console.log('NOBLE_PK_FIRST32=' + Buffer.from(publicKey.slice(0, 32)).toString('hex'));

// Also test with the actual wallet key derivation
const ecdsaPriv = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
const derivedSeed = hmac(sha512, ecdsaPriv, new TextEncoder().encode('QuantBTC-Dilithium')).slice(0, 32);
console.log('\n=== Wallet-derived seed test ===');
console.log('WALLET_SEED=' + Buffer.from(derivedSeed).toString('hex'));
const wallet = ml_dsa44.keygen(derivedSeed);
console.log('WALLET_PK_FIRST32=' + Buffer.from(wallet.publicKey.slice(0, 32)).toString('hex'));
const walletSig = ml_dsa44.sign(testMsg, wallet.secretKey);
console.log('WALLET_SIG_SIZE=' + walletSig.length);
const walletOk = ml_dsa44.verify(walletSig, testMsg, wallet.publicKey);
console.log('WALLET_SELF_VERIFY=' + (walletOk ? 'OK' : 'FAIL'));
