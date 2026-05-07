import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: '/qbtc-wallet/',
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({ include: ['buffer', 'crypto', 'stream'], globals: { Buffer: true } }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192x192.png', 'icons/icon-512x512.png'],
      manifest: {
        name: 'qBTC Wallet',
        short_name: 'qBTC',
        description: 'Lightweight quantum-resistant qBTC wallet with messenger',
        theme_color: '#0891b2',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/qbtc-wallet/',
        scope: '/qbtc-wallet/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        runtimeCaching: [],
        navigateFallback: null,
      },
      devOptions: { enabled: true },
    }),
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          crypto: ['@noble/curves', '@noble/hashes', '@noble/post-quantum', 'bitcoinjs-lib'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  optimizeDeps: {
    exclude: ['tiny-secp256k1'],
  },
});
