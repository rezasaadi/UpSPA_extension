import type { PasswordPolicy } from './passwordPolicy';

const KEY = 'upspa_pending_registration';
export const PENDING_REGISTRATION_TTL_MS = 30 * 60 * 1000;

export type PersistedPendingRegistration = {
  origin: string;
  accountId: string;
  passwordPolicy: PasswordPolicy;
  encoderCounter: number;
  createdAt: number;
  uid: string;
  records: Array<{
    sp_id: number;
    suid: string;
    cj: {
      nonce: string;
      ct: string;
      tag: string;
    };
  }>;
};

function getSessionStorageArea(): chrome.storage.StorageArea {
  const area = (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session;
  if (!area) throw new Error('Temporary extension session storage is unavailable.');
  return area;
}

function isFresh(pending: PersistedPendingRegistration): boolean {
  return Date.now() - pending.createdAt <= PENDING_REGISTRATION_TTL_MS;
}

export async function savePendingRegistration(
  data: Omit<PersistedPendingRegistration, 'createdAt'>,
): Promise<void> {
  const persisted: PersistedPendingRegistration = { ...data, createdAt: Date.now() };
  await getSessionStorageArea().set({ [KEY]: persisted });
}

export async function loadPendingRegistration(): Promise<PersistedPendingRegistration | undefined> {
  const out = await getSessionStorageArea().get(KEY);
  const pending = out[KEY] as PersistedPendingRegistration | undefined;
  if (!pending) return undefined;
  if (!isFresh(pending)) {
    await clearPendingRegistration();
    return undefined;
  }
  return pending;
}

export async function clearPendingRegistration(): Promise<void> {
  await getSessionStorageArea().remove(KEY);
}
