# Trajekt — Contrat d'API (phase 1)

Base URL (dev) : `http://localhost:3000`
Base URL (hébergé) : `https://api.trajekt.dev` *(à confirmer selon le domaine retenu)*

Deux domaines d'auth distincts, ne pas les mélanger :

| Endpoint | Auth | Qui appelle |
|---|---|---|
| `POST /v1/traces` | Clé API de projet (`Authorization: Bearer tk_live_...`) | Le SDK OTel de l'agent, machine-to-machine |
| `GET /api/*` | Session cookie (login dashboard) | Le frontend du dashboard, navigateur |

Les deux familles de routes vivent dans la même app Next.js mais ne
partagent pas leur mécanisme d'auth — l'ingestion doit fonctionner
sans navigateur, le dashboard n'a pas besoin de clés API en phase 1
(un seul compte).

---

## Forme d'erreur standard

Toutes les routes, sans exception, renvoient les erreurs sous cette
forme :

```typescript
interface ApiError {
  error: {
    code: string;      // identifiant stable, machine-readable
    message: string;   // message humain, jamais affiché tel quel en UI critique
  };
}
```

| Code | Statut HTTP | Sens |
|---|---|---|
| `UNAUTHORIZED` | 401 | Clé API absente/invalide, ou session expirée |
| `VALIDATION_ERROR` | 400 | Body malformé, JSON invalide |
| `UNKNOWN_FORMAT` | 422 | JSON valide mais aucun normalizer ne le reconnaît |
| `NOT_FOUND` | 404 | Ressource inexistante ou hors du projet de l'appelant |
| `RATE_LIMITED` | 429 | Quota d'ingestion dépassé *(phase 1.5, pas bloquant au lancement)* |
| `INTERNAL_ERROR` | 500 | Bug côté serveur |

---

## `POST /v1/traces` — Ingestion

Reçoit une trace brute, la normalise via `@trajekt/core`, la persiste.
Accepte les 4 formats que `normalize()` sait déjà lire (OTLP, Langfuse,
AI SDK, trajekt natif) — aucune conversion à faire côté agent.

### Requête

```
POST /v1/traces
Authorization: Bearer tk_live_xxxxxxxxxxxx
Content-Type: application/json

<payload brut — OTLP resourceSpans[], export Langfuse, résultat AI SDK,
 ou Trajectory déjà normalisée>
```

### Réponse — succès

`201 Created`

```json
{
  "trajectories": [
    { "id": "traj_9f2a1c", "sourceFormat": "otlp", "stepCount": 7, "createdAt": "2026-07-14T10:00:03Z" }
  ]
}
```

**Toujours un tableau**, même pour une seule trace — voir la note
ci-dessous sur le regroupement par `traceId`.

### Réponses — erreurs

| Cas | Code | Statut |
|---|---|---|
| Header `Authorization` absent ou clé invalide | `UNAUTHORIZED` | 401 |
| Body vide ou JSON invalide | `VALIDATION_ERROR` | 400 |
| Format non reconnu par `normalize()` | `UNKNOWN_FORMAT` | 422 |

### ⚠️ Point à régler avant d'implémenter

Un export OTLP peut contenir des spans de **plusieurs traces
différentes** dans un seul payload (batching côté exporter OTel — le
comportement par défaut, pas un cas exotique). Le normalizer OTLP
qu'on a écrit dans `core` traite aujourd'hui tout le payload comme une
seule trajectoire (`spans[0]?.traceId`), ce qui est correct pour la
démo mais **faux en production**.

Avant de brancher cet endpoint sur `normalize()` :

```typescript
// Grouper les spans par traceId AVANT de normaliser,
// une Trajectory par traceId, pas une par payload reçu.
const grouped = groupBy(spans, (s) => s.traceId);
const trajectories = Object.values(grouped).map((spans) =>
  normalize({ resourceSpans: [{ scopeSpans: [{ spans }] }] })
);
```

C'est ce qui explique pourquoi la réponse est un tableau plutôt qu'un
objet unique — même si en pratique, la majorité des payloads applicatifs
(un run d'agent = un exporter flush) ne contiendront qu'une trace.

---

## `GET /api/trajectories` — Liste

Pagination par curseur (pas par offset — plus stable sur une table qui
grossit en continu).

### Requête

```
GET /api/trajectories?limit=20&sortBy=createdAt&sortDir=desc&cursor=eyJjcmVhdGVkQXQiOi4uLn0
```

| Param | Type | Défaut | Notes |
|---|---|---|---|
| `limit` | number | 20 | max 100 |
| `cursor` | string | — | opaque, base64 de `{ createdAt, id }` de la dernière ligne vue |
| `sortBy` | `createdAt` \| `totalCostUsd` \| `totalDurationMs` | `createdAt` | |
| `sortDir` | `asc` \| `desc` | `desc` | |
| `source` | `live` \| `replay` \| `simulation` | — | filtre optionnel |
| `format` | `otlp` \| `langfuse` \| `ai-sdk` \| `trajekt` | — | filtre optionnel |
| `from`, `to` | ISO 8601 | — | filtre par date de création |

### Réponse — succès

`200 OK`. **Ne renvoie jamais `steps`** — la liste doit rester légère
même avec des milliers de runs ; le détail complet vit dans
`GET /api/trajectories/:id`.

```json
{
  "items": [
    {
      "id": "traj_9f2a1c",
      "source": "live",
      "sourceFormat": "otlp",
      "stepCount": 7,
      "totalCostUsd": 0.0052,
      "totalDurationMs": 3440,
      "createdAt": "2026-07-14T10:00:03Z"
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQiOi4uLn0"
}
```

`nextCursor` vaut `null` sur la dernière page.

---

## `GET /api/trajectories/:id` — Détail

Renvoie la `Trajectory` complète, telle que produite par `normalize()`
— c'est exactement la forme que le visualiseur consomme, zéro
transformation supplémentaire côté frontend.

### Réponse — succès

`200 OK`

```json
{
  "schemaVersion": 1,
  "id": "traj_9f2a1c",
  "source": "live",
  "steps": [
    { "index": 0, "type": "llm_call", "model": "claude-sonnet-4-6", "costUsd": 0.0034, "durationMs": 1400, "...": "..." },
    { "index": 1, "type": "tool_call", "name": "create_jira_ticket", "...": "..." }
  ],
  "metadata": { "sourceFormat": "otlp" },
  "createdAt": "2026-07-14T10:00:03Z"
}
```

### Réponses — erreurs

| Cas | Code | Statut |
|---|---|---|
| Id inexistant, ou appartenant à un autre projet | `NOT_FOUND` | 404 |

---

## `GET /api/stats` — Agrégats (header du dashboard)

### Requête

```
GET /api/stats?range=7d
```

| Param | Valeurs | Défaut |
|---|---|---|
| `range` | `24h` \| `7d` \| `30d` \| `all` | `7d` |

### Réponse — succès

`200 OK`

```json
{
  "totalRuns": 342,
  "totalCostUsd": 4.18,
  "totalToolCalls": 891,
  "avgDurationMs": 2760,
  "costOverTime": [
    { "date": "2026-07-08", "costUsd": 0.61 },
    { "date": "2026-07-09", "costUsd": 0.54 }
  ]
}
```

`costOverTime` alimente un graphe de tendance simple dans le header —
un `<LineChart>` recharts suffit, pas besoin de plus en phase 2.

---

## Types TypeScript partagés

À placer dans `lib/api-types.ts`, importés à la fois par les routes API
et par le dashboard — un seul endroit de vérité sur la forme du
contrat.

```typescript
export interface TrajectorySummary {
  id: string;
  source: 'live' | 'replay' | 'simulation';
  sourceFormat: 'otlp' | 'langfuse' | 'ai-sdk' | 'trajekt';
  stepCount: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  createdAt: string; // ISO 8601
}

export interface ListTrajectoriesResponse {
  items: TrajectorySummary[];
  nextCursor: string | null;
}

export interface IngestResponse {
  trajectories: Array<{
    id: string;
    sourceFormat: string;
    stepCount: number;
    createdAt: string;
  }>;
}

export interface StatsResponse {
  totalRuns: number;
  totalCostUsd: number;
  totalToolCalls: number;
  avgDurationMs: number;
  costOverTime: Array<{ date: string; costUsd: number }>;
}

export interface ApiError {
  error: { code: string; message: string };
}
```

`GET /api/trajectories/:id` renvoie directement le type `Trajectory`
déjà défini dans `@trajekt/core` — pas de type dupliqué pour ça.

---

## Ce qui reste volontairement hors phase 1

- Pas de rate limiting actif (juste le code d'erreur prévu dans le contrat)
- Pas de suppression/rétention automatique
- Pas de webhooks sortants (notif Slack sur régression, etc.) — viendrait avec `assert` en phase 4
- Pas de filtre par coût min/max sur la liste — à ajouter si un vrai besoin apparaît
