import type { PasswordPolicy, PasswordPolicyState } from './passwordPolicy';
import { normalizePasswordPolicy } from './passwordPolicy';

export type SiteAccount = {
  accountId: string;
  label?: string;
  createdAt: number;
  updatedAt?: number;
  passwordPolicy?: PasswordPolicy;
  encoderCounter?: number;
};

type LegacySiteAccountRecord = {
  accountId: string;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
  passwordPolicy?: PasswordPolicy;
  encoderCounter?: number;
};

type RawSiteAccounts = Record<string, SiteAccount[] | LegacySiteAccountRecord | undefined>;
type SiteAccounts = Record<string, SiteAccount[]>;

const STORAGE_KEY = 'upspa_site_accounts';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeAccount(account: LegacySiteAccountRecord): SiteAccount {
  const createdAt = account.createdAt ?? nowSeconds();
  return {
    accountId: account.accountId,
    label: account.label,
    createdAt,
    updatedAt: account.updatedAt,
    passwordPolicy: account.passwordPolicy ? normalizePasswordPolicy(account.passwordPolicy) : undefined,
    encoderCounter: Number.isInteger(account.encoderCounter) ? account.encoderCounter : undefined,
  };
}

function normalizeAccounts(raw: RawSiteAccounts): SiteAccounts {
  const out: SiteAccounts = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (!value) continue;
    const accounts = Array.isArray(value) ? value : [normalizeAccount(value)];
    const seen = new Set<string>();
    out[origin] = accounts
      .map(normalizeAccount)
      .filter((account) => {
        const accountId = account.accountId.trim();
        if (!accountId || seen.has(accountId)) return false;
        seen.add(accountId);
        account.accountId = accountId;
        return true;
      });
    if (out[origin].length === 0) delete out[origin];
  }
  return out;
}

async function getSiteAccounts(): Promise<SiteAccounts> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeAccounts(out[STORAGE_KEY] ?? {});
}

async function saveSiteAccounts(accounts: SiteAccounts): Promise<void> {
  for (const origin of Object.keys(accounts)) {
    if (accounts[origin].length === 0) delete accounts[origin];
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
}

export async function getAccountsForOrigin(origin: string): Promise<SiteAccount[]> {
  const accounts = await getSiteAccounts();
  return accounts[origin] ?? [];
}

export async function listAccountsForOrigin(origin: string): Promise<SiteAccount[]> {
  return getAccountsForOrigin(origin);
}

export async function getAccountForOrigin(origin: string): Promise<string | undefined>;
export async function getAccountForOrigin(origin: string, accountId: string): Promise<SiteAccount | undefined>;
export async function getAccountForOrigin(
  origin: string,
  accountId?: string,
): Promise<string | SiteAccount | undefined> {
  const accounts = await getAccountsForOrigin(origin);
  if (accountId === undefined) return accounts[0]?.accountId;
  return accounts.find((account) => account.accountId === accountId.trim());
}

export async function upsertAccountForOrigin(origin: string, account: SiteAccount): Promise<void> {
  const cleanAccountId = account.accountId.trim();
  if (!origin) throw new Error('Origin is empty.');
  if (!cleanAccountId) throw new Error('Account id is empty.');

  const accounts = await getSiteAccounts();
  const originAccounts = accounts[origin] ?? [];
  const existing = originAccounts.find((item) => item.accountId === cleanAccountId);
  const now = nowSeconds();
  const next: SiteAccount = {
    ...existing,
    ...account,
    accountId: cleanAccountId,
    createdAt: existing?.createdAt ?? account.createdAt ?? now,
    updatedAt: now,
    passwordPolicy: account.passwordPolicy ? normalizePasswordPolicy(account.passwordPolicy) : existing?.passwordPolicy,
    encoderCounter:
      account.encoderCounter !== undefined
        ? account.encoderCounter
        : existing?.encoderCounter,
  };

  if (existing) {
    Object.assign(existing, next);
  } else {
    originAccounts.push(next);
  }
  accounts[origin] = originAccounts;
  await saveSiteAccounts(accounts);
}

export async function setAccountForOrigin(origin: string, accountId: string): Promise<void> {
  const cleanAccountId = accountId.trim();
  if (!origin) throw new Error('Origin is empty.');
  if (!cleanAccountId) throw new Error('Account id is empty.');

  await upsertAccountForOrigin(origin, {
    accountId: cleanAccountId,
    createdAt: nowSeconds(),
  });
}

export async function updateAccountForOrigin(
  origin: string,
  previousAccountId: string,
  nextAccountId: string,
): Promise<void> {
  const cleanPrevious = previousAccountId.trim();
  const cleanNext = nextAccountId.trim();
  if (!origin) throw new Error('Origin is empty.');
  if (!cleanPrevious) throw new Error('Previous account id is empty.');
  if (!cleanNext) throw new Error('New account id is empty.');

  const accounts = await getSiteAccounts();
  const originAccounts = accounts[origin] ?? [];
  const existing = originAccounts.find((account) => account.accountId === cleanPrevious);
  const duplicate = originAccounts.some(
    (account) => account.accountId === cleanNext && account.accountId !== cleanPrevious,
  );
  if (duplicate) throw new Error('That account id already exists for this origin.');
  if (existing) {
    existing.accountId = cleanNext;
    existing.updatedAt = nowSeconds();
    accounts[origin] = originAccounts;
  } else {
    accounts[origin] = [
      ...originAccounts,
      {
        accountId: cleanNext,
        createdAt: nowSeconds(),
      },
    ];
  }
  await saveSiteAccounts(accounts);
}

export async function updatePasswordPolicyForAccount(
  origin: string,
  accountId: string,
  state: PasswordPolicyState,
): Promise<void> {
  const cleanAccountId = accountId.trim();
  if (!cleanAccountId) throw new Error('Account id is empty.');
  const existing = await getAccountForOrigin(origin, cleanAccountId);
  await upsertAccountForOrigin(origin, {
    ...(existing ?? {
      accountId: cleanAccountId,
      createdAt: nowSeconds(),
    }),
    passwordPolicy: normalizePasswordPolicy(state.policy),
    encoderCounter: state.encoderCounter,
  });
}

export async function removeAccountForOrigin(origin: string, accountId?: string): Promise<void> {
  if (!origin) throw new Error('Origin is empty.');
  const accounts = await getSiteAccounts();
  if (!accountId) {
    delete accounts[origin];
    await saveSiteAccounts(accounts);
    return;
  }

  accounts[origin] = (accounts[origin] ?? []).filter((account) => account.accountId !== accountId);
  await saveSiteAccounts(accounts);
}
