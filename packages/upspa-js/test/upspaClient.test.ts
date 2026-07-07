import { describe, expect, it, vi } from 'vitest';
import type { StorageProviderClient } from '../src/spClient.js';
import { UpspaClient } from '../src/upspaClient.js';
vi.mock('../src/wasm.js', async () => {
  return {
    loadUpspaWasm: async () => ({
      protocol_setup: (uid: string, password: string, nsp: number, tsp: number) => ({
        sig_pk: 'sigpk',
        cid: { nonce: 'n', ct: 'c', tag: 't' },
        shares: [],
        sp_payloads: Array.from({ length: nsp }, (_, i) => ({
          sp_id: i + 1,
          uid: 'uid',
          sig_pk: 'sigpk',
          cid: { nonce: 'n', ct: 'c', tag: 't' },
          k_i: 'k',
        })),
      }),
      toprf_begin: (password: string) => ({ r: 'r', blinded: `blinded(${password})` }),
      toprf_finish: (password: string, r: string, partials: unknown) => {
        const p = partials as Array<{ id: number; y: string }>;
        return `state_key(${password},${r},${p.map((x) => x.id).join(',')})`;
      },
      protocol_register: () => ({
        per_sp: [
          { sp_id: 1, suid: 'suid1', cj: { nonce: 'n', ct: 'c', tag: 't' } },
          { sp_id: 2, suid: 'suid2', cj: { nonce: 'n', ct: 'c', tag: 't' } },
        ],
        to_ls: { uid: 'uid', vinfo: 'vinfo' },
      }),
      protocol_auth_prepare: () => ({
        k0: 'k0',
        per_sp: [
          { sp_id: 1, suid: 'suid1' },
          { sp_id: 2, suid: 'suid2' },
        ],
      }),
      protocol_auth_finish: () => ({ vinfo_prime: 'vinfo_prime', best_ctr: 0 }),
      protocol_secret_update_prepare: () => ({
        k0: 'k0',
        per_sp: [
          { sp_id: 1, suid: 'suid1' },
          { sp_id: 2, suid: 'suid2' },
        ],
      }),
      protocol_secret_update_finish: () => ({
        vinfo_prime: 'vinfo_prime',
        vinfo_new: 'vinfo_new',
        cj_new: { nonce: 'n2', ct: 'c2', tag: 't2' },
        old_ctr: 0,
        new_ctr: 1,
      }),
      protocol_password_update: () => ({
        cid_new: { nonce: 'n3', ct: 'c3', tag: 't3' },
        per_sp: [
          { sp_id: 1, sig: 'sig1', k_i_new: 'k1' },
          { sp_id: 2, sig: 'sig2', k_i_new: 'k2' },
        ],
      }),
    }),
  };
});
function mkSp(id: number, opts?: { failToprf?: boolean; failCid?: boolean }): StorageProviderClient {
  return {
    id,
    baseUrl: `https://sp${id}.example`,
    health: async () => undefined,
    setup: async () => undefined,
    getSetup: async () => {
      if (opts?.failCid) throw new Error('nope');
      return { sig_pk_b64: 'sigpk', cid: { nonce: 'n', ct: 'c', tag: 't' } };
    },
    toprfEval: async () => {
      if (opts?.failToprf) throw new Error('toprf fail');
      return { id, y: `y${id}` };
    },
    createRecord: async () => undefined,
    getRecord: async () => ({ nonce: 'n', ct: 'c', tag: 't' }),
    updateRecord: async () => undefined,
    passwordUpdate: async () => undefined,
  };
}
describe('UpspaClient (mocked wasm)', () => {
  it('derives state key with threshold partials', async () => {
    const client = new UpspaClient(
      {
        uid: 'alice',
        threshold: 2,
        sps: [
          { id: 1, baseUrl: 'https://sp1' },
          { id: 2, baseUrl: 'https://sp2' },
          { id: 3, baseUrl: 'https://sp3' },
        ],
      },
      [mkSp(1), mkSp(2), mkSp(3, { failToprf: true })],
    );
    const r = await client.deriveStateKey('pw');
    expect(r.state_key_b64).toContain('state_key(pw');
    expect(r.partials.length).toBe(2);
    expect(r.partials.map((p) => p.id)).toEqual([1, 2]);
  });
  it('fetches cid from first available SP', async () => {
    const client = new UpspaClient(
      {
        uid: 'alice',
        threshold: 2,
        sps: [
          { id: 1, baseUrl: 'https://sp1' },
          { id: 2, baseUrl: 'https://sp2' },
        ],
      },
      [mkSp(1, { failCid: true }), mkSp(2)],
    );
    const cid = await client.fetchCid();
    expect(cid.ct).toBe('c');
  });
  it('register returns vinfo and writes records', async () => {
    const sp1 = mkSp(1);
    const sp2 = mkSp(2);
    const createSpy1 = vi.spyOn(sp1, 'createRecord');
    const createSpy2 = vi.spyOn(sp2, 'createRecord');
    const client = new UpspaClient(
      {
        uid: 'alice',
        threshold: 2,
        sps: [
          { id: 1, baseUrl: 'https://sp1' },
          { id: 2, baseUrl: 'https://sp2' },
        ],
      },
      [sp1, sp2],
    );
    const out = await client.register('https://ls.example', 'pw');
    expect(out.to_ls.vinfo).toBe('vinfo');
    expect(createSpy1).toHaveBeenCalledTimes(1);
    expect(createSpy2).toHaveBeenCalledTimes(1);
  });
});
