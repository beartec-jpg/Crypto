import { sha256 } from '@noble/hashes/sha256';
import { initFalcon, falcon, SEED_SIZE } from './falcon-wasm/falconWasm';

export interface FalconCompatibilityProof {
  algorithm: 'falcon-512-staged-compat';
  mode: 'offchain-sidecar';
  messageDigestHex: string;
  falconPublicKeyHex: string;
  falconSignatureHex: string;
  note: string;
}

function expandSeed(masterSeed: Uint8Array, targetLength: number, label: string): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const out = new Uint8Array(targetLength);
  let written = 0;
  let counter = 0;

  while (written < targetLength) {
    const input = new Uint8Array(masterSeed.length + labelBytes.length + 1);
    input.set(masterSeed, 0);
    input.set(labelBytes, masterSeed.length);
    input[input.length - 1] = counter & 0xff;
    const block = sha256(input);
    const chunk = Math.min(block.length, targetLength - written);
    out.set(block.slice(0, chunk), written);
    written += chunk;
    counter += 1;
  }

  return out;
}

export async function deriveQBTCFalconKeyPair(seedMaterial: Uint8Array) {
  await initFalcon();
  const falconSeed = expandSeed(seedMaterial, SEED_SIZE, 'QBTC-FALCON-SEED');
  const keyPair = falcon.seedKeygen(falconSeed);
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    seed: falconSeed,
  };
}

export async function signQBTCFalconDigest(messageDigest: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
  await initFalcon();
  return falcon.sign(messageDigest, secretKey);
}

export async function createQBTCFalconCompatibilityProof(
  ecdsaPriv: Uint8Array,
  dilSeed: Uint8Array,
  messageDigest: Uint8Array
): Promise<FalconCompatibilityProof> {
  await initFalcon();
  const master = new Uint8Array(ecdsaPriv.length + dilSeed.length);
  master.set(ecdsaPriv, 0);
  master.set(dilSeed, ecdsaPriv.length);
  const falconSeed = expandSeed(master, SEED_SIZE, 'QBTC-FALCON-COMPAT');
  const keyPair = falcon.seedKeygen(falconSeed);
  const sig = falcon.sign(messageDigest, keyPair.secretKey);
  return {
    algorithm: 'falcon-512-staged-compat',
    mode: 'offchain-sidecar',
    messageDigestHex: Buffer.from(messageDigest).toString('hex'),
    falconPublicKeyHex: Buffer.from(keyPair.publicKey).toString('hex'),
    falconSignatureHex: Buffer.from(sig).toString('hex'),
    note: 'Generated with the exact QuantBTC Falcon-padded-512 runtime.',
  };
}
