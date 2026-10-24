# trajekt / dashboard (phase 1 — API seule)

Ingestion + stockage + lecture, conformes à `api-contract.md`. Le
dashboard visuel (liste des runs + le visualiseur) arrive en phase 2 —
pour l'instant `/` est un simple placeholder.

## Setup

```bash
# Depuis la racine du monorepo
pnpm install

cp apps/dashboard/.env.example apps/dashboard/.env
# Remplir DATABASE_URL (Neon, ou docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16)
# Remplir DASHBOARD_SESSION_SECRET avec une chaîne aléatoire longue

cd apps/dashboard
pnpm db:generate   # génère la migration SQL depuis src/db/schema.ts
pnpm db:migrate    # l'applique sur DATABASE_URL

pnpm create-project "sentry-jira-agent"
# → affiche une clé tk_live_... à copier, elle ne sera plus montrée
```

## Lancer

```bash
pnpm dev   # http://localhost:3000
```

## Tester l'ingestion (sans agent, juste curl)

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Authorization: Bearer tk_live_XXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "scopeSpans": [{
        "spans": [{
          "traceId": "test-001",
          "name": "chat",
          "startTimeUnixNano": "1752480000000000000",
          "endTimeUnixNano": "1752480002000000000",
          "attributes": [
            { "key": "gen_ai.request.model", "value": { "stringValue": "claude-sonnet-4-6" } },
            { "key": "gen_ai.usage.input_tokens", "value": { "intValue": 120 } }
          ]
        }]
      }]
    }]
  }'
```

Réponse attendue : `201`, `{ "trajectories": [{ "id": "...", "sourceFormat": "otlp", ... }] }`.

## Tester la lecture (nécessite le cookie de session)

Phase 1 n'a pas de vrai login — pose le cookie à la main pour tester :

```bash
curl http://localhost:3000/api/trajectories \
  -H "Cookie: trajekt_session=<valeur de DASHBOARD_SESSION_SECRET>"

curl http://localhost:3000/api/stats?range=7d \
  -H "Cookie: trajekt_session=<valeur de DASHBOARD_SESSION_SECRET>"
```

## Brancher un vrai agent dessus

Reprendre `otel-setup.ts` (déjà écrit pour la validation sans service
tiers) et changer uniquement l'exporter :

```typescript
new OTLPTraceExporter({
  url: 'https://<ton-domaine>/v1/traces',      // au lieu du collector local
  headers: { Authorization: 'Bearer tk_live_XXXXXXXX' },
})
```

Le reste (les helpers `withLlmSpan` / `withToolSpan`, les attributs
`gen_ai.*`) ne change pas — c'est tout l'intérêt d'avoir instrumenté en
OTel standard dès le départ.

## Ce qui manque volontairement (voir architecture-v2)

Rate limiting, rétention automatique, vraie auth multi-utilisateur,
webhooks sortants — tous repoussés tant qu'un vrai besoin ne s'est pas
manifesté. Ne pas les ajouter par anticipation.
