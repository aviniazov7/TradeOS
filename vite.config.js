import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";
import { readFileSync } from 'node:fs';

// Build stamp shown next to the marketing version in the profile footer:
// the service-worker cache number (auto-bumped on every production release)
// and the build date, so users can tell which release they run.
const swBuild = (() => {
  try { return readFileSync('public/sw.js', 'utf8').match(/tradeos-v(\d+)/)?.[1] || ''; } catch { return ''; }
})();

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  define: {
    __APP_BUILD__: JSON.stringify(swBuild),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
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