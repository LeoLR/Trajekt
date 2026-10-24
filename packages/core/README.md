# @trajekt/core

Le modèle central de Trajekt : normalise n'importe quelle trace d'agent IA
(Langfuse, OpenTelemetry, Vercel AI SDK...) vers une structure unique,
`Trajectory`, sur laquelle le reste de l'écosystème (assert, replay,
simulate, report) construit ses fonctionnalités.

**Principe directeur : zéro config.** `normalize()` détecte le format
automatiquement par inspection structurelle. Pas de flag, pas de mapping
à écrire, pas d'adaptateur à choisir à la main.

---

## Installation

```bash
npm install @trajekt/core
```

> Package en cours de publication — utilisable dès aujourd'hui en local
> via `npm link` ou en copiant `dist/` dans ton projet.

## Quickstart

```typescript
import { normalize, toolCalls, totalCostUsd } from '@trajekt/core';

const trajectory = normalize(anyTraceJson); // détection automatique du format

console.log(trajectory.steps.length);       // nombre total de steps
console.log(toolCalls(trajectory));         // tous les appels d'outils
console.log(totalCostUsd(trajectory));      // coût total en $
```

`anyTraceJson` peut être un objet déjà parsé ou une string JSON brute —
les deux sont acceptés.

---

## Formats supportés nativement

| Format       | Détection                                    | Couvre aussi |
|--------------|-----------------------------------------------|--------------|
| `trajekt`    | `schemaVersion` + `steps[]`                  | round-trip d'une trajectoire déjà normalisée |
| `langfuse`   | `observations[]` avec `type` / `startTime`   | export brut d'une trace Langfuse (Cloud ou self-hosted) |
| `otlp`       | `resourceSpans[]`                            | **Mastra, Vercel AI SDK via OTel, LangGraph.js**, tout backend OTLP standard, y compris un collector local (voir plus bas) |
| `ai-sdk`     | `steps[]` avec `toolCalls` / `text`          | résultat direct de `generateText()` / `streamText()` du Vercel AI SDK |

Un format non reconnu ? `registerNormalizer()` permet d'en brancher un
custom sans toucher au core. C'est l'exception, pas le chemin normal.

---

## Le modèle `Trajectory`

Tout converge vers une structure unique, versionnée dès le jour 1 :

```typescript
interface Trajectory {
  schemaVersion: 1;
  id: string;
  source: 'live' | 'replay' | 'simulation';
  steps: TrajectoryStep[];   // llm_call | tool_call | user_message | ...
  metadata: TrajectoryMetadata;
}
```

Chaque step garde son payload d'origine dans `raw` — la normalisation
ne détruit jamais d'information, elle ajoute une couche de lecture
commune par-dessus.

La sérialisation vérifie la version au chargement :

```typescript
import { deserializeTrajectory, SchemaVersionError } from '@trajekt/core';

try {
  const t = deserializeTrajectory(diskJson);
} catch (e) {
  if (e instanceof SchemaVersionError) {
    // trace écrite par une version antérieure/future de trajekt
  }
}
```

---

## Instrumenter un agent sans aucun service tiers

Pas de compte Langfuse, pas de SaaS, rien à faire valider en interne :
un collector OpenTelemetry local suffit à produire des traces que
`normalize()` lit nativement (format `otlp`).

### 1. Lancer le collector local

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  file:
    path: /out/traces.json
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file]
```

```bash
docker run -p 4318:4318 -v $(pwd):/out \
  -v $(pwd)/otel-collector-config.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector:latest --config /etc/otelcol/config.yaml
```

### 2. Instrumenter l'agent

Utilise les attributs `gen_ai.*` (OpenTelemetry GenAI Semantic
Conventions — standard neutre, adopté par Datadog, Honeycomb, etc.) :

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'sentry-jira-agent',
  traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
}).start();
```

Voir `otel-setup.ts` pour les helpers `withLlmSpan()` / `withToolSpan()`
prêts à l'emploi.

### 3. Normaliser

```typescript
import fs from 'node:fs';
import { normalize } from '@trajekt/core';

const raw = JSON.parse(fs.readFileSync('traces.json', 'utf-8'));
const trajectory = normalize(raw); // detectFormat() → 'otlp'
```

Migration vers un backend managé plus tard (Langfuse, Datadog...) :
change uniquement l'exporter, zéro ré-instrumentation — c'est tout
l'intérêt d'instrumenter en OTel standard plutôt qu'en SDK propriétaire.

---

## Les deux contrats d'intégration

### `TraceProvider` — d'où viennent les traces

```typescript
interface TraceProvider {
  readonly name: string;
  fetchRaw(traceId: string): Promise<unknown>;
  listTraceIds(filter?: TraceFilter): Promise<string[]>;
}
```

Un provider retourne du brut ; la normalisation est centralisée dans
`core`. Écrire un provider = écrire `fetchRaw()`, rien d'autre.

### `AgentAdapter` — comment invoquer l'agent

```typescript
type AgentAdapter = (
  input: string,
  context: ConversationContext,
) => Promise<AgentTurnResult | string>;
```

Réduit à une fonction — le minimum incompressible pour brancher
n'importe quel agent sans bidouille.

---

## API complète

| Export | Rôle |
|---|---|
| `normalize(input)` | Point d'entrée universel, détection auto |
| `detectFormat(input)` | Renvoie le format détecté sans normaliser |
| `registerNormalizer(n)` | Branche un normalizer custom |
| `serializeTrajectory` / `deserializeTrajectory` | Sérialisation versionnée |
| `toolCalls` / `llmCalls` / `turns` / `totalCostUsd` | Helpers de lecture |
| `fetchTrajectory(provider, id)` | Récupère + normalise en un geste |

Voir `src/trajectory.ts`, `src/normalize.ts`, `src/provider.ts` pour
le détail des types.

---

## Roadmap

Ce package est la fondation. Prochains packages du monorepo :
`assert` (`expectTrajectory()`), `replay` (`ReplayEngine`),
`simulate` (`Simulator`, personas), `report` (rapport HTML CI).
Voir le plan d'architecture complet du projet.

## Licence

MIT.
