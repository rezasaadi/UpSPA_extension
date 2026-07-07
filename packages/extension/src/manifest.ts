import type { ManifestV3Export } from '@crxjs/vite-plugin';
const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'UpSPA (Project Skeleton)',
  version: '0.1.0',
  description: 'UpSPA browser extension skeleton: mediates between user, Storage Providers, and Login Servers.',
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  action: {
    default_title: 'UpSPA',
    default_popup: 'src/popup/popup.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
    },
  ],
  options_page: 'src/options/options.html',
  web_accessible_resources: [
    {
      matches: ['<all_urls>'],
      resources: ['assets/*'],
    },
  ],
};
export default manifest;
