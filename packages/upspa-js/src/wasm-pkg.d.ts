declare module '../wasm-pkg/upspa_wasm.js' {
  const init: (moduleOrPath?: unknown) => Promise<void>;
  export default init;
  export function protocol_setup(uid: string, password: string, nsp: number, tsp: number): unknown;
  export function toprf_begin(password: string): unknown;
  export function toprf_finish(password: string, r: string, partials: unknown): string;
  export function protocol_register(
    uid: string,
    lsj: string,
    state_key: string,
    cid: unknown,
    nsp: number,
  ): unknown;
  export function protocol_auth_prepare(
    uid: string,
    lsj: string,
    state_key: string,
    cid: unknown,
    nsp: number,
  ): unknown;
  export function protocol_auth_finish(uid: string, lsj: string, k0: string, cjs: unknown): unknown;
  export function protocol_secret_update_prepare(
    uid: string,
    lsj: string,
    state_key: string,
    cid: unknown,
    nsp: number,
  ): unknown;
  export function protocol_secret_update_finish(uid: string, lsj: string, k0: string, cjs: unknown): unknown;
  export function protocol_password_update(
    uid: string,
    old_state_key: string,
    cid_old: unknown,
    nsp: number,
    tsp: number,
    new_password: string,
    timestamp: bigint,
  ): unknown;
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
