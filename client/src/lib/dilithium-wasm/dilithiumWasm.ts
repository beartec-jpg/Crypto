/**
 * dilithiumWasm.ts — TypeScript wrapper around the compiled WASM module.
 *
 * Provides keygen/sign/verify using the exact same pq-crystals Dilithium2
 * (ML-DSA-44) code that the QuantBTC nodes run, compiled to WebAssembly.
 *
 * Usage:
 *   import { initDilithium, dilithium } from './dilithium-wasm/dilithiumWasm';
 *   await initDilithium();                         // call once at startup
 *   const { publicKey, secretKey } = dilithium.seedKeygen(seed32); // sync after init
 *   const sig = dilithium.sign(message, secretKey);
 *   const ok = dilithium.verify(sig, message, publicKey);
 */

// @ts-ignore — emscripten-generated module
import createDilithiumModule from './dilithium.js';
// @ts-ignore — binary asset
import wasmUrl from './dilithium.wasm?url';

export const PK_SIZE = 1312;
export const SK_SIZE = 2560;
export const SIG_SIZE = 2420;
export const SEED_SIZE = 32;

interface DilithiumWasmModule {
  _dilithium_keygen(pk: number, sk: number): number;
  _dilithium_seed_keygen(pk: number, sk: number, seed: number): number;
  _dilithium_sign(sig: number, siglen: number, msg: number, msglen: number, sk: number): number;
  _dilithium_verify(sig: number, siglen: number, msg: number, msglen: number, pk: number): number;
  _dilithium_pk_size(): number;
  _dilithium_sk_size(): number;
  _dilithium_sig_size(): number;
  _dilithium_seed_size(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
}

let mod: DilithiumWasmModule | null = null;
let initPromise: Promise<void> | null = null;

/** Call once before using dilithium.* methods. Safe to call multiple times. */
export async function initDilithium(): Promise<void> {
  if (mod) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    mod = await createDilithiumModule({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return wasmUrl;
        return path;
      },
    });
  })();

  return initPromise;
}

function ensureInit(): DilithiumWasmModule {
  if (!mod) throw new Error('Dilithium WASM not initialized — call initDilithium() first');
  return mod;
}

function allocAndCopy(m: DilithiumWasmModule, data: Uint8Array): number {
  const ptr = m._malloc(data.length);
  if (!ptr) throw new Error('WASM malloc failed');
  m.HEAPU8.set(data, ptr);
  return ptr;
}

/** Synchronous API — available after initDilithium() resolves. */
export const dilithium = {
  keygen(): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const m = ensureInit();
    const pkPtr = m._malloc(PK_SIZE);
    const skPtr = m._malloc(SK_SIZE);
    if (!pkPtr || !skPtr) throw new Error('WASM malloc failed');

    try {
      const rc = m._dilithium_keygen(pkPtr, skPtr);
      if (rc !== 0) throw new Error('dilithium_keygen failed');
      return {
        publicKey: new Uint8Array(m.HEAPU8.buffer, pkPtr, PK_SIZE).slice(),
        secretKey: new Uint8Array(m.HEAPU8.buffer, skPtr, SK_SIZE).slice(),
      };
    } finally {
      m._free(pkPtr);
      m._free(skPtr);
    }
  },

  seedKeygen(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const m = ensureInit();
    if (seed.length !== SEED_SIZE) {
      throw new Error(`Seed must be ${SEED_SIZE} bytes, got ${seed.length}`);
    }
    const pkPtr = m._malloc(PK_SIZE);
    const skPtr = m._malloc(SK_SIZE);
    const seedPtr = allocAndCopy(m, seed);

    try {
      const rc = m._dilithium_seed_keygen(pkPtr, skPtr, seedPtr);
      if (rc !== 0) throw new Error('dilithium_seed_keygen failed');
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
      const rc = m._dilithium_sign(sigPtr, siglenPtr, msgPtr, message.length, skPtr);
      if (rc !== 0) throw new Error('dilithium_sign failed');
      return new Uint8Array(m.HEAPU8.buffer, sigPtr, SIG_SIZE).slice();
    } finally {
      m._free(sigPtr);
      m._free(siglenPtr);
      m._free(msgPtr);
      m._free(skPtr);
    }
  },

  verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
    const m = ensureInit();
    if (signature.length !== SIG_SIZE) return false;
    if (publicKey.length !== PK_SIZE) return false;

    const sigPtr = allocAndCopy(m, signature);
    const msgPtr = allocAndCopy(m, message);
    const pkPtr = allocAndCopy(m, publicKey);

    try {
      const rc = m._dilithium_verify(sigPtr, signature.length, msgPtr, message.length, pkPtr);
      return rc === 0;
    } finally {
      m._free(sigPtr);
      m._free(msgPtr);
      m._free(pkPtr);
    }
  },
};
