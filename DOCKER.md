# Lancer Trajekt avec Docker

```bash
cp .env.example .env   # au minimum : DASHBOARD_PASSWORD et DASHBOARD_SESSION_SECRET
docker compose up -d --build
```

Deux services, pas plus : Postgres et le dashboard. Les migrations sont
appliquées au démarrage du conteneur.

Le dashboard est sur http://localhost:3000, et l'ingestion OTLP/HTTP
écoute sur le même port (`POST /v1/traces`).

## Premier projet

```bash
docker compose exec dashboard pnpm create-project my-project   # affiche la clé API une seule fois
docker compose exec dashboard pnpm seed                        # optionnel : 2 semaines de données de démo
```

## Envoyer des traces

N'importe quel exporter OpenTelemetry, en JSON :

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."
```

Ou un export Langfuse / un résultat Vercel AI SDK posté tel quel :

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Authorization: Bearer tk_live_..." \
  -H "Content-Type: application/json" \
  -H "X-Trajekt-Agent: my-agent" \
  --data @trace.json
```

## Détection de régression

Lancer le check périodiquement (toutes les heures, par exemple) :

```bash
# depuis l'hôte
curl -X POST http://localhost:3000/api/alerts/check -H "Authorization: Bearer $CRON_SECRET"
# ou dans le conteneur
docker compose exec dashboard pnpm check-regressions
```

Avec `SLACK_WEBHOOK_URL` renseigné, chaque nouvelle régression est
postée sur Slack (une seule fois par agent et par métrique sur 24 h).

## Arrêter / repartir de zéro

```bash
docker compose down          # garde les données (volume)
docker compose down -v       # supprime aussi le volume
```

## Pas encore fait

Pas de reverse proxy ni de TLS : ce setup vise le dev local ou un
réseau interne, pas une exposition directe du port 3000 sur internet.
