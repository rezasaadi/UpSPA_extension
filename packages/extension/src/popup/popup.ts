import { getConfig } from '../shared/config';
import type {
  ContentFillRequest,
  ContentFillResponse,
  PasswordPolicyExtractionResponse,
} from '../shared/messages';
import {
  defaultPasswordPolicy,
  encodeSecretAsPassword,
  normalizePasswordPolicy,
  type PasswordPolicy,
} from '../shared/passwordPolicy';
import {
  getAccountsForOrigin,
  getAccountForOrigin,
  removeAccountForOrigin,
  updatePasswordPolicyForAccount,
  upsertAccountForOrigin,
  updateAccountForOrigin,
  type SiteAccount,
} from '../shared/siteAccounts';
import { makeLsj } from '../shared/siteIdentity';
import { clearSession, isSessionFresh, markSessionUsed } from '../shared/session';
import {
  clearPendingRegistration,
  loadPendingRegistration,
  savePendingRegistration,
  type PersistedPendingRegistration,
} from '../shared/pendingRegistration';
import {
  clearAutofillCache,
  loadAutofillCacheFromSession,
  mergeAndSaveAutofillCache,
} from '../shared/autofillCache';
import {
  authenticateForSite,
  commitSecretUpdateForSite,
  prepareSecretUpdateForSite,
  registerForSite,
  type PreparedSecretUpdate,
} from '../shared/upspaActions';

type PendingSecretUpdateCommit = {
  uid: string;
  cjNew: PreparedSecretUpdate['cjNew'];
  suids: PreparedSecretUpdate['suids'];
  origin: string;
  accountId: string;
  createdAt: number;
  passwordPolicy: PasswordPolicy;
  encoderCounter: number;
};

type PendingRegistration = PersistedPendingRegistration;

type ContentFillSuccess = Extract<ContentFillResponse, { ok: true }>;

const PENDING_SECRET_UPDATE_KEY = 'upspa_pending_secret_update';
const PENDING_SECRET_UPDATE_TTL_MS = 5 * 60 * 1000;

const originEl = document.getElementById('origin') as HTMLDivElement;
const accountSelectEl = document.getElementById('accountSelect') as HTMLSelectElement;
const accountIdEl = document.getElementById('accountId') as HTMLInputElement;
const masterPasswordEl = document.getElementById('masterPassword') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const saveAccountButton = document.getElementById('saveAccount') as HTMLButtonElement;
const deleteAccountButton = document.getElementById('deleteAccount') as HTMLButtonElement;
const detectPolicyButton = document.getElementById('detectPolicy') as HTMLButtonElement;
const policyMinLenEl = document.getElementById('policyMinLen') as HTMLInputElement;
const policyMaxLenEl = document.getElementById('policyMaxLen') as HTMLInputElement;
const policyUpperEl = document.getElementById('policyUpper') as HTMLInputElement;
const policyLowerEl = document.getElementById('policyLower') as HTMLInputElement;
const policyDigitEl = document.getElementById('policyDigit') as HTMLInputElement;
const policySymbolEl = document.getElementById('policySymbol') as HTMLInputElement;
const policyWhitespaceEl = document.getElementById('policyWhitespace') as HTMLInputElement;
const policySymbolsEl = document.getElementById('policySymbols') as HTMLInputElement;
const policyForbiddenEl = document.getElementById('policyForbidden') as HTMLInputElement;
const policyEvidenceEl = document.getElementById('policyEvidence') as HTMLDivElement;
const registerButton = document.getElementById('registerSite') as HTMLButtonElement;
const generateCandidateButton = document.getElementById('generateCandidate') as HTMLButtonElement;
const confirmRegistrationButton = document.getElementById('confirmRegistration') as HTMLButtonElement;
const loginButton = document.getElementById('loginSite') as HTMLButtonElement;
const prepareUpdateButton = document.getElementById('prepareSecretUpdate') as HTMLButtonElement;
const commitUpdateButton = document.getElementById('commitSecretUpdate') as HTMLButtonElement;
const cancelUpdateButton = document.getElementById('cancelSecretUpdate') as HTMLButtonElement;
const lockSessionButton = document.getElementById('lockSession') as HTMLButtonElement;
const openOptionsButton = document.getElementById('openOptions') as HTMLButtonElement;

let activeTabId: number | undefined;
let activeOrigin = '';
let pendingSecretUpdate: PendingSecretUpdateCommit | undefined;
let pendingRegistration: PendingRegistration | undefined;
let siteAccounts: SiteAccount[] = [];
let policyEvidence: string[] = [];
let currentEncoderCounter = 0;

function getSessionStorageArea(): chrome.storage.StorageArea {
  const area = (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session;
  if (!area) throw new Error('Temporary extension session storage is unavailable.');
  return area;
}

function isPendingSecretUpdateFresh(pending: PendingSecretUpdateCommit): boolean {
  return Date.now() - pending.createdAt <= PENDING_SECRET_UPDATE_TTL_MS;
}

async function savePendingSecretUpdate(
  prepared: PreparedSecretUpdate,
  origin: string,
  accountId: string,
  passwordPolicy: PasswordPolicy,
  encoderCounter: number,
): Promise<PendingSecretUpdateCommit> {
  const pending: PendingSecretUpdateCommit = {
    uid: prepared.uid,
    cjNew: prepared.cjNew,
    suids: prepared.suids,
    origin,
    accountId,
    createdAt: Date.now(),
    passwordPolicy,
    encoderCounter,
  };
  await getSessionStorageArea().set({ [PENDING_SECRET_UPDATE_KEY]: pending });
  pendingSecretUpdate = pending;
  return pending;
}

async function loadPendingSecretUpdate(): Promise<PendingSecretUpdateCommit | undefined> {
  const out = await getSessionStorageArea().get(PENDING_SECRET_UPDATE_KEY);
  const pending = out[PENDING_SECRET_UPDATE_KEY] as PendingSecretUpdateCommit | undefined;
  if (!pending) return undefined;
  if (!isPendingSecretUpdateFresh(pending)) {
    await clearPendingSecretUpdate();
    return undefined;
  }
  pendingSecretUpdate = pending;
  return pending;
}

async function clearPendingSecretUpdate(): Promise<void> {
  pendingSecretUpdate = undefined;
  await getSessionStorageArea().remove(PENDING_SECRET_UPDATE_KEY);
}

function setStatus(message: string, kind: 'normal' | 'error' = 'normal'): void {
  statusEl.textContent = message;
  statusEl.className = kind === 'error' ? 'status error' : 'status';
}

function setBusy(isBusy: boolean): void {
  registerButton.disabled = isBusy;
  confirmRegistrationButton.disabled = isBusy || !pendingRegistration;
  generateCandidateButton.disabled = isBusy;
  loginButton.disabled = isBusy;
  prepareUpdateButton.disabled = isBusy;
  commitUpdateButton.disabled = isBusy || !pendingSecretUpdate;
  cancelUpdateButton.disabled = isBusy || !pendingSecretUpdate;
}

function getActiveOrigin(url: string | undefined): string {
  if (!url) throw new Error('No active tab URL found.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('UpSPA can only fill normal http/https website pages.');
  }
  return parsed.origin;
}

function readInputs(): { accountId: string; masterPassword: string; lsj: string } {
  const accountId = (accountIdEl.value.trim() || accountSelectEl.value).trim();
  const masterPassword = masterPasswordEl.value;
  if (!activeOrigin) throw new Error('No active website origin found.');
  if (!accountId) throw new Error('Account id is empty.');
  if (!masterPassword) throw new Error('Master password is empty.');
  return {
    accountId,
    masterPassword,
    lsj: makeLsj(activeOrigin, accountId),
  };
}

function renderPolicy(policy: PasswordPolicy, evidence = policyEvidence, counter = currentEncoderCounter): void {
  const normalized = normalizePasswordPolicy(policy);
  policyMinLenEl.value = String(normalized.minLen);
  policyMaxLenEl.value = String(normalized.maxLen);
  policyUpperEl.checked = normalized.requireUpper;
  policyLowerEl.checked = normalized.requireLower;
  policyDigitEl.checked = normalized.requireDigit;
  policySymbolEl.checked = normalized.requireSymbol;
  policyWhitespaceEl.checked = normalized.forbidWhitespace;
  policySymbolsEl.value = normalized.allowedSymbols;
  policyForbiddenEl.value = normalized.forbiddenSubstrings.join(', ');
  policyEvidence = evidence;
  currentEncoderCounter = counter;
  policyEvidenceEl.textContent = evidence.length
    ? `Counter ${counter}. Evidence: ${evidence.slice(0, 4).join(' | ')}`
    : `Counter ${counter}.`;
}

function readPolicy(): PasswordPolicy {
  return normalizePasswordPolicy({
    minLen: Number(policyMinLenEl.value),
    maxLen: Number(policyMaxLenEl.value),
    requireUpper: policyUpperEl.checked,
    requireLower: policyLowerEl.checked,
    requireDigit: policyDigitEl.checked,
    requireSymbol: policySymbolEl.checked,
    forbidWhitespace: policyWhitespaceEl.checked,
    allowedSymbols: policySymbolsEl.value,
    forbiddenSubstrings: policyForbiddenEl.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

function selectedAccount(): SiteAccount | undefined {
  const accountId = accountSelectEl.value || accountIdEl.value.trim();
  return siteAccounts.find((account) => account.accountId === accountId);
}

function renderAccounts(preferredAccountId?: string): void {
  accountSelectEl.innerHTML = '';

  if (siteAccounts.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No accounts saved for this site';
    accountSelectEl.appendChild(option);
    accountSelectEl.disabled = true;
    deleteAccountButton.disabled = true;
    if (!accountIdEl.value.trim()) accountIdEl.value = '';
    renderPolicy(defaultPasswordPolicy(), policyEvidence, currentEncoderCounter);
    return;
  }

  accountSelectEl.disabled = false;
  deleteAccountButton.disabled = false;
  for (const account of siteAccounts) {
    const option = document.createElement('option');
    option.value = account.accountId;
    option.textContent = account.label ? `${account.label} (${account.accountId})` : account.accountId;
    accountSelectEl.appendChild(option);
  }

  const selected =
    siteAccounts.find((account) => account.accountId === preferredAccountId)?.accountId ?? siteAccounts[0].accountId;
  accountSelectEl.value = selected;
  accountIdEl.value = selected;
  const account = siteAccounts.find((item) => item.accountId === selected);
  renderPolicy(account?.passwordPolicy ?? defaultPasswordPolicy(), policyEvidence, account?.encoderCounter ?? 0);
}

async function loadAccounts(preferredAccountId?: string): Promise<void> {
  if (!activeOrigin) return;
  siteAccounts = await getAccountsForOrigin(activeOrigin);
  renderAccounts(preferredAccountId);
}

async function sendFillCommand(message: ContentFillRequest): Promise<ContentFillResponse> {
  if (activeTabId === undefined) throw new Error('No active tab found.');
  const tabId = activeTabId;
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: ContentFillResponse | undefined) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!response) {
        reject(new Error('Content script did not respond on this page.'));
        return;
      }
      resolve(response);
    });
  });
}

async function sendExtractPolicyCommand(): Promise<PasswordPolicyExtractionResponse> {
  if (activeTabId === undefined) throw new Error('No active tab found.');
  const tabId = activeTabId;
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'UPSPA_EXTRACT_PASSWORD_POLICY' },
      (response: PasswordPolicyExtractionResponse | undefined) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (!response) {
          reject(new Error('Content script did not respond on this page.'));
          return;
        }
        resolve(response);
      },
    );
  });
}

async function fillOrThrow(message: ContentFillRequest): Promise<ContentFillSuccess> {
  const response = await sendFillCommand(message);
  if (!response.ok) throw new Error(response.error);
  return response;
}

function describeFilled(response: ContentFillSuccess): string {
  const username = response.filled.username ? 'username filled' : 'username not changed';
  return `${username}, password fields filled: ${response.filled.passwords}`;
}

async function runPopupAction(action: () => Promise<string>): Promise<void> {
  setBusy(true);
  const masterPasswordSnapshot = masterPasswordEl.value;
  const accountIdSnapshot = (accountIdEl.value.trim() || accountSelectEl.value).trim();
  try {
    const status = await action();
    await markSessionUsed();
    if (masterPasswordSnapshot && accountIdSnapshot && activeOrigin) {
      await mergeAndSaveAutofillCache(masterPasswordSnapshot, activeOrigin, accountIdSnapshot).catch(() => undefined);
    }
    setStatus(status);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    masterPasswordEl.value = '';
    setBusy(false);
  }
}

registerButton.addEventListener('click', () => {
  void runPopupAction(async () => {
    const { accountId, masterPassword, lsj } = readInputs();
    const rawPasswordForLs = await registerForSite(lsj, masterPassword);
    const policy = readPolicy();
    const encoded = await encodeSecretAsPassword(rawPasswordForLs, policy, accountId, currentEncoderCounter);
    renderPolicy(policy, policyEvidence, encoded.counter);
    const response = await fillOrThrow({
      type: 'UPSPA_FILL_REGISTER',
      payload: { accountId, passwordForLs: encoded.password },
    });
    pendingRegistration = {
      origin: activeOrigin,
      accountId,
      passwordPolicy: policy,
      encoderCounter: encoded.counter,
      createdAt: Date.now(),
    };
    await savePendingRegistration(pendingRegistration);
    return `Registration value filled (${describeFilled(response)}). Submit the website form manually. After the website confirms registration, click Confirm Registration Success.`;
  });
});

confirmRegistrationButton.addEventListener('click', () => {
  void (async () => {
    try {
      if (!pendingRegistration) {
        setStatus('No registration is waiting for confirmation.', 'error');
        return;
      }
      if (pendingRegistration.origin !== activeOrigin) {
        setStatus('Pending registration belongs to a different website origin.', 'error');
        return;
      }
      await upsertAccountForOrigin(pendingRegistration.origin, {
        accountId: pendingRegistration.accountId,
        createdAt: Math.floor(Date.now() / 1000),
        passwordPolicy: pendingRegistration.passwordPolicy,
        encoderCounter: pendingRegistration.encoderCounter,
      });
      await loadAccounts(pendingRegistration.accountId);
      pendingRegistration = undefined;
      await clearPendingRegistration();
      setBusy(false);
      setStatus('Registration confirmed. Account mapping saved for this origin.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), 'error');
    }
  })();
});

accountSelectEl.addEventListener('change', () => {
  accountIdEl.value = accountSelectEl.value;
  const account = selectedAccount();
  renderPolicy(account?.passwordPolicy ?? defaultPasswordPolicy(), policyEvidence, account?.encoderCounter ?? 0);
});

detectPolicyButton.addEventListener('click', () => {
  void (async () => {
    try {
      const response = await sendExtractPolicyCommand();
      if (!response.ok) throw new Error(response.error);
      const policy = normalizePasswordPolicy({
        ...defaultPasswordPolicy(),
        ...response.policyHints,
      });
      renderPolicy(policy, response.evidence, currentEncoderCounter);
      setStatus('Password policy detected. Review or edit before registration.');
    } catch (e) {
      renderPolicy(defaultPasswordPolicy(), ['Policy detection failed; using safe defaults.'], currentEncoderCounter);
      setStatus(e instanceof Error ? e.message : String(e), 'error');
    }
  })();
});

generateCandidateButton.addEventListener('click', () => {
  currentEncoderCounter += 1;
  renderPolicy(readPolicy(), policyEvidence, currentEncoderCounter);
  setStatus('Encoder counter incremented. Enter master password and run the fill action again.');
});

saveAccountButton.addEventListener('click', () => {
  void (async () => {
    try {
      const nextAccountId = accountIdEl.value.trim();
      if (!nextAccountId) throw new Error('Account id is empty.');
      const selectedAccountId = accountSelectEl.value;
      if (selectedAccountId && selectedAccountId !== nextAccountId) {
        await updateAccountForOrigin(activeOrigin, selectedAccountId, nextAccountId);
      }
      await upsertAccountForOrigin(activeOrigin, {
        accountId: nextAccountId,
        createdAt: Math.floor(Date.now() / 1000),
        passwordPolicy: readPolicy(),
        encoderCounter: currentEncoderCounter,
      });
      await loadAccounts(nextAccountId);
      setStatus(`Account saved for ${activeOrigin} with the current password policy.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), 'error');
    }
  })();
});

deleteAccountButton.addEventListener('click', () => {
  void (async () => {
    try {
      const accountId = accountSelectEl.value;
      if (!accountId) throw new Error('No account selected.');
      await removeAccountForOrigin(activeOrigin, accountId);
      await loadAccounts();
      const sessionCache = await loadAutofillCacheFromSession();
      if (sessionCache?.preferredAccountByOrigin[activeOrigin] === accountId) {
        delete sessionCache.preferredAccountByOrigin[activeOrigin];
        const area = (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session;
        if (area) await area.set({ upspa_autofill_session: sessionCache });
      }
      setStatus(`Account mapping deleted. No LS password or master password was stored.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), 'error');
    }
  })();
});

loginButton.addEventListener('click', () => {
  void runPopupAction(async () => {
    const { accountId, masterPassword, lsj } = readInputs();
    const account = await getAccountForOrigin(activeOrigin, accountId);
    if (!account?.passwordPolicy || account.encoderCounter === undefined) {
      throw new Error('No password policy stored for this account. Register or configure account first.');
    }
    const rawPasswordForLs = await authenticateForSite(lsj, masterPassword);
    const encoded = await encodeSecretAsPassword(
      rawPasswordForLs,
      account.passwordPolicy,
      accountId,
      account.encoderCounter,
    );
    const response = await fillOrThrow({
      type: 'UPSPA_FILL_LOGIN',
      payload: { accountId, passwordForLs: encoded.password },
    });
    return `Login value filled (${describeFilled(response)}). Submit the website form manually.`;
  });
});

prepareUpdateButton.addEventListener('click', () => {
  void runPopupAction(async () => {
    const { accountId, masterPassword, lsj } = readInputs();
    const account = await getAccountForOrigin(activeOrigin, accountId);
    if (!account?.passwordPolicy || account.encoderCounter === undefined) {
      throw new Error('No password policy stored for this account. Register or configure account first.');
    }
    const prepared = await prepareSecretUpdateForSite(lsj, masterPassword);
    const policy = readPolicy();
    const oldEncoded = await encodeSecretAsPassword(
      prepared.oldForLs,
      account.passwordPolicy,
      accountId,
      account.encoderCounter,
    );
    const newEncoded = await encodeSecretAsPassword(prepared.newForLs, policy, accountId, currentEncoderCounter);
    renderPolicy(policy, policyEvidence, newEncoded.counter);
    const response = await fillOrThrow({
      type: 'UPSPA_FILL_PASSWORD_CHANGE',
      payload: {
        oldPasswordForLs: oldEncoded.password,
        newPasswordForLs: newEncoded.password,
      },
    });
    await savePendingSecretUpdate(prepared, activeOrigin, accountId, policy, newEncoded.counter);
    return `Secret update values filled (${describeFilled(response)}). Submit the website change form manually, then commit after it succeeds.`;
  });
});

commitUpdateButton.addEventListener('click', () => {
  void (async () => {
    const pending = pendingSecretUpdate ?? (await loadPendingSecretUpdate());
    if (!pending) {
      setStatus('No prepared secret update is waiting to commit.', 'error');
      return;
    }
    if (!isPendingSecretUpdateFresh(pending)) {
      await clearPendingSecretUpdate();
      setStatus('Prepared secret update expired. Prepare it again before committing.', 'error');
      setBusy(false);
      return;
    }
    if (pending.origin !== activeOrigin) {
      setStatus('Prepared secret update belongs to a different website origin.', 'error');
      return;
    }
    setBusy(true);
    try {
      await commitSecretUpdateForSite(pending);
      await updatePasswordPolicyForAccount(pending.origin, pending.accountId, {
        policy: pending.passwordPolicy,
        encoderCounter: pending.encoderCounter,
      });
      await clearPendingSecretUpdate();
      await loadAccounts(pending.accountId);
      setStatus('Secret update committed to Storage Providers.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  })();
});

cancelUpdateButton.addEventListener('click', () => {
  void (async () => {
    await clearPendingSecretUpdate();
    setBusy(false);
    setStatus('Prepared secret update canceled. Storage Providers were not changed.');
  })();
});

lockSessionButton.addEventListener('click', () => {
  void (async () => {
    await clearPendingSecretUpdate();
    await clearPendingRegistration();
    await clearAutofillCache();
    await clearSession();
    setBusy(false);
    setStatus('Extension locked. Enter master password to register, login, or prepare a secret update.');
  })();
});

openOptionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;
  activeOrigin = getActiveOrigin(tab?.url);
  originEl.textContent = activeOrigin;

  const pendingUpdate = await loadPendingSecretUpdate();
  if (pendingUpdate?.origin !== activeOrigin) {
    pendingSecretUpdate = undefined;
  }

  const persistedReg = await loadPendingRegistration();
  if (persistedReg && persistedReg.origin === activeOrigin) {
    pendingRegistration = persistedReg;
  }

  const sessionAutofill = await loadAutofillCacheFromSession();
  const preferredAccountId =
    pendingRegistration?.accountId ??
    pendingSecretUpdate?.accountId ??
    sessionAutofill?.preferredAccountByOrigin[activeOrigin];

  await loadAccounts(preferredAccountId);

  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.uid) {
    setStatus('Open Options and run Setup / Provision before using the popup.', 'error');
    setBusy(true);
    return;
  }

  const freshSession = await isSessionFresh();
  if (pendingSecretUpdate) {
    setStatus('Prepared secret update is waiting. Commit only after the website confirms success.');
  } else if (pendingRegistration) {
    setStatus('Registration pending — submit the site form then click Confirm Registration Success.');
  } else if (!freshSession) {
    setStatus('Extension locked. Enter master password to register, login, or prepare a secret update.');
  } else {
    setStatus(`Configured as ${cfg.uid}. SPs: ${cfg.sps.length}, threshold: ${cfg.threshold}.`);
  }
  setBusy(false);
}

setBusy(true);
main().catch((e) => {
  setStatus(e instanceof Error ? e.message : String(e), 'error');
});
