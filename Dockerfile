FROM node:22-alpine

RUN corepack enable

WORKDIR /app

# Layer caching : copier d'abord les manifests, installer, puis
# seulement copier le reste du code source.
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json

RUN pnpm install --no-frozen-lockfile

COPY packages/core ./packages/core
COPY apps/dashboard ./apps/dashboard

RUN pnpm --filter @trajekt/core build

# DATABASE_URL factice pour le build uniquement : next build ne se
# connecte pas à la base, mais src/db/index.ts lève une erreur si la
# variable est totalement absente au chargement du module. La vraie
# valeur est injectée à l'exécution par docker-compose.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
RUN pnpm --filter dashboard build

WORKDIR /app/apps/dashboard
EXPOSE 3000
CMD ["pnpm", "start"]

# Choix assumé : pas de multi-stage avec node_modules minimal ou
# next output:standalone. L'image est plus grosse que nécessaire,
# mais reste simple à déboguer pour un side project qui démarre.
# À optimiser plus tard si la taille de l'image devient un vrai souci.
