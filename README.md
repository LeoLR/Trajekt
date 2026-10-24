# trajekt

Monorepo pnpm.

```
packages/
  core/        @trajekt/core — normalize(), Trajectory, TraceProvider/AgentAdapter
apps/
  dashboard/   Next.js — ingestion API (POST /v1/traces) + lecture (GET /api/*)
               phase 1 : API seule. Le dashboard visuel arrive en phase 2.
```

## Setup

```bash
pnpm install

# @trajekt/core doit être compilé AVANT dashboard : dashboard consomme
# dist/index.js, pas les sources TS directement.
pnpm --filter @trajekt/core build

cd apps/dashboard
cp .env.example .env   # remplir DATABASE_URL + DASHBOARD_SESSION_SECRET
pnpm db:generate && pnpm db:migrate
pnpm create-project "sentry-jira-agent"
pnpm dev
```

Détail des endpoints et exemples curl : `apps/dashboard/README.md`.
Contrat d'API complet (formes de réponse, codes d'erreur) : `api-contract.md`.
Plan d'archi : `architecture-v2-dashboard-first.md`.

Pas envie d'installer Postgres/pnpm en local pour tester ? Voir `DOCKER.md`.

## État actuel

- ✅ `@trajekt/core` — normalize/normalizeAll, 4 formats, testé (voir smoke tests)
- ✅ Ingestion (`POST /v1/traces`) — auth par clé projet, gère le multi-trace OTLP
- ✅ Lecture (`GET /api/trajectories`, `/:id`, `/api/stats`) — pagination curseur, scoping par projet
- ⬜ Dashboard visuel (phase 2) — brancher le composant visualiseur déjà construit sur `GET /api/trajectories/:id`
- ⬜ Vraie auth multi-utilisateur (phase 1 = un seul compte, cookie statique)
- ⬜ `assert` / CI companion (phase 4)
