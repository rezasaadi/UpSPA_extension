import type { CtBlobB64, SetupSpPayload, StorageProviderDescriptor, ToprfPartial } from './types.js';
import { utf8ToBase64Url } from './base64url.js';
export interface StorageProviderClient {
  readonly id: number;
  readonly baseUrl: string;
  health(): Promise<void>;
  setup(payload: SetupSpPayload): Promise<void>;
  getSetup(uid: string): Promise<{ sig_pk_b64: string; cid: CtBlobB64 }>;
  toprfEval(uid: string, blinded_b64: string): Promise<ToprfPartial>;
  createRecord(suid_b64: string, cj: CtBlobB64): Promise<void>;
  getRecord(suid_b64: string): Promise<CtBlobB64>;
  updateRecord(suid_b64: string, cj: CtBlobB64): Promise<void>;
  passwordUpdate(req: {
    uid: string;
    sp_id: number;
    timestamp: number;
    sig_b64: string;
    cid_new: CtBlobB64;
    k_i_new_b64: string;
  }): Promise<void>;
}
async function fetchJson<T>(url: string, init: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}: ${body}`);
    }
    const text = await res.text();
    if (!text) return undefined as unknown as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(to);
  }
}
function normBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
export class HttpStorageProviderClient implements StorageProviderClient {
  public readonly id: number;
  public readonly baseUrl: string;
  constructor(desc: StorageProviderDescriptor) {
    this.id = desc.id;
    this.baseUrl = normBaseUrl(desc.baseUrl);
  }
  async health(): Promise<void> {
    await fetchJson(`${this.baseUrl}/v1/health`, { method: 'GET' }, 5_000);
  }
  async setup(payload: SetupSpPayload): Promise<void> {
    await fetchJson(`${this.baseUrl}/v1/setup`, {
      method: 'POST',
      body: JSON.stringify({
        uid_b64: payload.uid,
        sig_pk_b64: payload.sig_pk,
        cid: payload.cid,
        k_i_b64: payload.k_i,
      }),
    });
  }
  async getSetup(uid: string): Promise<{ sig_pk_b64: string; cid: CtBlobB64 }> {
    const uid_b64 = utf8ToBase64Url(uid);
    const out = await fetchJson<{ sig_pk_b64: string; cid: CtBlobB64 }>(
      `${this.baseUrl}/v1/setup/${encodeURIComponent(uid_b64)}`,
      { method: 'GET' },
    );
    return out;
  }
  async toprfEval(uid: string, blinded_b64: string): Promise<ToprfPartial> {
    const uid_b64 = utf8ToBase64Url(uid);
    const out = await fetchJson<{ sp_id: number; y_b64: string }>(`${this.baseUrl}/v1/toprf/eval`, {
      method: 'POST',
      body: JSON.stringify({ uid_b64, blinded_b64 }),
    });
    return { id: out.sp_id, y: out.y_b64 };
  }
  async createRecord(suid_b64: string, cj: CtBlobB64): Promise<void> {
    await fetchJson(`${this.baseUrl}/v1/records`, {
      method: 'POST',
      body: JSON.stringify({ suid_b64, cj }),
    });
  }
  async getRecord(suid_b64: string): Promise<CtBlobB64> {
    const out = await fetchJson<{ cj: CtBlobB64 }>(
      `${this.baseUrl}/v1/records/${encodeURIComponent(suid_b64)}`,
      { method: 'GET' },
    );
    return out.cj;
  }
  async updateRecord(suid_b64: string, cj: CtBlobB64): Promise<void> {
    await fetchJson(`${this.baseUrl}/v1/records/${encodeURIComponent(suid_b64)}`, {
      method: 'PUT',
      body: JSON.stringify({ cj }),
    });
  }
  async passwordUpdate(req: {
    uid: string;
    sp_id: number;
    timestamp: number;
    sig_b64: string;
    cid_new: CtBlobB64;
    k_i_new_b64: string;
  }): Promise<void> {
    const uid_b64 = utf8ToBase64Url(req.uid);
    await fetchJson(`${this.baseUrl}/v1/password-update`, {
      method: 'POST',
      body: JSON.stringify({
        uid_b64,
        sp_id: req.sp_id,
        timestamp: req.timestamp,
        sig_b64: req.sig_b64,
        cid_new: req.cid_new,
        k_i_new_b64: req.k_i_new_b64,
      }),
    });
  }
}
