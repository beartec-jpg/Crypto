#include <stddef.h>
#include <stdint.h>
#include <emscripten/emscripten.h>

#ifdef __cplusplus
extern "C" {
#endif

EM_JS(void, js_get_random_bytes, (uint8_t *out, size_t outlen), {
  var buf = new Uint8Array(outlen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (var i = 0; i < outlen; i++) {
      buf[i] = (Math.random() * 256) | 0;
    }
  }
  HEAPU8.set(buf, out);
});

void randombytes(uint8_t *out, size_t outlen) {
  js_get_random_bytes(out, outlen);
}

#ifdef __cplusplus
}
#endif
