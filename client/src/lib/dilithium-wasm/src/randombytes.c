/*
 * randombytes implementation for Emscripten/WASM.
 * Calls JavaScript-provided entropy via an imported function.
 * The JS side hooks this to crypto.getRandomValues().
 */
#include "randombytes.h"

/* Imported from JS at link time (see build script -s EXPORTED_RUNTIME_METHODS) */
extern void js_get_random_bytes(uint8_t *out, size_t outlen);

void randombytes(uint8_t *out, size_t outlen) {
    js_get_random_bytes(out, outlen);
}
