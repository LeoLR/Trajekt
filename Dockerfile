FROM node:22-alpine

RUN corepack enable

WORKDIR /app

# Layer caching : manifests d'abord, installation, puis le code.
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json

RUN pnpm install --no-frozen-lockfile

COPY packages/core ./packages/core
COPY apps/dashboard ./apps/dashboard

RUN pnpm --filter @trajekt-ai/core build
RUN pnpm --filter dashboard build

WORKDIR /app/apps/dashboard
EXPOSE 3000

# Les migrations sont idempotentes : appliquées à chaque démarrage.
CMD ["sh", "-c", "pnpm migrate && pnpm start"]

# Choix assumé : pas de multi-stage ni d'output standalone. Image plus
# grosse que nécessaire, mais simple à déboguer. À optimiser plus tard.
