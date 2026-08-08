import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const API_TARGET = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(
      process.env.GOOGLE_MAPS_PLATFORM_KEY || ''
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Consumed as TypeScript source out of the workspace, so there is no
      // build step between editing shared domain code and seeing it here.
      '@freshfold/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@freshfold/core'],
  },
  server: {
    port: 3000,
    // Everything under /api belongs to the dispatch server, which the rider
    // app also talks to. Proxying keeps the browser on one origin in dev.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
    // HMR is disabled in AI Studio via the DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
