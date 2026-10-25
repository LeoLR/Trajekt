# @trajekt/core

The engine behind Trajekt: read any agent trace into one model, then measure it.

**Read traces**

- **`normalize(trace)` / `normalizeAll(payload)`** — OTLP spans (GenAI semantic conventions, Vercel AI SDK telemetry, OpenInference from LangChain / LlamaIndex / CrewAI, OpenLLMetry), Langfuse trace exports, Vercel AI SDK `generateText` results or Trajekt trajectories → a `Trajectory`. Format detection is structural, no configuration. `normalizeAll` returns one trajectory per `traceId`.
- **`decodeOtlpProtobuf(bytes)`** — an OTLP protobuf `ExportTraceServiceRequest` (what several OpenTelemetry SDKs send by default) → its OTLP/JSON form. No dependency, works in the browser.
- **`mergeTrajectories(a, b)`** — OTel exporters send a trace in several batches; merging is idempotent (steps keyed by span id, scores merged by name).

**Measure a run**

- **`computeMetrics(run)`** — status, duration, steps, LLM and tool calls, errors, tokens, cost (from the source, or estimated from tokens), repeated tool calls, retries, tool path.
- **`annotateSteps(run)`** — the same rules step by step: error, retry attempt, "repeats step #n". A repeat is the same tool with the same arguments as an earlier successful call, with no state-changing call in between (reading a file again after editing it is not a loop). `setMutatingTools()` tunes what counts as state-changing.
- **`diffTrajectories(a, b)`** — two runs aligned step by step, with `=`, `≠`, `+`, `−` markers.

**Test an agent**

- **`assertTrajectory(run, expectations)`** — tools called, order, arguments, budgets (steps, cost, repeats…); throws an error listing everything that failed. `checkTrajectory` returns the list, `scoreTrajectory` the share of expectations met (a quality score to send to Trajekt).
- **`compareScenarios(baseline, current)`** — two runs of an eval suite compared scenario by scenario: paired test across the suite (Holm-corrected), plain thresholds per scenario, quality scores first; `result: 'pass' | 'fail'` with the reasons. `scenarioRunOf(run)` prepares its input.
- **`compareWindows(baseline, current)`** — is a group of runs worse than another one? One-sided tests per metric and per quality score, a minimum effect size and sample size, Holm correction across metrics.

**Instrument an agent**

- **`traceRun(tracer, labels, fn)` / `traceTool(tracer, name, args, fn)`** — the spans and attributes Trajekt reads (agent, versions, scenario, scores, tool arguments and results), with any OpenTelemetry tracer. No dependency.
- **`traceAnthropic(client, tracer)`** — wraps an Anthropic SDK client: every `messages.create` records the model, tokens (prompt cache included, priced as such) and messages. `traceLlm(tracer, { model, input }, fn)` does the same around any Anthropic or OpenAI call.

```bash
npm i @trajekt/core
```

```ts
import { trace } from '@opentelemetry/api';
import { traceRun, traceTool } from '@trajekt/core';

const tracer = trace.getTracer('sentry-triage');
await traceRun(tracer, { agent: 'sentry-triage', agentVersion: '1.5.0', promptVersion: 'v8' }, async (run) => {
  const issue = await traceTool(tracer, 'sentry.getIssue', { id }, () => sentry.getIssue(id));
  // …
  run.score('correct', ticket.project === expectedProject);
});
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
