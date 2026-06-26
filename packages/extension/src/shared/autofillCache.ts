const LOCAL_KEY = 'upspa_autofill_cache';
const SESSION_KEY = 'upspa_autofill_session';
const PBKDF2_ITERATIONS = 100_000;

export type AutofillData = {
  preferredAccountByOrigin: Record<string, string>;
};

type EncryptedBlob = {
  salt: string;
  iv: string;
  ciphertext: string;
};

function getSessionStorageArea(): chrome.storage.StorageArea {
  const area = (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session;
  if (!area) throw new Error('Temporary extension session storage is unavailable.');
  return area;
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(masterPassword: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptData(key: CryptoKey, data: AutofillData): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv, ciphertext };
}

async function decryptData(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ciphertext: Uint8Array<ArrayBuffer>): Promise<AutofillData> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as AutofillData;
}

export async function saveAutofillCache(masterPassword: string, data: AutofillData): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(masterPassword, salt);
  const { iv, ciphertext } = await encryptData(key, data);

  const blob: EncryptedBlob = {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
  await chrome.storage.local.set({ [LOCAL_KEY]: blob });
  await getSessionStorageArea().set({ [SESSION_KEY]: data });
}

export async function mergeAndSaveAutofillCache(
  masterPassword: string,
  origin: string,
  accountId: string,
): Promise<void> {
  const existing = await loadAutofillCache(masterPassword);
  const merged: AutofillData = {
    preferredAccountByOrigin: {
      ...(existing?.preferredAccountByOrigin ?? {}),
      [origin]: accountId,
    },
  };
  await saveAutofillCache(masterPassword, merged);
}

export async function loadAutofillCacheFromSession(): Promise<AutofillData | null> {
  const out = await getSessionStorageArea().get(SESSION_KEY);
  const data = out[SESSION_KEY] as AutofillData | undefined;
  return data ?? null;
}

export async function loadAutofillCache(masterPassword: string): Promise<AutofillData | null> {
  const out = await chrome.storage.local.get(LOCAL_KEY);
  const blob = out[LOCAL_KEY] as EncryptedBlob | undefined;
  if (!blob) return null;

  try {
    const salt = fromBase64(blob.salt);
    const iv = fromBase64(blob.iv);
    const ciphertext = fromBase64(blob.ciphertext);
    const key = await deriveKey(masterPassword, salt);
    const data = await decryptData(key, iv, ciphertext);
    await getSessionStorageArea().set({ [SESSION_KEY]: data });
    return data;
  } catch {
    return null;
  }
}

export async function clearAutofillCache(): Promise<void> {
  await chrome.storage.local.remove(LOCAL_KEY);
  await getSessionStorageArea().remove(SESSION_KEY);
}
