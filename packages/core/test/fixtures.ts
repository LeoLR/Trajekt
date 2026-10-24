/** Fabriques de traces pour les tests — proches de ce qu'émettent les vrais exporters. */

const sv = (stringValue: string) => ({ stringValue });
const iv = (n: number) => ({ intValue: String(n) }); // OTLP/JSON encode les int64 en string

export interface SpanSpec {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startMs: number;
  endMs: number;
  attrs?: Record<string, { stringValue?: string; intValue?: string; doubleValue?: number }>;
  error?: string;
  exception?: string;
}

export function otlpSpan(traceId: string, s: SpanSpec) {
  return {
    traceId,
    spanId: s.spanId,
    parentSpanId: s.parentSpanId ?? '',
    name: s.name,
    startTimeUnixNano: String(BigInt(s.startMs) * 1_000_000n),
    endTimeUnixNano: String(BigInt(s.endMs) * 1_000_000n),
    attributes: Object.entries(s.attrs ?? {}).map(([key, value]) => ({ key, value })),
    status: s.error ? { code: 2, message: s.error } : { code: 0 },
    events: s.exception
      ? [{ name: 'exception', attributes: [{ key: 'exception.message', value: sv(s.exception) }] }]
      : [],
  };
}

export function otlpPayload(
  spans: ReturnType<typeof otlpSpan>[],
  resource: Record<string, string> = { 'service.name': 'sentry-triage', 'service.version': '1.4.0' },
) {
  return {
    resourceSpans: [
      {
        resource: { attributes: Object.entries(resource).map(([key, v]) => ({ key, value: sv(v) })) },
        scopeSpans: [{ scope: { name: 'test' }, spans }],
      },
    ],
  };
}

export const llmAttrs = (model: string, inT: number, outT: number) => ({
  'gen_ai.operation.name': sv('chat'),
  'gen_ai.request.model': sv(model),
  'gen_ai.usage.input_tokens': iv(inT),
  'gen_ai.usage.output_tokens': iv(outT),
});

export const toolAttrs = (name: string, args?: unknown) => ({
  'gen_ai.operation.name': sv('execute_tool'),
  'gen_ai.tool.name': sv(name),
  ...(args !== undefined ? { 'gen_ai.tool.call.arguments': sv(JSON.stringify(args)) } : {}),
});

/** Le run de référence : sentry → llm → jira → slack, racine en dernier (comme un BatchSpanProcessor). */
export function sentryRun(traceId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90', t0 = Date.UTC(2026, 9, 20, 10, 0, 0)) {
  const spans = [
    otlpSpan(traceId, { spanId: 's1', parentSpanId: 'root', name: 'execute_tool sentry.getIssue', startMs: t0 + 10, endMs: t0 + 400, attrs: toolAttrs('sentry.getIssue', { id: 'PAY-1' }) }),
    otlpSpan(traceId, { spanId: 's2', parentSpanId: 'root', name: 'chat claude-sonnet-4-5', startMs: t0 + 420, endMs: t0 + 2400, attrs: llmAttrs('claude-sonnet-4-5', 2000, 300) }),
    otlpSpan(traceId, { spanId: 's3', parentSpanId: 'root', name: 'execute_tool jira.createIssue', startMs: t0 + 2410, endMs: t0 + 3000, attrs: toolAttrs('jira.createIssue', { project: 'PAY' }) }),
    otlpSpan(traceId, { spanId: 's4', parentSpanId: 'root', name: 'execute_tool slack.postMessage', startMs: t0 + 3010, endMs: t0 + 3200, attrs: toolAttrs('slack.postMessage', { channel: '#alerts' }) }),
    otlpSpan(traceId, { spanId: 'root', name: 'invoke_agent sentry-triage', startMs: t0, endMs: t0 + 3300, attrs: { 'gen_ai.operation.name': sv('invoke_agent'), 'gen_ai.agent.name': sv('sentry-triage') } }),
  ];
  return spans;
}

export function langfuseTrace() {
  return {
    id: 'lf-trace-1',
    name: 'support-bot',
    release: 'v2.1.0',
    environment: 'production',
    timestamp: '2026-10-20T09:00:00.000Z',
    observations: [
      { id: 'o1', type: 'GENERATION', name: 'plan', model: 'gpt-4o', startTime: '2026-10-20T09:00:00.000Z', endTime: '2026-10-20T09:00:01.500Z', input: [{ role: 'user', content: 'Où est ma commande ?' }], output: { role: 'assistant', content: 'Je regarde.' }, usage: { input: 120, output: 30 }, calculatedTotalCost: 0.0012, promptVersion: 7 },
      { id: 'o2', parentObservationId: 'o1', type: 'TOOL', name: 'orders.lookup', startTime: '2026-10-20T09:00:01.600Z', endTime: '2026-10-20T09:00:02.000Z', input: { orderId: 42 }, output: { status: 'shipped' } },
      { id: 'o3', type: 'SPAN', name: 'tool:refund', level: 'ERROR', statusMessage: 'refund API 500', startTime: '2026-10-20T09:00:02.100Z', endTime: '2026-10-20T09:00:02.300Z', input: { orderId: 42 } },
      { id: 'o4', type: 'EVENT', name: 'note', level: 'DEFAULT', statusMessage: 'just info', startTime: '2026-10-20T09:00:02.400Z' },
    ],
  };
}
