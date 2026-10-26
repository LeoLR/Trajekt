import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @trajekt-ai/core est un package du workspace : Next le transpile.
  transpilePackages: ['@trajekt-ai/core'],
  // Monorepo : le traçage des fichiers doit partir de la racine du dépôt,
  // sinon le package du workspace manque dans les fonctions déployées.
  outputFileTracingRoot: root,
  eslint: { ignoreDuringBuilds: true },
  // Le mode démo doit être connu aussi des composants client.
  env: { NEXT_PUBLIC_TRAJEKT_DEMO: process.env.TRAJEKT_DEMO ?? '' },
};

export default nextConfig;
