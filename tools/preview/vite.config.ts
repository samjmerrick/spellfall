// Test-build config: the normal build, with every asset inlined, relative paths and its own output folder,
// so the whole app is a handful of files that can be published as a claude.ai artifact.
import { mergeConfig } from 'vite';
import base from '../../vite.config';

export default mergeConfig(base, {
  base: './',
  // No PocketBase origin in an artifact: cloud sync is compiled out.
  define: { __CLOUD_SYNC__: false },
  build: { assetsInlineLimit: 1e9, outDir: 'dist-preview', emptyOutDir: true },
});
