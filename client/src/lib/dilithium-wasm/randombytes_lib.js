/*
 * randombytes_lib.js — Emscripten JS library providing crypto.getRandomValues
 * to the C randombytes() function via js_get_random_bytes.
 */
addToLibrary({
  js_get_random_bytes: function(outPtr, outLen) {
    var buf = new Uint8Array(outLen);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
    } else {
      // Fallback for environments without Web Crypto (should not happen in browser)
      for (var i = 0; i < outLen; i++) {
        buf[i] = (Math.random() * 256) | 0;
      }
    }
    HEAPU8.set(buf, outPtr);
  }
});
