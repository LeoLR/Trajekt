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
  build: {
    rollupOptions: {
      // Quatre pages : landing et documentation, en anglais et en français (/fr/).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        docs: fileURLToPath(new URL('./docs/index.html', import.meta.url)),
        fr: fileURLToPath(new URL('./fr/index.html', import.meta.url)),
        frDocs: fileURLToPath(new URL('./fr/docs/index.html', import.meta.url)),
      },
    },
  },
});
