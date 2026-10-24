// otel-setup.ts
//
// Instrumentation OpenTelemetry standard (aucune dépendance à Langfuse
// ou tout autre produit tiers). Exporte vers le collector local
// (voir otel-collector-config.yaml) sur localhost:4318.
//
// Les attributs gen_ai.* suivent les OpenTelemetry GenAI Semantic
// Conventions — c'est ce que normalize() (package trajekt/core)
// reconnaît automatiquement dans son normalizer OTLP.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanKind } from '@opentelemetry/api';

const sdk = new NodeSDK({
  serviceName: 'sentry-jira-agent',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
});

sdk.start();

const tracer = trace.getTracer('sentry-jira-agent');

/**
 * Enrobe un appel LLM avec les attributs gen_ai.* standard.
 * Usage : await withLlmSpan('claude-sonnet-4-6', () => callClaude(...))
 */
export async function withLlmSpan<T>(
  model: string,
  fn: () => Promise<{ result: T; inputTokens?: number; outputTokens?: number }>,
): Promise<T> {
  return tracer.startActiveSpan(
    'chat',
    { kind: SpanKind.CLIENT, attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.request.model': model } },
    async (span) => {
      try {
        const { result, inputTokens, outputTokens } = await fn();
        if (inputTokens != null) span.setAttribute('gen_ai.usage.input_tokens', inputTokens);
        if (outputTokens != null) span.setAttribute('gen_ai.usage.output_tokens', outputTokens);
        return result;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Enrobe un appel d'outil (Jira, Slack, GitLab...) avec les attributs
 * gen_ai.tool.* standard.
 * Usage : await withToolSpan('create_jira_ticket', args, () => jira.create(args))
 */
export async function withToolSpan<T>(
  toolName: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    `execute_tool ${toolName}`,
    { attributes: { 'gen_ai.tool.name': toolName } },
    async (span) => {
      try {
        const result = await fn();
        span.setAttribute('ai.toolCall.result', JSON.stringify(result).slice(0, 2000));
        return result;
      } catch (err) {
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/* -------------------------------------------------------------------
 * Exemple d'usage dans ton pipeline Sentry → Jira → GitLab → Slack :
 *
 *   const ticket = await withLlmSpan('claude-sonnet-4-6', async () => {
 *     const res = await callClaude(sentryPayload);
 *     return { result: res, inputTokens: res.usage.input, outputTokens: res.usage.output };
 *   });
 *
 *   const jiraTicket = await withToolSpan('create_jira_ticket', ticket, () =>
 *     jiraClient.createTicket(ticket)
 *   );
 * ----------------------------------------------------------------- */
