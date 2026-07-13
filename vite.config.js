import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // 1. นำเข้า Plugin

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), nodePolyfills({
    protocolImports: true,
  }), cloudflare()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // simple-peer TDZ isolation (see commit history for details)
          if (id.includes('simple-peer') || id.includes('readable-stream') || id.includes('bl.js') || id.includes('inherits') || id.includes('randombytes') || id.includes('get-browser-rtc') || id.includes('queue-microtask')) {
            return 'simple-peer-vendor';
          }
          // recharts is only used in 3 pages — split it out of the main bundle
          if (id.includes('recharts') || id.includes('victory-vendor') || id.includes('d3-')) {
            return 'recharts-vendor';
          }
        },
      },
    },
  },
});