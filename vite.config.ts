import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig({
  plugins: [react()],
  
  // 1. Point to where index.html actually lives
  root: 'client',
  
  base: '/',
  
  build: {
    // 2. Output the built files to a folder named 'dist' in the main project root
    // This allows Vercel to find it easily.
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false
  },
  
  // 3. This is the "Magic Fix" for imports
  // It ensures Vercel understands that "@" refers to "client/src"
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
    },
  },

  server: {
    port: 3000
  }
})
