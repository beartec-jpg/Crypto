import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  pluginsOLER: [react()],

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
    rollupOptions: {
      output: {
        // Optional: makes chunk names cleaner in production
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
  },

  server: {
    port: 3000,
    host: true, // allows access from local network if needed
  },
})
