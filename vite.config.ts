import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    // Bundle analysis visualization
    visualizer({
      filename: './client/dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }) as any,
  ],

  // This tells Vite where your React app lives
  root: 'client',

  // Important for Vercel – makes sure assets load correctly
  base: '/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },

  build: {
    outDir: '../client/dist',   // ← Critical: goes one level UP from client/ → root/client/dist
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2015',
    // Asset inline threshold - inline assets < 4KB as base64
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom', 'react/jsx-runtime'],
          // Router
          'router': ['wouter'],
          // UI libraries
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-dropdown-menu',
          ],
          // D3 - separate chunk loaded only when needed
          'd3-vendor': ['d3'],
          // Query & Form handling
          'query-vendor': ['@tanstack/react-query', 'react-hook-form'],
          // Icons
          'icons': ['lucide-react'],
        },
        // Clean chunk file names for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
  },

  server: {
    port: 3000,
    host: true, // allows access from local network if needed
  },
})
