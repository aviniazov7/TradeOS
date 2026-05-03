import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          datepicker: ['react-datepicker'],
          'html-to-image': ['html-to-image'],
          'date-fns': ['date-fns'],
        },
      },
    },
  },
})