import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: ['3a7e428027c837.lhr.life'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      // Keep the heavy scanner runtime address stable so cached upload pages remain compatible after deploys.
      output: {
        chunkFileNames: (chunk) => chunk.name === 'opencv' ? 'assets/opencv.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
