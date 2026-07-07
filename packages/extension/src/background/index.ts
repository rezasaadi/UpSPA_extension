import { getConfig, setConfig } from '../shared/config';
import type { BgRequest, BgResponse } from '../shared/messages';
type UpspaClientCtor = typeof import('upspa-js').UpspaClient;
async function loadUpspaClientCtor(): Promise<UpspaClientCtor> {
  const mod = await import('upspa-js');
  return mod.UpspaClient;
}
async function getClient() {
  const cfg = await getConfig();
  if (!cfg.enabled) throw new Error('UpSPA is disabled in options.');
  if (!cfg.uid) throw new Error('UpSPA not configured: uid is empty.');
  if (!cfg.sps?.length) throw new Error('UpSPA not configured: no SPs set.');
  if (cfg.threshold < 1 || cfg.threshold > cfg.sps.length) {
    throw new Error('UpSPA config invalid: threshold out of range.');
  }
  const UpspaClient = await loadUpspaClientCtor();
  const client = new UpspaClient({
    uid: cfg.uid,
    threshold: cfg.threshold,
    sps: cfg.sps,
  });
  await client.init();
  return { cfg, client };
}
function normalizeTimestamp(ts: number | bigint): number {
  return Number(ts);
}
chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse) => {
  (async (): Promise<BgResponse> => {
    try {
      switch (msg.type) {
        case 'UPSRA_GET_CONFIG': {
          const cfg = await getConfig();
          return { ok: true, cfg };
        }
        case 'UPSRA_SET_CONFIG': {
          await setConfig(msg.cfg);
          return { ok: true };
        }
        case 'UPSRA_SETUP_AND_PROVISION': {
          if (!msg.uid) throw new Error('uid is empty.');
          if (!msg.password) throw new Error('password is empty.');
          if (!msg.sps?.length) throw new Error('no SPs provided.');
          if (msg.threshold < 1 || msg.threshold > msg.sps.length) {
            throw new Error('threshold out of range.');
          }
          const cfg = {
            enabled: true,
            uid: msg.uid.trim(),
            threshold: msg.threshold,
            sps: msg.sps,
          };
          await setConfig(cfg);
          const UpspaClient = await loadUpspaClientCtor();
          const client = new UpspaClient({
            uid: cfg.uid,
            threshold: cfg.threshold,
            sps: cfg.sps,
          });
          await client.init();
          await client.setupAndProvision(msg.password, cfg.threshold);
          return { ok: true };
        }
        case 'UPSRA_REGISTER': {
          const { client } = await getClient();
          const out = await client.register(msg.lsj, msg.password);
          return {
            ok: true,
            vinfo_b64: out.to_ls.vinfo,
          };
        }
        case 'UPSRA_AUTH': {
          const { client } = await getClient();
          const out = await client.authenticate(msg.lsj, msg.password);
          return {
            ok: true,
            vinfo_prime_b64: out.vinfo_prime,
          };
        }
        case 'UPSRA_SECRET_UPDATE_PREP': {
          const { client } = await getClient();
          const out = await client.secretUpdate(msg.lsj, msg.password);
          return {
            ok: true,
            secret_update: {
              vinfo_prime_b64: out.vinfo_prime,
              vinfo_new_b64: out.vinfo_new,
              cj_new: out.cj_new,
              suids: out.suids,
              old_ctr: out.old_ctr,
              new_ctr: out.new_ctr,
            },
          };
        }
        case 'UPSRA_SECRET_UPDATE_COMMIT': {
          const { client } = await getClient();
          await client.applySecretUpdateToSPs(msg.suids, msg.cj_new);
          return { ok: true };
        }
        case 'UPSRA_PASSWORD_UPDATE': {
          const { client } = await getClient();
          const out = await client.passwordUpdate(
            msg.old_password,
            msg.new_password,
            normalizeTimestamp(msg.timestamp),
          );
          return {
            ok: true,
            password_update: {
              cid_new: out.cid_new,
            },
          };
        }
        default:
          return {
            ok: false,
            error: `Unknown message: ${(msg as any).type}`,
          };
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  })()
    .then(sendResponse)
    .catch((e) => {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  return true;
});
