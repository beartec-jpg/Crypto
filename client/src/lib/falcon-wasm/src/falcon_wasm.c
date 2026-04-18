#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>

#include "falcon-padded/api.h"

static const uint8_t QBTC_FALCON_CTX[] = "QuantBTC-Falcon-v1";
static const size_t QBTC_FALCON_CTX_LEN = sizeof(QBTC_FALCON_CTX) - 1;

EMSCRIPTEN_KEEPALIVE
int falcon_keygen(uint8_t *pk, uint8_t *sk) {
    return PQCLEAN_FALCONPADDED512_CLEAN_crypto_sign_keypair(pk, sk);
}

EMSCRIPTEN_KEEPALIVE
int falcon_seed_keygen(uint8_t *pk, uint8_t *sk, const uint8_t *seed) {
    return PQCLEAN_FALCONPADDED512_CLEAN_crypto_sign_seed_keypair(pk, sk, seed);
}

EMSCRIPTEN_KEEPALIVE
int falcon_sign(uint8_t *sig, size_t *siglen,
                const uint8_t *msg, size_t msglen,
                const uint8_t *sk) {
    uint8_t *msg_with_ctx = (uint8_t *)malloc(QBTC_FALCON_CTX_LEN + msglen);
    if (msg_with_ctx == NULL) {
        return -1;
    }

    memcpy(msg_with_ctx, QBTC_FALCON_CTX, QBTC_FALCON_CTX_LEN);
    memcpy(msg_with_ctx + QBTC_FALCON_CTX_LEN, msg, msglen);

    int rc = PQCLEAN_FALCONPADDED512_CLEAN_crypto_sign_signature(
        sig,
        siglen,
        msg_with_ctx,
        QBTC_FALCON_CTX_LEN + msglen,
        sk
    );

    free(msg_with_ctx);
    return rc;
}

EMSCRIPTEN_KEEPALIVE
int falcon_verify(const uint8_t *sig, size_t siglen,
                  const uint8_t *msg, size_t msglen,
                  const uint8_t *pk) {
    uint8_t *msg_with_ctx = (uint8_t *)malloc(QBTC_FALCON_CTX_LEN + msglen);
    if (msg_with_ctx == NULL) {
        return -1;
    }

    memcpy(msg_with_ctx, QBTC_FALCON_CTX, QBTC_FALCON_CTX_LEN);
    memcpy(msg_with_ctx + QBTC_FALCON_CTX_LEN, msg, msglen);

    int rc = PQCLEAN_FALCONPADDED512_CLEAN_crypto_sign_verify(
        sig,
        siglen,
        msg_with_ctx,
        QBTC_FALCON_CTX_LEN + msglen,
        pk
    );

    free(msg_with_ctx);
    return rc;
}

EMSCRIPTEN_KEEPALIVE int falcon_pk_size(void) { return PQCLEAN_FALCONPADDED512_CLEAN_CRYPTO_PUBLICKEYBYTES; }
EMSCRIPTEN_KEEPALIVE int falcon_sk_size(void) { return PQCLEAN_FALCONPADDED512_CLEAN_CRYPTO_SECRETKEYBYTES; }
EMSCRIPTEN_KEEPALIVE int falcon_sig_size(void) { return PQCLEAN_FALCONPADDED512_CLEAN_CRYPTO_BYTES; }
EMSCRIPTEN_KEEPALIVE int falcon_seed_size(void) { return 48; }
