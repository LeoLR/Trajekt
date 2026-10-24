# @trajekt/core

The engine behind Trajekt: read any agent trace into one model, then measure it.

- **`normalize(trace)` / `normalizeAll(payload)`** — Langfuse trace export, OTLP/JSON spans (GenAI semantic conventions, Vercel AI SDK telemetry), Vercel AI SDK `generateText` result, or a Trajekt trajectory → a `Trajectory`. Format detection is structural, no configuration. `normalizeAll` returns one trajectory per `traceId` (OTel exporters batch several traces in one request).
- **`mergeTrajectories(a, b)`** — OTel exporters send a trace in several batches; merging is idempotent (steps are keyed by span id).
- **`computeMetrics(trajectory)`** — status, start, duration, steps, LLM and tool calls, errors, tokens, cost (from the source, or estimated from tokens and flagged `costEstimated`), repeated tool calls, retries, tool path signature.
- **`annotateSteps(trajectory)`** — the same rules step by step: error, retry attempt, "repeats step #n".
- **`compareWindows(baseline, current)`** — is a group of runs worse than another one? One-sided z-test (rates) or Welch test (means), plus a minimum effect size and a minimum sample size, so noise is not reported as a regression.
- **`diffTrajectories(a, b)`** — two runs aligned step by step, with `=`, `≠`, `+`, `−` markers.

```bash
npm i @trajekt/core
```

```ts
import { normalize, computeMetrics, annotateSteps } from '@trajekt/core';

const run = normalize(otlpPayload);   // one trace; use normalizeAll() for a batch
computeMetrics(run);
// { status: 'error', durationMs: 25734, costUsd: 0.114, costEstimated: true,
//   redundantToolCalls: 2, retryCount: 0, pathSignature: 'sentry.getIssue → gitlab.searchCode ×3 → …', … }
```

## The model

```ts
interface Trajectory {
  schemaVersion: 1;
  id: string;
  source: 'live' | 'replay' | 'simulation';
  steps: TrajectoryStep[];      // llm_call | tool_call | user_message | agent_message | decision | custom
  metadata: {
    traceId?: string; agentName?: string; agentVersion?: string; promptVersion?: string;
    environment?: string; sourceFormat?: string; status?: 'ok' | 'error'; [key: string]: unknown;
  };
  createdAt?: string;
}
```

Every step keeps the original payload in `raw`: normalization never throws information away. The schema is versioned; `deserializeTrajectory` refuses a version it cannot read.

## Where identity comes from (OTLP)

| Field | Read from, in order |
|---|---|
| agent name | `trajekt.agent.name`, `gen_ai.agent.name`, `ai.telemetry.functionId`, resource `service.name` |
| agent version | `trajekt.agent.version`, `gen_ai.agent.version`, `ai.telemetry.metadata.agentVersion`, resource `service.version` |
| prompt version | `trajekt.prompt.version`, `ai.telemetry.metadata.promptVersion` |
| environment | `trajekt.environment`, resource `deployment.environment.name` / `deployment.environment` |

A span is an error when its status is `ERROR` or when it carries an `exception` event.

## Cost estimation

`DEFAULT_PRICING` holds indicative public prices (USD per million tokens) for common models. Prices change: override them with `setPricing({ 'my-model': { input, output } })`. Unknown models get no estimate rather than a wrong one.

## Tests

```bash
pnpm --filter @trajekt/core test
```
