import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  test: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./worker/cloudflareWorkersStub.js', import.meta.url)),
    },
  },
  build: {
    // Login's HTML must not preload chunks the logged-out page never runs.
    // Lazy routes still fetch them when the user leaves /login.
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !/\/(motion|firestore|charts|datepicker|html-to-image)-/.test(dep));
      },
    },
    rollupOptions: {
      output: {
        // Lucide icons were each their own script (dozens of requests). Fold
        // anything under ~10KB into the chunk that imports it.
        experimentalMinChunkSize: 10000,
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Firestore before the rest of Firebase, so the auth chunk the
          // login page loads does not pull the database SDK with it.
          if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) return 'firestore';
          if (id.includes('firebase/') || id.includes('@firebase/')) return 'firebase-auth';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('react-datepicker')) return 'datepicker';
          if (id.includes('html-to-image') || id.includes('html2canvas')) return 'html-to-image';
          if (id.includes('react-dom') || id.includes('react-router') || /\/react\//.test(id)) return 'vendor';
          // framer-motion is intentionally not named. A dedicated chunk was
          // modulepreloaded from the login document.
        },
      },
    },
  },
})