/** @type {import('next').NextConfig} */
const nextConfig = {
  // @trajekt/core est un package du workspace, pas publié sur npm —
  // Next.js doit le transpiler comme du code source, pas le traiter
  // comme une dépendance externe précompilée.
  transpilePackages: ['@trajekt/core'],
};

export default nextConfig;
