import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for React component testing
    environment: 'jsdom',
    
    // Setup file for global test configuration
    setupFiles: [path.resolve(__dirname, 'client/src/__tests__/setup.ts')],
    
    // Enable global test APIs (describe, it, expect, etc.)
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      // Coverage thresholds
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
      // Include patterns
      include: ['client/src/**/*.{ts,tsx}'],
      // Exclude patterns
      exclude: [
        'client/src/**/*.test.{ts,tsx}',
        'client/src/**/__tests__/**',
        'client/src/vite-env.d.ts',
        'client/src/main.tsx',
      ],
    },
    
    // Test file patterns
    include: ['client/src/**/*.{test,spec}.{ts,tsx}'],
    
    // Exclude patterns
    exclude: ['node_modules', 'dist', 'client/dist', '.git'],
    
    // Test timeout
    testTimeout: 10000,
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
})
