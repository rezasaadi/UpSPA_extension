import { getConfig } from '../shared/config';
async function main() {
  const siteEl = document.getElementById('site')!;
  const statusEl = document.getElementById('status')!;
  const errEl = document.getElementById('error')!;
  const screenshotEl = document.getElementById('screenshot') as HTMLImageElement;
  const btn = document.getElementById('openOptions')! as HTMLButtonElement;
  btn.onclick = () => chrome.runtime.openOptionsPage();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url ? new URL(tab.url).origin : '(no active tab)';
  siteEl.textContent = `Site: ${origin}`;
  if (tab?.windowId !== undefined) {
    try {
      screenshotEl.src = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
      });
    } catch (e) {
      screenshotEl.style.display = 'none';
      errEl.textContent = `Screenshot unavailable: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    screenshotEl.style.display = 'none';
  }
  const cfg = await getConfig();
  if (!cfg?.uid) {
    statusEl.innerHTML = `<div><b>Not configured.</b></div><div class="small">Open Options and run Setup.</div>`;
    return;
  }
  statusEl.innerHTML = `
    <div><b>${cfg.enabled ? 'Enabled' : 'Disabled'}</b></div>
    <div class="small">uid: <code>${cfg.uid}</code></div>
    <div class="small">SPs: ${cfg.sps?.length ?? 0}, threshold: ${cfg.threshold}</div>
    <div class="small">Tip: type your master password into site forms; the extension replaces it with vInfo automatically.</div>
  `;
}
main().catch((e) => {
  const errEl = document.getElementById('error');
  if (errEl) errEl.textContent = String(e);
});
