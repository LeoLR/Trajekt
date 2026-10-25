<p align="center">
  <img src="docs/assets/banner.png" alt="Trajekt — la boîte noire de vos agents IA" width="100%" />
</p>

<p align="center"><a href="README.md">English</a> · <strong>Français</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@trajekt/core"><img src="https://img.shields.io/npm/v/@trajekt/core?color=FFB224&label=npm" alt="npm" /></a>
  <a href="#licence"><img src="https://img.shields.io/badge/licence-MIT-blue" alt="Licence : MIT" /></a>
  <a href="#1-lancer-trajekt"><img src="https://img.shields.io/badge/auto--h%C3%A9berg%C3%A9-docker%20compose-2496ED" alt="Auto-hébergé avec Docker Compose" /></a>
  <a href="#enregistrer-un-run-avec-opentelemetry"><img src="https://img.shields.io/badge/ingestion-OpenTelemetry-7AA2F7" alt="Ingestion OpenTelemetry" /></a>
</p>

**Trajekt enregistre chaque run de votre agent IA — chaque étape, le raisonnement du modèle, les appels d’outils avec leurs arguments et leurs résultats, les tokens, la latence et le coût — et vous permet de rejouer la trajectoire étape par étape. Pensé pour le moment où un agent déraille en production.**

> **Essayez sans rien installer :** la [démo en ligne](https://trajekt-demo.vercel.app) rejoue deux semaines de trafic simulé de deux agents, dont l’un a régressé après une release. Son point d’accès MCP en lecture seule est ouvert aussi : `claude mcp add --transport http trajekt https://trajekt-demo.vercel.app/api/mcp`.

<p align="center">
  <a href="https://trajekt-demo.vercel.app"><strong>Démo</strong></a> ·
  <a href="#démarrage-rapide">Démarrage rapide</a> ·
  <a href="https://trajekt-eight.vercel.app/fr/docs/">Documentation</a> ·
  <a href="DOCKER.md">Auto-hébergement</a> (en anglais) ·
  <a href="#contribuer">Contribuer</a>
</p>

<p align="center">
  <img src="docs/assets/trajectory-replay.png" alt="Un run rejoué sur la timeline de Trajekt : les appels d’outils répétés et une merge request en échec sont signalés" width="100%" />
</p>

## Pourquoi Trajekt

Les logs disent ce qu’un agent a *dit*. Trajekt montre ce qu’il a *fait*.

- **Rejouer n’importe quel run** — chaque étape sur une timeline, avec le prompt, la sortie du modèle, les arguments exacts passés aux outils et ce que chaque outil a renvoyé.
- **Voir où ça a déraillé** — les appels d’outils répétés (même outil, mêmes arguments), les relances après un échec et les étapes en échec sont signalés sur la timeline.
- **Savoir ce que coûte chaque étape** — tokens, latence et coût par étape et par run. Le coût vient de la trace quand la source le fournit, sinon il est estimé à partir des tokens (et indiqué comme tel).
- **Comparer des versions** — chaque run porte une version d’app, une version d’agent, une version de prompt et un modèle. Comparez deux valeurs de n’importe laquelle : le prompt `v7` face au `v8`, l’app `3.1.0` face à la `3.2.0`, votre modèle actuel face à un modèle moins cher.
- **Suivre la qualité, pas seulement le coût** — attachez des scores aux runs (correct ou non, un juge LLM, un pouce levé), dans la trace ou après coup. Une version moins chère mais fausse apparaît comme une régression.
- **Repérer les régressions** — Trajekt compare chaque nouvelle version d’agent, de prompt ou d’app à la précédente (et les dernières 24 h aux 7 jours précédents) sur les scores de qualité, le taux d’échec, le coût, la durée, les étapes, les tokens, les boucles et les chemins d’outils — avec des tests statistiques corrigés pour le nombre de métriques — et peut poster les nouvelles régressions sur Slack.
- **Brancher ce que vous avez déjà** — OTLP sur HTTP (JSON ou protobuf), les conventions GenAI, Vercel AI SDK, OpenInference (LangChain, LlamaIndex, CrewAI), OpenLLMetry, et un import Langfuse.

## Démarrage rapide

### 1. Lancer Trajekt

```bash
git clone https://github.com/LeoLR/trajekt.git
cd trajekt
cp .env.example .env          # renseigner DASHBOARD_PASSWORD et DASHBOARD_SESSION_SECRET
docker compose up -d --build
```

Le dashboard et le point d’ingestion écoutent tous les deux sur **http://localhost:3000**. Créez un projet pour obtenir une clé d’API (affichée une seule fois) :

```bash
docker compose exec dashboard pnpm create-project mon-projet
# optionnel : deux semaines de runs simulés, dont une régression, pour explorer le dashboard
docker compose exec dashboard pnpm seed
```

### 2. Installer le SDK

L’enregistrement passe par OpenTelemetry standard — aucun SDK propriétaire dans votre agent :

```bash
npm i @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

`@trajekt/core` est la librairie qu’utilise le serveur pour lire les traces. Installez-la seulement si vous voulez lire ou noter des traces dans votre propre code ou vos tests :

```bash
npm i @trajekt/core
```

### 3. Enregistrer un run

#### Enregistrer un run avec OpenTelemetry

```ts
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'sentry-triage',          // devient le nom de l'agent
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:3000/v1/traces',
    headers: { Authorization: `Bearer ${process.env.TRAJEKT_API_KEY}` },
  }),
}).start();
```

Ou uniquement avec des variables d’environnement :

```bash
OTEL_SERVICE_NAME=sentry-triage
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."
```

Avec le Vercel AI SDK, activez la télémétrie à chaque appel :

```ts
await generateText({
  model, prompt, tools,
  experimental_telemetry: { isEnabled: true, functionId: 'sentry-triage' },
});
```

Avec le SDK Anthropic, enveloppez le client une fois et chaque appel au modèle est enregistré :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { traceAnthropic } from '@trajekt/core';

const anthropic = traceAnthropic(new Anthropic(), tracer);
```

Trajekt reconnaît les spans qui suivent les conventions sémantiques GenAI d’OpenTelemetry (`gen_ai.*`) et les spans de télémétrie du Vercel AI SDK (`ai.*`). Définissez `service.version` pour la version de l’app, et `trajekt.agent.version` / `trajekt.prompt.version` quand l’agent ou son prompt évoluent séparément :

```bash
OTEL_RESOURCE_ATTRIBUTES=service.version=3.2.0,trajekt.agent.version=1.5.0,trajekt.prompt.version=v8
```

#### Envoyer un fichier de trace

Un export de trace Langfuse, un résultat `generateText` du Vercel AI SDK ou un fichier OTLP/JSON peuvent être postés tels quels (un exemple de chaque dans [`docs/assets/samples`](docs/assets/samples)) :

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Authorization: Bearer tk_live_..." \
  -H "Content-Type: application/json" \
  -H "X-Trajekt-Agent: support-bot" \
  --data @trace.json
```

#### Lire une trace dans le code

```ts
import { normalize, computeMetrics, annotateSteps } from '@trajekt/core';

const run = normalize(trace);            // export Langfuse, OTLP/JSON ou résultat AI SDK
const metrics = computeMetrics(run);     // status, durationMs, costUsd, redundantToolCalls, retryCount, pathSignature…
const flags = annotateSteps(run);        // par étape : erreur, numéro de tentative, « répète l'étape #n »
```

## Tester votre agent avant la mise en production

Rejouez un jeu fixe de scénarios — outils et données mockés — à chaque changement, et laissez Trajekt vous dire si la nouvelle version est moins bonne.

- **Vérifier un run** dans n’importe quel runner de tests :

  ```ts
  import { normalize, assertTrajectory } from '@trajekt/core';

  assertTrajectory(normalize(trace), {
    status: 'ok',
    order: ['sentry.getIssue', 'gitlab.readFile', 'jira.createIssue'],
    calledWith: [{ tool: 'jira.createIssue', args: { project: 'PAY' } }],
    maxRepeatedToolCalls: 0,
    maxCostUsd: 0.08,
  });
  ```

- **Comparer des suites d’évaluation.** Marquez les runs d’évaluation avec `trajekt.scenario` et la version testée, et donnez-leur un score de qualité (`trajekt.score.correct`, ou `scoreTrajectory()` à partir de vos vérifications). Trajekt les exclut des métriques de production et compare chaque scénario à lui-même entre deux versions — un test apparié qui repère une régression avec une douzaine de scénarios — puis répond `pass` ou `fail`, indique quels scénarios se sont dégradés et renvoie vers un diff étape par étape.
- **Bloquer vos pull requests.** L’[action GitHub](actions/eval-suite) compare la tête de la PR à sa base, commente le résultat sur la pull request — les scénarios dégradés, avec un lien vers leur diff — et fait échouer le job en cas de régression :

  ```yaml
  - uses: LeoLR/Trajekt/actions/eval-suite@main
    with:
      url: ${{ vars.TRAJEKT_URL }}
      read-key: ${{ secrets.TRAJEKT_READ_KEY }}
      agent: sentry-triage
      baseline: ${{ github.event.pull_request.base.sha }}
      candidate: ${{ github.event.pull_request.head.sha }}
  ```

  Les autres CI appellent `GET /api/agents/:name/evals` ; sans serveur, utilisez `compareScenarios()` de `@trajekt/core`. Un exemple exécutable se trouve dans [`examples/eval-suite`](examples/eval-suite).

Voir [Tester votre agent](https://trajekt-eight.vercel.app/fr/docs/#testing) dans la documentation, et la suite d’évaluation de la [démo](https://trajekt-demo.vercel.app/agents/sentry-triage/evals).

## Le faire tourner pour une équipe

Plusieurs projets par instance, chacun avec ses propres clés d’API (`/projects`). Les données clients sont masquées avant stockage : les secrets par défaut, et sur demande les emails, IBAN, cartes, téléphones et vos propres motifs. Rétention (`TRAJEKT_RETENTION_DAYS`), limites de débit et de taille à l’ingestion, et une option pour ne pas garder les payloads bruts : tout est dans la [configuration](https://trajekt-eight.vercel.app/fr/docs/#configuration).

## Compatible avec

| Source | Comment |
|---|---|
| OpenTelemetry | N’importe quel exporteur OTLP/HTTP, **JSON ou protobuf**, gzip accepté. gRPC n’est pas supporté. |
| Conventions sémantiques GenAI d’OpenTelemetry | `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.usage.*`, `gen_ai.tool.*`, `gen_ai.agent.name`, `gen_ai.input/output.messages` |
| Vercel AI SDK | Spans `experimental_telemetry` via un exporteur OTel, ou un résultat `generateText` posté sur `/v1/traces` |
| OpenInference / OpenLLMetry | LangChain, LlamaIndex, CrewAI… via leur exporteur OTLP : modèles, tokens, outils et leurs arguments |
| Langfuse | `pnpm import-langfuse --since 7d` récupère les traces et les scores d’un projet Langfuse (relançable, sans doublons), ou postez un export de trace sur `/v1/traces` |
| SDK Anthropic | `traceAnthropic(client, tracer)` de `@trajekt/core` enregistre chaque `messages.create` |
| Agents écrits à la main | `traceRun` / `traceTool` de `@trajekt/core` avec n’importe quel tracer OpenTelemetry |

## Organisation du dépôt

```
packages/
  core/          @trajekt/core — normalize(), fusion, métriques, tests de régression, diff de runs,
                 comparaison de suites d'évaluation, vérifications de trajectoires
apps/
  dashboard/     Next.js — ingestion (POST /v1/traces), API et dashboard
    migrations/    schéma SQL (un Postgres, rien d'autre)
    src/server/    ingestion, requêtes, alertes, trafic simulé
    src/views/     pages du dashboard
    test/          tests sur un vrai Postgres
  site/          Landing et documentation (Vite + React, pré-rendu), en anglais et en français
actions/
  eval-suite/    Action GitHub — compare les suites d'évaluation sur les pull requests
examples/
  eval-suite/    un agent jouet, des scénarios mockés, des tests de comportement et la comparaison de suites
docs/            contrat d'API, notes d'architecture, visuels
docker-compose.yml   Postgres + dashboard
```

## Contribuer

```bash
pnpm install
pnpm --filter @trajekt/core build
pnpm test                       # tests unitaires du core + tests du dashboard (Postgres requis, voir plus bas)
pnpm --filter dashboard dev     # http://localhost:3000
pnpm --filter site dev          # landing sur http://localhost:5173 (version française sur /fr/)
```

Les tests du dashboard créent et suppriment une base jetable sur un Postgres local (`TEST_PG_HOST`, `TEST_PG_PORT`, `TEST_PG_USER` ; par défaut `127.0.0.1:54329`, utilisateur `postgres`, authentification trust). Les issues et pull requests sont les bienvenues, en français comme en anglais.

## Licence

MIT — voir le champ `license` de [`packages/core/package.json`](packages/core/package.json).
