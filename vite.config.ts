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
    process.env.VITE_ANALYZE === 'true' && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ].filter(Boolean),

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
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Optional: makes chunk names cleaner in production
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        manualChunks: {
          'vendor-d3': ['d3'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover'],
          'vendor-react-query': ['@tanstack/react-query'],
          'vendor-clerk': ['@clerk/clerk-react'],
          'vendor-charts': ['recharts', 'lightweight-charts'],
        }
      },
    },
  },

  server: {
    port: 3000,
    host: true, // allows access from local network if needed
  },
})
