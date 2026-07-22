import { UpspaClient, type CtBlobB64, type RegistrationSpOut } from 'upspa-js';
import { getConfig, setConfig, type UpspaConfig, type SpConfig } from './config';
export type PreparedSecretUpdate = {
  uid: string;
  oldForLs: string;
  newForLs: string;
  cjNew: CtBlobB64;
  suids: Array<{ sp_id: number; suid: string }>;
};
export type PreparedRegistration = {
  uid: string;
  passwordForLs: string;
  records: RegistrationSpOut[];
};
function requireConfig(cfg: UpspaConfig): Required<UpspaConfig> {
  if (!cfg.enabled) throw new Error('UpSPA is disabled.');
  if (!cfg.uid) throw new Error('UpSPA uid is empty. Open extension options.');
  if (!cfg.sps || cfg.sps.length === 0) throw new Error('No Storage Providers configured.');
  if (!cfg.threshold || cfg.threshold < 1 || cfg.threshold > cfg.sps.length) {
    throw new Error('Invalid threshold.');
  }
  return cfg as Required<UpspaConfig>;
}
function resolveClientUid(cfg: Required<UpspaConfig>, uidOverride?: string): string {
  const uid = (uidOverride ?? cfg.uid).trim();
  if (!uid) throw new Error('UpSPA uid is empty.');
  return uid;
}
function validateSetupInput(input: {
  uid: string;
  password: string;
  threshold: number;
  sps: SpConfig[];
}): void {
  if (!input.uid.trim()) throw new Error('UID is empty.');
  if (!input.password) throw new Error('Password is empty.');
  if (!input.sps || input.sps.length === 0) throw new Error('No Storage Providers configured.');
  if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > input.sps.length) {
    throw new Error('Invalid threshold.');
  }
}
export async function makeUpspaClient(uidOverride?: string): Promise<UpspaClient> {
  const cfg = requireConfig(await getConfig());
  const client = new UpspaClient({
    uid: resolveClientUid(cfg, uidOverride),
    threshold: cfg.threshold,
    sps: cfg.sps,
  });
  await client.init();
  return client;
}
export async function saveDemoConfig(input: {
  uid: string;
  threshold: number;
  sps: SpConfig[];
}): Promise<void> {
  if (!input.uid.trim()) throw new Error('UID is empty.');
  if (!input.sps || input.sps.length === 0) throw new Error('No Storage Providers configured.');
  if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > input.sps.length) {
    throw new Error('Invalid threshold.');
  }
  await setConfig({
    enabled: true,
    uid: input.uid.trim(),
    threshold: input.threshold,
    sps: input.sps,
  });
}
export async function setupAndProvision(input: {
  uid: string;
  password: string;
  threshold: number;
  sps: SpConfig[];
}): Promise<void> {
  validateSetupInput(input);
  const uid = input.uid.trim();
  await saveDemoConfig({
    uid,
    threshold: input.threshold,
    sps: input.sps,
  });
  const client = new UpspaClient({
    uid,
    threshold: input.threshold,
    sps: input.sps,
  });
  await client.init();
  await client.setupAndProvision(input.password, input.threshold);
}
export async function registerForSite(lsj: string, password: string, uid?: string): Promise<string> {
  const client = await makeUpspaClient(uid);
  const out = await client.register(lsj, password);
  return out.to_ls.vinfo;
}
export async function prepareRegistrationForSite(
  lsj: string,
  password: string,
  uid?: string,
): Promise<PreparedRegistration> {
  const client = await makeUpspaClient(uid);
  const out = await client.prepareRegistration(lsj, password);

  return {
    uid: client.uid,
    passwordForLs: out.to_ls.vinfo,
    records: out.per_sp,
  };
}

export async function commitRegistrationForSite(
  prepared: Pick<PreparedRegistration, 'uid' | 'records'>,
): Promise<void> {
  const client = await makeUpspaClient(prepared.uid);
  await client.applyRegistrationToSPs(prepared.records);
}
export async function authenticateForSite(lsj: string, password: string, uid?: string): Promise<string> {
  const client = await makeUpspaClient(uid);
  const out = await client.authenticate(lsj, password);
  return out.vinfo_prime;
}
export async function prepareSecretUpdateForSite(
  lsj: string,
  masterPassword: string,
  uid?: string,
): Promise<PreparedSecretUpdate> {
  if (!masterPassword) throw new Error('Master password is empty.');
  const client = await makeUpspaClient(uid);
  const out = await client.secretUpdate(lsj, masterPassword);
  return {
    uid: client.uid,
    oldForLs: out.vinfo_prime,
    newForLs: out.vinfo_new,
    cjNew: out.cj_new,
    suids: out.suids,
  };
}

export async function commitSecretUpdateForSite(
  prepared: Pick<PreparedSecretUpdate, 'uid' | 'cjNew' | 'suids'>,
): Promise<void> {
  const client = await makeUpspaClient(prepared.uid);
  await client.applySecretUpdateToSPs(prepared.suids, prepared.cjNew);
}
export async function secretUpdateForSite(
  lsj: string,
  oldPassword: string,
  uid?: string,
): Promise<{ oldForLs: string; newForLs: string }> {
  const prepared = await prepareSecretUpdateForSite(lsj, oldPassword, uid);
  return {
    oldForLs: prepared.oldForLs,
    newForLs: prepared.newForLs,
  };
}
export async function passwordUpdateDirect(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  if (!oldPassword) throw new Error('Old password is empty.');
  if (!newPassword) throw new Error('New password is empty.');
  const client = await makeUpspaClient();
  const timestamp = Math.floor(Date.now() / 1000);
  await client.passwordUpdate(oldPassword, newPassword, timestamp);
}
