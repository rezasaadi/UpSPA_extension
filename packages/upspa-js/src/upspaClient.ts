import { loadUpspaWasm } from './wasm.js';
import type {
  AuthFinishOut,
  AuthPrepareOut,
  CtBlobB64,
  PasswordUpdateOut,
  RegistrationOut,
  SecretUpdateFinishOut,
  SecretUpdatePrepareOut,
  SetupResult,
  ToprfBegin,
  ToprfPartial,
  UpspaClientConfig,
} from './types.js';
import { HttpStorageProviderClient, type StorageProviderClient } from './spClient.js';
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
export class UpspaClient {
  public readonly uid: string;
  public readonly threshold: number;
  public readonly sps: StorageProviderClient[];
  private wasm: Awaited<ReturnType<typeof loadUpspaWasm>> | null = null;
  constructor(cfg: UpspaClientConfig, spClients?: StorageProviderClient[]) {
    this.uid = cfg.uid;
    this.threshold = cfg.threshold;
    const clients = spClients ?? cfg.sps.map((d) => new HttpStorageProviderClient(d));
    assert(clients.length > 0, 'At least one SP is required');
    assert(cfg.threshold >= 1 && cfg.threshold <= clients.length, 'Invalid threshold');
    const ids = new Set<number>();
    for (const c of clients) {
      if (ids.has(c.id)) throw new Error(`Duplicate SP id: ${c.id}`);
      ids.add(c.id);
    }
    this.sps = clients;
  }
  async init(): Promise<void> {
    if (!this.wasm) this.wasm = await loadUpspaWasm();
  }
  private w(): NonNullable<UpspaClient['wasm']> {
    assert(this.wasm, 'UpspaClient not initialized. Call await client.init() first.');
    return this.wasm;
  }
  private spById(id: number): StorageProviderClient {
    const sp = this.sps.find((s) => s.id === id);
    if (!sp) throw new Error(`No SP configured for id=${id}`);
    return sp;
  }
  async setupAndProvision(password: string, tsp = this.threshold): Promise<SetupResult> {
    await this.init();
    const nsp = this.sps.length;
    const out = this.w().protocol_setup(this.uid, password, nsp, tsp) as SetupResult;
    const results = await Promise.allSettled(out.sp_payloads.map((p) => this.spById(p.sp_id).setup(p)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok < this.threshold) {
      const errs = results
        .map((r, i) => (r.status === 'rejected' ? `sp_id=${out.sp_payloads[i].sp_id}: ${String(r.reason)}` : null))
        .filter(Boolean)
        .join('\n');
      throw new Error(`Setup provisioning succeeded on ${ok}/${nsp} SPs (< threshold ${this.threshold}).\n${errs}`);
    }
    return out;
  }
  async deriveStateKey(password: string): Promise<{ state_key_b64: string; begin: ToprfBegin; partials: ToprfPartial[] }> {
    await this.init();
    const begin = this.w().toprf_begin(password) as ToprfBegin;
    const evals = await Promise.allSettled(this.sps.map((sp) => sp.toprfEval(this.uid, begin.blinded)));
    const partials: ToprfPartial[] = [];
    for (const r of evals) {
      if (r.status === 'fulfilled') partials.push(r.value);
    }
    if (partials.length < this.threshold) {
      const errors = evals
        .map((r, i) => (r.status === 'rejected' ? `sp_id=${this.sps[i].id}: ${String(r.reason)}` : null))
        .filter(Boolean)
        .join('\n');
      throw new Error(`TOPRF: only ${partials.length}/${this.sps.length} partials succeeded (< threshold ${this.threshold}).\n${errors}`);
    }
    const chosen = partials.slice(0, this.threshold);
    const state_key_b64 = this.w().toprf_finish(password, begin.r, chosen);
    return { state_key_b64, begin, partials: chosen };
  }
  async fetchCid(): Promise<CtBlobB64> {
    for (const sp of this.sps) {
      try {
        const out = await sp.getSetup(this.uid);
        return out.cid;
      } catch {
      }
    }
    throw new Error('Failed to fetch cid from all SPs');
  }
  async register(lsj: string, password: string): Promise<RegistrationOut> {
    await this.init();
    const { state_key_b64 } = await this.deriveStateKey(password);
    const cid = await this.fetchCid();
    const out = this.w().protocol_register(this.uid, lsj, state_key_b64, cid, this.sps.length) as RegistrationOut;
    const writes = await Promise.allSettled(
      out.per_sp.map((m) => this.spById(m.sp_id).createRecord(m.suid, m.cj)),
    );
    const ok = writes.filter((r) => r.status === 'fulfilled').length;
    if (ok < this.threshold) {
      throw new Error(`Registration: only ${ok}/${out.per_sp.length} SP record writes succeeded (< threshold ${this.threshold}).`);
    }
    return out;
  }
  async authenticate(lsj: string, password: string): Promise<AuthFinishOut> {
    await this.init();
    const { state_key_b64 } = await this.deriveStateKey(password);
    const cid = await this.fetchCid();
    const prep = this.w().protocol_auth_prepare(this.uid, lsj, state_key_b64, cid, this.sps.length) as AuthPrepareOut;
    const reads = await Promise.allSettled(
      prep.per_sp.map((m) => this.spById(m.sp_id).getRecord(m.suid)),
    );
    const cjs: CtBlobB64[] = [];
    for (const r of reads) {
      if (r.status === 'fulfilled') cjs.push(r.value);
    }
    if (cjs.length < this.threshold) {
      throw new Error(`Authentication: only ${cjs.length}/${prep.per_sp.length} cj reads succeeded (< threshold ${this.threshold}).`);
    }
    const out = this.w().protocol_auth_finish(this.uid, lsj, prep.k0, cjs) as AuthFinishOut;
    return out;
  }
  async secretUpdate(lsj: string, password: string): Promise<SecretUpdateFinishOut & { suids: Array<{ sp_id: number; suid: string }> }> {
    await this.init();
    const { state_key_b64 } = await this.deriveStateKey(password);
    const cid = await this.fetchCid();
    const prep = this.w().protocol_secret_update_prepare(this.uid, lsj, state_key_b64, cid, this.sps.length) as SecretUpdatePrepareOut;
    const reads = await Promise.allSettled(
      prep.per_sp.map((m) => this.spById(m.sp_id).getRecord(m.suid)),
    );
    const cjs: CtBlobB64[] = [];
    for (const r of reads) {
      if (r.status === 'fulfilled') cjs.push(r.value);
    }
    if (cjs.length < this.threshold) {
      throw new Error(`Secret update: only ${cjs.length}/${prep.per_sp.length} cj reads succeeded (< threshold ${this.threshold}).`);
    }
    const out = this.w().protocol_secret_update_finish(this.uid, lsj, prep.k0, cjs) as SecretUpdateFinishOut;
    return { ...out, suids: prep.per_sp };
  }
  async applySecretUpdateToSPs(suids: Array<{ sp_id: number; suid: string }>, cj_new: CtBlobB64): Promise<void> {
    const writes = await Promise.allSettled(suids.map((m) => this.spById(m.sp_id).updateRecord(m.suid, cj_new)));
    const ok = writes.filter((r) => r.status === 'fulfilled').length;
    if (ok < this.threshold) {
      throw new Error(`Secret-update SP writes: only ${ok}/${suids.length} succeeded (< threshold ${this.threshold}).`);
    }
  }
  async passwordUpdate(oldPassword: string, newPassword: string, timestamp: number): Promise<PasswordUpdateOut> {
    await this.init();
    const { state_key_b64: old_state_key_b64 } = await this.deriveStateKey(oldPassword);
    const cid_old = await this.fetchCid();
    const out = this.w().protocol_password_update(
      this.uid,
      old_state_key_b64,
      cid_old,
      this.sps.length,
      this.threshold,
      newPassword,
      BigInt(timestamp),
    ) as PasswordUpdateOut;
    const writes = await Promise.allSettled(
      out.per_sp.map((m) =>
        this.spById(m.sp_id).passwordUpdate({
          uid: this.uid,
          sp_id: m.sp_id,
          timestamp,
          sig_b64: m.sig,
          cid_new: out.cid_new,
          k_i_new_b64: m.k_i_new,
        }),
      ),
    );
    const ok = writes.filter((r) => r.status === 'fulfilled').length;
    if (ok < this.threshold) {
      throw new Error(`Password update: only ${ok}/${out.per_sp.length} SP updates succeeded (< threshold ${this.threshold}).`);
    }
    return out;
  }
}
