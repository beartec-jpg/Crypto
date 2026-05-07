// @ts-ignore — emscripten-generated module
import createFalconModule from './falcon.js';

export const PK_SIZE = 897;
export const SK_SIZE = 1281;
export const SIG_SIZE = 666;
export const SEED_SIZE = 48;

interface FalconWasmModule {
  _falcon_keygen(pk: number, sk: number): number;
  _falcon_seed_keygen(pk: number, sk: number, seed: number): number;
  _falcon_sign(sig: number, siglen: number, msg: number, msglen: number, sk: number): number;
  _falcon_verify(sig: number, siglen: number, msg: number, msglen: number, pk: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
}

let mod: FalconWasmModule | null = null;
let initPromise: Promise<void> | null = null;

export async function initFalcon(): Promise<void> {
  if (mod) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const wasmResponse = await fetch(new URL('./falcon.wasm', import.meta.url));
    const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
    mod = await createFalconModule({ wasmBinary });
  })();

  return initPromise;
}

function ensureInit(): FalconWasmModule {
  if (!mod) throw new Error('Falcon WASM not initialized — call initFalcon() first');
  return mod;
}

function allocAndCopy(m: FalconWasmModule, data: Uint8Array): number {
  const ptr = m._malloc(data.length);
  if (!ptr) throw new Error('WASM malloc failed');
  m.HEAPU8.set(data, ptr);
  return ptr;
}

export const falcon = {
  seedKeygen(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const m = ensureInit();
    if (seed.length !== SEED_SIZE) {
      throw new Error(`Seed must be ${SEED_SIZE} bytes, got ${seed.length}`);
    }
    const pkPtr = m._malloc(PK_SIZE);
    const skPtr = m._malloc(SK_SIZE);
    const seedPtr = allocAndCopy(m, seed);
    try {
      const rc = m._falcon_seed_keygen(pkPtr, skPtr, seedPtr);
      if (rc !== 0) throw new Error('falcon_seed_keygen failed');
      return {
        publicKey: new Uint8Array(m.HEAPU8.buffer, pkPtr, PK_SIZE).slice(),
        secretKey: new Uint8Array(m.HEAPU8.buffer, skPtr, SK_SIZE).slice(),
      };
    } finally {
      m._free(pkPtr);
      m._free(skPtr);
      m._free(seedPtr);
    }
  },

  sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    const m = ensureInit();
    if (secretKey.length !== SK_SIZE) {
      throw new Error(`Secret key must be ${SK_SIZE} bytes, got ${secretKey.length}`);
    }
    const sigPtr = m._malloc(SIG_SIZE);
    const siglenPtr = m._malloc(8);
    const msgPtr = allocAndCopy(m, message);
    const skPtr = allocAndCopy(m, secretKey);
    try {
      const rc = m._falcon_sign(sigPtr, siglenPtr, msgPtr, message.length, skPtr);
      if (rc !== 0) throw new Error('falcon_sign failed');
      return new Uint8Array(m.HEAPU8.buffer, sigPtr, SIG_SIZE).slice();
    } finally {
      m._free(sigPtr);
      m._free(siglenPtr);
      m._free(msgPtr);
      m._free(skPtr);
    }
  },
};
