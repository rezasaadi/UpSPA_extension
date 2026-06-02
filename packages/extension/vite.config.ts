import { defineConfig, type PluginOption } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './src/manifest';
const configDir = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [crx({ manifest })] as unknown as PluginOption[],
  resolve: {
    alias: {
      'upspa-js': resolve(configDir, '../upspa-js/dist/index.js'),
    },
  },
  build: {
    sourcemap: true,
    target: 'es2020',
  },
});
