import { sha256 } from '@noble/hashes/sha256';
import { initFalcon, falcon, PK_SIZE, SK_SIZE, SIG_SIZE, SEED_SIZE } from './falcon-wasm/falconWasm';

export const QBTC_FALCON_PADDED_SIG_BYTES = SIG_SIZE;
export const QBTC_FALCON_PUBLIC_KEY_BYTES = PK_SIZE;
export const QBTC_FALCON_SECRET_KEY_BYTES = SK_SIZE;
export const QBTC_FALCON_SEED_BYTES = SEED_SIZE;

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
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

export interface FalconKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  seed: Uint8Array;
}

export async function getFalconSeedLength(): Promise<number> {
  await initFalcon();
  return SEED_SIZE;
}

export async function generateFalconKeyPair(seed?: Uint8Array): Promise<FalconKeyPair> {
  await initFalcon();
  const actualSeed = seed ? expandSeed(seed, SEED_SIZE, 'QBTC-FALCON-SEED') : crypto.getRandomValues(new Uint8Array(SEED_SIZE));
  const keyPair = falcon.seedKeygen(actualSeed);
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    seed: actualSeed,
  };
}

export async function falconSign(message: Uint8Array | string, secretKey: Uint8Array): Promise<Uint8Array> {
  await initFalcon();
  return falcon.sign(toBytes(message), secretKey);
}

export async function falconVerify(
  signature: Uint8Array,
  message: Uint8Array | string,
  publicKey: Uint8Array
): Promise<boolean> {
  await initFalcon();
  return falcon.verify(signature, toBytes(message), publicKey);
}
