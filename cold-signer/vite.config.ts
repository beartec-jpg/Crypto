import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: '/cold-signer/',
  plugins: [
    wasm(),
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true } }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192x192.png', 'icons/icon-512x512.png'],
      manifest: {
        name: 'BearTec Cold Signer',
        short_name: 'Cold Signer',
        description: 'Air-gapped transaction signing for BearTec Crypto',
        theme_color: '#10b981',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/cold-signer/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [],
        navigateFallback: null,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 3001,
    open: true,
  },
});
