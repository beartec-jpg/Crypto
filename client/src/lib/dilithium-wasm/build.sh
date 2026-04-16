#!/usr/bin/env bash
# Build dilithium-wasm from the vendored pq-crystals ml-dsa reference code.
# Produces: dilithium.wasm + dilithium.js (ES module loader)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/src"
OUT="$SCRIPT_DIR"

# Source emscripten if not already in PATH
if ! command -v emcc &>/dev/null; then
  if [[ -f "$HOME/emsdk/emsdk_env.sh" ]]; then
    source "$HOME/emsdk/emsdk_env.sh" 2>/dev/null
  else
    echo "ERROR: emcc not found. Install Emscripten SDK first." >&2
    exit 1
  fi
fi

C_FILES=(
  "$SRC/dilithium_wasm.c"
  "$SRC/sign.c"
  "$SRC/fips202.c"
  "$SRC/ntt.c"
  "$SRC/packing.c"
  "$SRC/poly.c"
  "$SRC/polyvec.c"
  "$SRC/reduce.c"
  "$SRC/rounding.c"
  "$SRC/symmetric-shake.c"
  "$SRC/randombytes.c"
)

echo "Building dilithium WASM module..."

emcc \
  "${C_FILES[@]}" \
  -I"$SRC" \
  -O2 \
  -s WASM=1 \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createDilithiumModule" \
  -s EXPORTED_FUNCTIONS='[
    "_dilithium_keygen",
    "_dilithium_seed_keygen",
    "_dilithium_sign",
    "_dilithium_verify",
    "_dilithium_pk_size",
    "_dilithium_sk_size",
    "_dilithium_sig_size",
    "_dilithium_seed_size",
    "_malloc",
    "_free"
  ]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","HEAPU32"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=2097152 \
  -s TOTAL_STACK=131072 \
  -s ENVIRONMENT='web,worker' \
  -s FILESYSTEM=0 \
  -s INCOMING_MODULE_JS_API='[]' \
  --js-library "$SCRIPT_DIR/randombytes_lib.js" \
  -o "$OUT/dilithium.js"

echo "Built:"
ls -lh "$OUT/dilithium.js" "$OUT/dilithium.wasm"
echo "Done."
