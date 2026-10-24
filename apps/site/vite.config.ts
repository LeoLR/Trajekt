import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Les visuels du README (banner.png, trajectory-replay.png) sont servis
  // tels quels par le site : une seule source pour les deux.
  publicDir: '../../docs/assets',
  server: { port: 5173 },
});
