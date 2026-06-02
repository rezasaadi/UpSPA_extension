export type SpConfig = {
  id: number;
  baseUrl: string;
};
export type UpspaConfig = {
  enabled: boolean;
  uid: string;
  threshold: number;
  sps: SpConfig[];
};
const STORAGE_KEY = 'upspa_config';
const DEFAULT_CONFIG: UpspaConfig = {
  enabled: false,
  uid: '',
  threshold: 1,
  sps: [],
};
export async function getConfig(): Promise<UpspaConfig> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return {
    ...DEFAULT_CONFIG,
    ...(out[STORAGE_KEY] ?? {}),
  };
}
export async function setConfig(cfg: UpspaConfig): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: cfg,
  });
}
