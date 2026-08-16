import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Config is a function so it can read `.env` itself.
 *
 * Vite only ever puts `VITE_`-prefixed variables on `import.meta.env`; it does
 * not populate `process.env` from a `.env` file at all. This config reads
 * `API_URL`, `GOOGLE_MAPS_PLATFORM_KEY` and `DISABLE_HMR`, and reading them
 * off `process.env` meant they only worked when exported in the shell —
 * silently doing nothing when set in `apps/web/.env`, which is exactly where
 * `.env.example` tells you to put them. `loadEnv` with an empty prefix reads
 * the file the way the template promises.
 *
 * The shell still wins, which is what a deployment or CI expects.
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, __dirname, ''), ...process.env };
  const apiTarget = env.API_URL || 'http://localhost:4000';
  const disableHmr = env.DISABLE_HMR === 'true';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      // A Maps JavaScript key is public by nature — it ships in the bundle and
      // is protected by an HTTP referrer restriction, not by secrecy. Nothing
      // else from the environment is injected here.
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(
        env.GOOGLE_MAPS_PLATFORM_KEY || ''
      ),
      // Not a secret at all — a Map ID is a public style handle — but it
      // travels with the key, so it gets the same two spellings.
      'process.env.GOOGLE_MAPS_MAP_ID': JSON.stringify(env.GOOGLE_MAPS_MAP_ID || ''),
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
          target: apiTarget,
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via the DISABLE_HMR env var.
      hmr: !disableHmr,
      watch: disableHmr ? null : {},
    },
  };
});
