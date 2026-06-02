import type { UpspaConfig } from './config';
import type { CtBlobB64 } from 'upspa-js';
export type UpspaMode = 'login' | 'register' | 'change-password';
export type BgRequest =
  | { type: 'UPSRA_GET_CONFIG' }
  | { type: 'UPSRA_SET_CONFIG'; cfg: UpspaConfig }
  | { type: 'UPSRA_SETUP_AND_PROVISION'; uid: string; password: string; threshold: number; sps: Array<{ id: number; baseUrl: string }> }
  | { type: 'UPSRA_REGISTER'; lsj: string; password: string }
  | { type: 'UPSRA_AUTH'; lsj: string; password: string }
  | { type: 'UPSRA_SECRET_UPDATE_PREP'; lsj: string; password: string }
  | { type: 'UPSRA_SECRET_UPDATE_COMMIT'; suids: Array<{ sp_id: number; suid: string }>; cj_new: CtBlobB64 }
  | { type: 'UPSRA_PASSWORD_UPDATE'; old_password: string; new_password: string; timestamp: number };
export type BgResponse =
  | { ok: true; cfg?: UpspaConfig }
  | { ok: true; vinfo_b64: string }
  | { ok: true; vinfo_prime_b64: string }
  | { ok: true; secret_update: { vinfo_prime_b64: string; vinfo_new_b64: string; cj_new: CtBlobB64; suids: Array<{ sp_id: number; suid: string }>; old_ctr: number; new_ctr: number } }
  | { ok: true; password_update: { cid_new: CtBlobB64 } }
  | { ok: false; error: string };
