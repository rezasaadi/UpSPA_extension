set -euo pipefail
rm -rf packages/upspa-js/wasm-pkg
wasm-pack build crates/upspa-wasm \
  --target web \
  --out-dir ../../packages/upspa-js/wasm-pkg \
  --release
