export const SESSION_TTL_MS = 30 * 60 * 1000;

type SessionState = {
  lastUsedAt?: number;
};

const STORAGE_KEY = 'upspa_session';

async function getSessionState(): Promise<SessionState> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return out[STORAGE_KEY] ?? {};
}

export async function isSessionFresh(): Promise<boolean> {
  const state = await getSessionState();
  if (!state.lastUsedAt) return false;
  return Date.now() - state.lastUsedAt <= SESSION_TTL_MS;
}

export async function markSessionUsed(): Promise<void> {
  const state: SessionState = {
    lastUsedAt: Date.now(),
  };
  await chrome.storage.local.set({
    [STORAGE_KEY]: state,
  });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
