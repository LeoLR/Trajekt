# Lancer trajekt avec Docker

Une alternative au setup manuel du README principal — utile si tu ne
veux pas installer Postgres ni pnpm en local pour juste tester.

## Setup

```bash
cp .env.example .env
# Remplir DASHBOARD_SESSION_SECRET avec une chaîne aléatoire longue

docker compose up --build
```

Ça lance deux services, pas plus : Postgres et le dashboard. C'est
volontairement minimal — voir la note dans `docker-compose.yml`.

## Migrations et création du projet

Les migrations sont générées en local (elles doivent être commitées),
mais appliquées dans le conteneur :

```bash
# En local, une seule fois (ou à chaque changement de schema.ts) :
cd apps/dashboard && pnpm db:generate && cd ../..

# Contre la base du conteneur :
docker compose run --rm dashboard pnpm db:migrate

# Créer le premier projet et récupérer la clé API :
docker compose run --rm dashboard pnpm create-project "sentry-jira-agent"
```

## Tester

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Authorization: Bearer tk_live_XXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{ "resourceSpans": [{ "scopeSpans": [{ "spans": [{
        "traceId": "test-001", "name": "chat",
        "startTimeUnixNano": "1752480000000000000",
        "endTimeUnixNano": "1752480002000000000",
        "attributes": [{ "key": "gen_ai.request.model", "value": { "stringValue": "claude-sonnet-4-6" } }]
      }] }] }] }'
```

## Arrêter / repartir de zéro

```bash
docker compose down          # garde les données Postgres (volume)
docker compose down -v       # supprime aussi le volume — base vide au prochain up
```

## Pas encore fait

Pas de `docker-compose.prod.yml` séparé, pas de reverse proxy/TLS —
ce setup est pensé pour du dev local ou une validation rapide, pas pour
exposer directement le port 3000 sur internet.
