/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base path for `pnpm build` (default `/`). The host is apps.samjmerrick.com/spellfall/ (built with
// `--base=/spellfall/` by ~/apps/bin/deploy).
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    // Card art stays as separate hashed files (cached by the service worker), never inlined into the JS.
    assetsInlineLimit: (file, content) =>
      file.includes('/src/content/art/') ? false : content.length < 4096,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
      manifest: {
        name: 'Spellfall',
        short_name: 'Spellfall',
        description: 'A portrait-mode, three-lane card battler.',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        // start_url and scope are left to vite-plugin-pwa: it uses the resolved base, including `--base=/spellfall/`
        // from the command line, which `process.env.VITE_BASE` above would not see.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/sim/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/save/**', 'src/run/**'],
      exclude: ['src/save/index.ts'],
      thresholds: { statements: 90, lines: 90, functions: 90, branches: 90 },
    },
  },
});
