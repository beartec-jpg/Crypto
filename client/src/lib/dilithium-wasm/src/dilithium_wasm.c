/*
 * dilithium_wasm.c – Thin WASM export wrapper around vendored ml-dsa.
 *
 * Exports:
 *   dilithium_keygen(pk, sk)                    → random keypair
 *   dilithium_seed_keygen(pk, sk, seed)          → deterministic keypair from 32-byte seed
 *   dilithium_sign(sig, siglen, msg, msglen, sk) → sign (empty context, deterministic)
 *   dilithium_verify(sig, siglen, msg, msglen, pk) → verify
 *
 * All sizes match the node's Dilithium2 / ML-DSA-44 configuration.
 */
#include <stdint.h>
#include <stddef.h>
#include <emscripten/emscripten.h>

#include "sign.h"
#include "params.h"

static const uint8_t QBTC_MLDSA_CTX[] = "QuantBTC-MLDSA-v1";
static const size_t QBTC_MLDSA_CTX_LEN = sizeof(QBTC_MLDSA_CTX) - 1;

/* ── keygen (random) ──────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int dilithium_keygen(uint8_t *pk, uint8_t *sk) {
    return crypto_sign_keypair(pk, sk);
}

/* ── keygen (deterministic from 32-byte seed) ────────────────── */
EMSCRIPTEN_KEEPALIVE
int dilithium_seed_keygen(uint8_t *pk, uint8_t *sk, const uint8_t *seed) {
    return crypto_sign_seed_keypair(pk, sk, seed);
}

/* ── sign ─────────────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int dilithium_sign(uint8_t *sig, size_t *siglen,
                   const uint8_t *msg, size_t msglen,
                   const uint8_t *sk)
{
    /* Match the live node's QuantBTC-specific ML-DSA domain context. */
    return crypto_sign_signature(sig, siglen, msg, msglen, QBTC_MLDSA_CTX, QBTC_MLDSA_CTX_LEN, sk);
}

/* ── verify ───────────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int dilithium_verify(const uint8_t *sig, size_t siglen,
                     const uint8_t *msg, size_t msglen,
                     const uint8_t *pk)
{
    /* Match the live node's QuantBTC-specific ML-DSA domain context. */
    return crypto_sign_verify(sig, siglen, msg, msglen, QBTC_MLDSA_CTX, QBTC_MLDSA_CTX_LEN, pk);
}

/* ── size constants (readable from JS) ────────────────────────── */
EMSCRIPTEN_KEEPALIVE int dilithium_pk_size(void)  { return CRYPTO_PUBLICKEYBYTES; }
EMSCRIPTEN_KEEPALIVE int dilithium_sk_size(void)  { return CRYPTO_SECRETKEYBYTES; }
EMSCRIPTEN_KEEPALIVE int dilithium_sig_size(void) { return CRYPTO_BYTES; }
EMSCRIPTEN_KEEPALIVE int dilithium_seed_size(void) { return SEEDBYTES; }
