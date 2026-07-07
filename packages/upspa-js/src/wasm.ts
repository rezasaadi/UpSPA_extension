import initWasm, * as wasm from '../wasm-pkg/upspa_wasm.js';
import wasmUrl from '../wasm-pkg/upspa_wasm_bg.wasm?url';
let initPromise: Promise<typeof wasm> | null = null;
function resolveWasmUrl(): string {
  const rawUrl = String(wasmUrl);
  const chromeRuntime = (globalThis as any).chrome?.runtime;
  if (chromeRuntime?.getURL) {
    if (/^[a-z][a-z\d+\-.]*:/i.test(rawUrl)) return rawUrl;
    const path = rawUrl.replace(/^\/+/, '');
    return chromeRuntime.getURL(path);
  }
  return rawUrl;
}
export async function loadUpspaWasm(): Promise<typeof wasm> {
  if (!initPromise) {
    initPromise = (async () => {
      await initWasm({ module_or_path: resolveWasmUrl() });
      return wasm;
    })();
  }
  return initPromise;
}
