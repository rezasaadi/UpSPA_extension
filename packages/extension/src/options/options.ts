import { getConfig } from '../shared/config';
import type { SpConfig } from '../shared/config';
import { passwordUpdateDirect, saveDemoConfig, setupAndProvision } from '../shared/upspaActions';

const uidEl = document.getElementById('uid') as HTMLInputElement;
const passwordEl = document.getElementById('password') as HTMLInputElement;
const thresholdEl = document.getElementById('threshold') as HTMLInputElement;
const spsEl = document.getElementById('sps') as HTMLTextAreaElement;
const statusEl = document.getElementById('status') as HTMLPreElement;
const oldPasswordEl = document.getElementById('oldPassword') as HTMLInputElement;
const newPasswordEl = document.getElementById('newPassword') as HTMLInputElement;
const newPasswordConfirmEl = document.getElementById('newPasswordConfirm') as HTMLInputElement;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function parseSps(): SpConfig[] {
  return spsEl.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [idRaw, baseUrlRaw] = line.split(',').map((x) => x.trim());
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id < 1) {
        throw new Error(`Invalid SP id in line: ${line}`);
      }
      if (!baseUrlRaw?.startsWith('http')) {
        throw new Error(`Invalid SP URL in line: ${line}`);
      }
      return {
        id,
        baseUrl: baseUrlRaw.replace(/\/+$/, ''),
      };
    });
}

function readInput(): { uid: string; password: string; threshold: number; sps: SpConfig[] } {
  const uid = uidEl.value.trim();
  const password = passwordEl.value;
  const threshold = Number(thresholdEl.value);
  const sps = parseSps();

  if (!uid) throw new Error('UID is empty.');
  if (!password) throw new Error('Password is empty.');
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > sps.length) {
    throw new Error('Threshold must be between 1 and number of SPs.');
  }

  return { uid, password, threshold, sps };
}

async function loadExisting(): Promise<void> {
  const cfg = await getConfig();
  uidEl.value = cfg.uid || 'test-user';
  thresholdEl.value = String(cfg.threshold || 1);
  if (cfg.sps?.length) {
    spsEl.value = cfg.sps.map((sp) => `${sp.id},${sp.baseUrl}`).join('\n');
  }
}

document.getElementById('save')?.addEventListener('click', async () => {
  try {
    const input = readInput();
    await saveDemoConfig({
      uid: input.uid,
      threshold: input.threshold,
      sps: input.sps,
    });
    setStatus('Config saved.');
  } catch (e) {
    setStatus(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
});

document.getElementById('setup')?.addEventListener('click', async () => {
  try {
    const input = readInput();
    setStatus('Running setup/provision...');
    await setupAndProvision(input);
    setStatus('Setup/provision completed successfully.');
  } catch (e) {
    setStatus(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
});

document.getElementById('passwordUpdate')?.addEventListener('click', async () => {
  try {
    const oldPassword = oldPasswordEl.value;
    const newPassword = newPasswordEl.value;
    const confirm = newPasswordConfirmEl.value;

    if (!oldPassword) throw new Error('Old master password is empty.');
    if (!newPassword) throw new Error('New master password is empty.');
    if (newPassword !== confirm) throw new Error('New master password fields do not match.');

    setStatus('Running master password update...');
    await passwordUpdateDirect(oldPassword, newPassword);

    oldPasswordEl.value = '';
    newPasswordEl.value = '';
    newPasswordConfirmEl.value = '';
    passwordEl.value = '';
    setStatus('Master password update completed successfully.');
  } catch (e) {
    setStatus(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
});

loadExisting().catch((e) => {
  setStatus(`ERROR loading config: ${e instanceof Error ? e.message : String(e)}`);
});
