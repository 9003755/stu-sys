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
      output: {
        chunkFileNames: (chunk) => chunk.name === 'AdminDashboard'
          ? 'assets/admin-dashboard.js'
          : 'assets/[name]-[hash].js',
      },
    },
  },
})
