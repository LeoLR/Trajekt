<p align="center">
  <img src="docs/assets/banner.png" alt="Trajekt — the flight recorder for AI agents" width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@trajekt/core"><img src="https://img.shields.io/npm/v/@trajekt/core?color=FFB224&label=npm" alt="npm" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT" /></a>
  <a href="#1-start-trajekt"><img src="https://img.shields.io/badge/self--host-docker%20compose-2496ED" alt="Self-host with Docker Compose" /></a>
  <a href="#record-a-run-with-opentelemetry"><img src="https://img.shields.io/badge/ingest-OpenTelemetry-7AA2F7" alt="Ingest OpenTelemetry" /></a>
</p>

**Trajekt records every run of your AI agent — each step, the model's reasoning, tool calls with their arguments and results, tokens, latency and cost — and lets you replay the trajectory step by step. Built for the moment an agent goes off the rails in production.**

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="docs/api-contract.md">Docs</a> ·
  <a href="DOCKER.md">Self-hosting</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="docs/assets/trajectory-replay.png" alt="A run replayed on the Trajekt timeline: repeated tool calls and a failed merge request are flagged" width="100%" />
</p>

## Why Trajekt

Logs tell you what an agent *said*. Trajekt shows you what it *did*.

- **Replay any run** — every step on a timeline, with the prompt, the model's output, the exact tool arguments and what each tool returned.
- **See where it went wrong** — repeated tool calls (same tool, same arguments), retries after a failure and failed steps are flagged on the timeline.
- **Know what each step cost** — tokens, latency and cost per step and per run. Cost comes from the trace when the source provides it, and is otherwise estimated from tokens (and labelled as such).
- **Catch regressions** — runs are grouped per agent and version. Trajekt compares the latest version with the previous one (and the last 24 h with the 7 days before) on failure rate, cost, duration, steps, tokens, loops and tool paths, and can post new regressions to Slack.

## Quickstart

### 1. Start Trajekt

```bash
git clone https://github.com/LeoLR/trajekt.git
cd trajekt
cp .env.example .env          # set DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET
docker compose up -d --build
```

The dashboard and the ingestion endpoint both listen on **http://localhost:3000**. Create a project to get an API key (shown once):

```bash
docker compose exec dashboard pnpm create-project my-project
# optional: two weeks of simulated runs, including a regression, to explore the dashboard
docker compose exec dashboard pnpm seed
```

### 2. Install the SDK

Recording uses plain OpenTelemetry — there is no proprietary SDK in your agent:

```bash
npm i @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

`@trajekt/core` is the library the server uses to read traces. Install it only if you want to read or score traces in your own code or tests:

```bash
npm i @trajekt/core
```

### 3. Record a run

#### Record a run with OpenTelemetry

```ts
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'sentry-triage',          // becomes the agent name
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:3000/v1/traces',
    headers: { Authorization: `Bearer ${process.env.TRAJEKT_API_KEY}` },
  }),
}).start();
```

Or with environment variables only:

```bash
OTEL_SERVICE_NAME=sentry-triage
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."
```

With the Vercel AI SDK, turn telemetry on for each call:

```ts
await generateText({
  model, prompt, tools,
  experimental_telemetry: { isEnabled: true, functionId: 'sentry-triage' },
});
```

Trajekt recognises spans that follow the OpenTelemetry GenAI semantic conventions (`gen_ai.*`) and the Vercel AI SDK telemetry spans (`ai.*`). Set `service.version` (or the `trajekt.agent.version` span attribute) so runs are grouped per version.

#### Send a trace file

A Langfuse trace export, a Vercel AI SDK `generateText` result or an OTLP/JSON file can be posted as-is:

```bash
curl -X POST http://localhost:3000/v1/traces \
  -H "Authorization: Bearer tk_live_..." \
  -H "Content-Type: application/json" \
  -H "X-Trajekt-Agent: support-bot" \
  --data @trace.json
```

#### Read a trace in code

```ts
import { normalize, computeMetrics, annotateSteps } from '@trajekt/core';

const run = normalize(trace);            // Langfuse export, OTLP/JSON or AI SDK result
const metrics = computeMetrics(run);     // status, durationMs, costUsd, redundantToolCalls, retryCount, pathSignature…
const flags = annotateSteps(run);        // per step: error, retry attempt, "repeats step #n"
```

## Works with

| Source | How |
|---|---|
| OpenTelemetry | Any OTLP/HTTP exporter in **JSON** (`OTEL_EXPORTER_OTLP_PROTOCOL=http/json`), gzip accepted. Protobuf and gRPC are not supported yet. |
| OpenTelemetry GenAI semantic conventions | `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.usage.*`, `gen_ai.tool.*`, `gen_ai.agent.name`, `gen_ai.input/output.messages` |
| Vercel AI SDK | `experimental_telemetry` spans through an OTel exporter, or a `generateText` result posted to `/v1/traces` |
| Langfuse | Trace exports (a trace with its `observations`) posted to `/v1/traces`. No live sync with a Langfuse instance. |

## Repository layout

```
packages/
  core/          @trajekt/core — normalize(), merge, metrics, regression tests, run diff
apps/
  dashboard/     Next.js — ingestion (POST /v1/traces), API and dashboard
    migrations/    SQL schema (one Postgres, nothing else)
    src/server/    ingestion, queries, alerts, simulated traffic
    src/views/     dashboard pages
    test/          tests against a real Postgres
  site/          Landing page (Vite + React, prerendered)
docs/            API contract, architecture notes, assets
docker-compose.yml   Postgres + dashboard
```

## Contributing

```bash
pnpm install
pnpm --filter @trajekt/core build
pnpm test                       # core unit tests + dashboard tests (needs a Postgres, see below)
pnpm --filter dashboard dev     # http://localhost:3000
pnpm --filter site dev          # landing page on http://localhost:5173
```

The dashboard tests create and drop a throwaway database on a local Postgres (`TEST_PG_HOST`, `TEST_PG_PORT`, `TEST_PG_USER`; defaults `127.0.0.1:54329`, user `postgres`, trust auth). Issues and pull requests are welcome.

## License

MIT — see the `license` field in [`packages/core/package.json`](packages/core/package.json).
