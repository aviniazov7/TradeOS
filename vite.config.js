import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // A duplicate JSX attribute is a silent bug, not a style nit: the LAST one
  // wins and the earlier value vanishes. Three components shipped with a
  // second `style` prop that discarded the header-offset one above it, so the
  // top of every page rendered underneath the fixed header. esbuild warned on
  // every single build; a warning in a wall of build output is not a signal.
  // eslint-plugin-react's jsx-no-duplicate-props would also catch it, but this
  // needs no new dependency and fails the build rather than logging.
  esbuild: { logOverride: { 'duplicate-object-key': 'error' } },
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