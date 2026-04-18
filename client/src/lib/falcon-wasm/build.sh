#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/src"
OUT="$SCRIPT_DIR"

if ! command -v emcc &>/dev/null; then
  if [[ -f "$HOME/emsdk/emsdk_env.sh" ]]; then
    source "$HOME/emsdk/emsdk_env.sh" 2>/dev/null
  else
    echo "ERROR: emcc not found. Install Emscripten SDK first." >&2
    exit 1
  fi
fi

C_FILES=(
  "$SRC/falcon_wasm.c"
  "$SRC/falcon-padded/codec.c"
  "$SRC/falcon-padded/common.c"
  "$SRC/falcon-padded/fips202.c"
  "$SRC/falcon-padded/fft.c"
  "$SRC/falcon-padded/fpr.c"
  "$SRC/falcon-padded/keygen.c"
  "$SRC/falcon-padded/pqclean.c"
  "$SRC/randombytes.c"
  "$SRC/falcon-padded/rng.c"
  "$SRC/falcon-padded/sign.c"
  "$SRC/falcon-padded/vrfy.c"
)

echo "Building Falcon-512 WASM module..."

emcc \
  "${C_FILES[@]}" \
  -I"$SRC" \
  -I"$SRC/falcon-padded" \
  -O2 \
  -s WASM=1 \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createFalconModule" \
  -s EXPORTED_FUNCTIONS='[
    "_falcon_keygen",
    "_falcon_seed_keygen",
    "_falcon_sign",
    "_falcon_verify",
    "_falcon_pk_size",
    "_falcon_sk_size",
    "_falcon_sig_size",
    "_falcon_seed_size",
    "_malloc",
    "_free"
  ]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","HEAPU32"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=16777216 \
  -s TOTAL_STACK=262144 \
  -s ENVIRONMENT='web,worker' \
  -s FILESYSTEM=0 \
  -s INCOMING_MODULE_JS_API='["wasmBinary"]' \
  --js-library "$SCRIPT_DIR/randombytes_lib.js" \
  -o "$OUT/falcon.js"

echo "Built:"
ls -lh "$OUT/falcon.js" "$OUT/falcon.wasm"
