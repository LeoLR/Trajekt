import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // @trajekt/core est lu depuis ses sources : pas besoin de le compiler
  // avant de lancer le site, et le bundle n'embarque que ce qui sert.
  resolve: {
    alias: { '@trajekt/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) },
  },
  // Les visuels du README (banner.png, trajectory-replay.png) sont servis
  // tels quels par le site : une seule source pour les deux.
  publicDir: '../../docs/assets',
  server: { port: 5173 },
});
