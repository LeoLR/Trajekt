# Trajekt — Contrat d'API

Base URL (dev / Docker) : `http://localhost:3000`

| Endpoints | Auth | Qui appelle |
|---|---|---|
| `POST /v1/traces` | Clé API de projet (`Authorization: Bearer tk_live_...`) | Exporter OTel, script, CI |
| `GET /api/*` | Cookie de session (connexion par `DASHBOARD_PASSWORD`) | Le dashboard, navigateur |
| `POST /api/alerts/check` | `Authorization: Bearer $CRON_SECRET` | Un cron |
| `POST /api/session`, `DELETE /api/session` | — | Connexion / déconnexion |

## Erreurs

Toujours la même forme : `{ "error": { "code": string, "message": string } }`.

| Code | Statut | Sens |
|---|---|---|
| `UNAUTHORIZED` | 401 | Clé, session ou secret absent/invalide |
| `VALIDATION_ERROR` | 400 | JSON invalide, paramètre hors bornes |
| `UNKNOWN_FORMAT` | 422 | JSON valide mais aucun format reconnu |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | OTLP protobuf (seul le JSON est accepté) |
| `NOT_FOUND` | 404 | Ressource inexistante ou hors projet |
| `NOT_CONFIGURED` | 503 | Variable d'environnement manquante, aucun projet |
| `INTERNAL_ERROR` | 500 | Bug serveur |

---

## `POST /v1/traces` — ingestion

Corps : OTLP/JSON (`resourceSpans`), export de trace Langfuse, résultat
`generateText` du Vercel AI SDK, ou `Trajectory` native. `Content-Encoding: gzip` accepté.

En-têtes optionnels, utilisés **seulement si la trace n'en porte pas** :
`X-Trajekt-Agent`, `X-Trajekt-Agent-Version`, `X-Trajekt-Prompt-Version`, `X-Trajekt-Environment`.

**Fusion.** Un payload OTLP peut contenir plusieurs traces (une trajectoire
par `traceId`), et une trace peut arriver en plusieurs envois : chaque envoi
qui porte un `traceId` déjà connu complète la même ligne, et les métriques du
run sont recalculées. Renvoyer un lot est sans effet (steps indexés par span id).

`201 Created`

```json
{
  "trajectories": [
    {
      "id": "3f1c…", "traceId": "a1b2…", "agentName": "sentry-triage", "agentVersion": "1.5.0",
      "sourceFormat": "otlp", "status": "ok", "stepCount": 11, "merged": true,
      "createdAt": "2026-10-24T10:00:03.000Z"
    }
  ]
}
```

---

## Suivi des agents

### `GET /api/agents`

Un résumé par agent actif sur 14 jours : `runs24h`, `runs7d`, `errorRate24h`,
`p50DurationMs24h`, `avgCostUsd24h`, `latestVersion`, `lastSeen`, et `daily`
(14 points `{ date, runs, errorRate, avgCostUsd }`).

### `GET /api/agents/:name/timeseries`

| Param | Défaut | Notes |
|---|---|---|
| `from`, `to` | 14 derniers jours | ISO 8601 |
| `bucket` | `day` | `hour` ou `day`, 744 points max |
| `version` | — | filtre sur une version |

`points[]` : `{ t, runs, errorRate, toolErrorRate, p50DurationMs, p95DurationMs, avgCostUsd, avgSteps, avgTokens, avgRedundantToolCalls }`.
Les buckets sans run sont présents avec `runs: 0` et des valeurs `null`.

### `GET /api/agents/:name/versions`

Par version, la plus récente (première apparition) d'abord : `firstSeen`,
`lastSeen`, `runs`, `errorRate`, `p50DurationMs`, `avgCostUsd`, `avgSteps`,
`avgRedundantToolCalls`, `topPath`, `topPathShare`.

### `GET /api/agents/:name/compare`

| `mode` | Compare |
|---|---|
| `version` | dernière version vs la précédente (404 s'il n'y en a pas deux) |
| `window` (défaut) | dernières `currentHours` (24) vs les `baselineDays` (7) jours précédents |

```json
{
  "mode": "version", "baselineLabel": "1.4.0", "currentLabel": "1.5.0",
  "baselineRuns": 480, "currentRuns": 80,
  "comparisons": [
    { "metric": "redundantToolCalls", "label": "Repeated tool calls", "baseline": 0, "current": 0.82,
      "delta": 0.82, "relDelta": null, "pValue": 0, "verdict": "regression", "severity": "critical" }
  ]
}
```

`verdict` : `regression` | `improvement` | `stable` | `insufficient`. Une
métrique est en régression si l'écart est significatif (test unilatéral,
p < 0,01), assez grand (+15 % sur une moyenne, +3 points sur un taux) et
mesuré sur au moins 20 runs de chaque côté. Métriques : `errorRate`,
`toolErrorRate`, `durationMs`, `costUsd`, `stepCount`, `totalTokens`,
`redundantToolCalls`, `newPathShare`.

---

## Runs

### `GET /api/runs`

| Param | Notes |
|---|---|
| `agent`, `version` | filtres exacts |
| `status` | `ok` ou `error` |
| `loops=1` | seulement les runs avec appels d'outil répétés |
| `from`, `to` | ISO 8601, sur le début du run |
| `limit` | 50 par défaut, 200 max |
| `cursor` | opaque, renvoyé dans `nextCursor` |

Ne renvoie jamais les steps. Tri : début du run décroissant.

### `GET /api/runs/:id`

`{ summary, trajectory }` : les métriques du run et la `Trajectory` complète de `@trajekt/core`.

### Compatibilité phase 1

`GET /api/trajectories` (alias de `/api/runs`), `GET /api/trajectories/:id`
(la `Trajectory` seule) et `GET /api/stats?range=24h|7d|30d|all` sont conservés.

---

## Alertes

### `GET /api/alerts?agent&limit`

Alertes émises, les plus récentes d'abord.

### `POST /api/alerts/check` (ou `GET`, pour Vercel Cron)

Pour chaque agent actif sur 24 h : comparaison fenêtre récente, et
comparaison de versions si la dernière version a moins de 7 jours. Chaque
régression nouvelle (pas d'alerte identique agent + métrique + mode depuis
24 h) est enregistrée, puis postée sur `SLACK_WEBHOOK_URL` si défini.

```json
{ "agentsChecked": 2, "regressions": 9, "alertsCreated": 9, "suppressedByCooldown": 0, "notified": true }
```

## Pas encore fait

- OTLP protobuf / gRPC
- Plusieurs comptes et projets dans l'interface (un mot de passe, un projet)
- Rétention automatique, rate limiting
- Annotations de qualité (scores, feedback utilisateur) dans les comparaisons
