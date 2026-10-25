import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceRun, traceTool, normalize, computeMetrics } from '../src/index.js';

/** Un tracer factice qui produit de vrais spans OTLP/JSON. */
function fakeTracer() {
  const spans: any[] = [];
  const stack: string[] = [];
  let id = 0;
  let clock = 1_700_000_000_000;
  const tracer = {
    startActiveSpan(name: string, fn: (span: any) => any) {
      const spanId = String(++id).padStart(16, '0');
      const span = {
        name, spanId, parentSpanId: stack[stack.length - 1] ?? '', traceId: 'ab'.repeat(16),
        attributes: [] as any[], status: { code: 0 } as any, events: [] as any[],
        startTimeUnixNano: String(BigInt(clock++) * 1_000_000n), endTimeUnixNano: '',
        setAttribute(k: string, v: any) { this.attributes.push({ key: k, value: typeof v === 'number' ? { doubleValue: v } : { stringValue: String(v) } }); },
        setAttributes(a: Record<string, any>) { for (const [k, v] of Object.entries(a)) this.setAttribute(k, v); },
        setStatus(s: any) { this.status = s; },
        recordException(e: any) { this.events.push({ name: 'exception', attributes: [{ key: 'exception.message', value: { stringValue: String(e?.message ?? e) } }] }); },
        spanContext() { return { traceId: this.traceId }; },
        end() { this.endTimeUnixNano = String(BigInt(clock++) * 1_000_000n); stack.pop(); spans.push(this); },
      };
      stack.push(spanId);
      return fn(span);
    },
  };
  return { tracer, payload: () => ({ resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [{ spans: spans.map(({ setAttribute, setAttributes, setStatus, recordException, spanContext, end, ...s }) => s) }] }] }) };
}

test('traceRun / traceTool : ce que Trajekt lit, sans dépendance', async () => {
  const { tracer, payload } = fakeTracer();
  let traceId: string | undefined;
  await traceRun(tracer, { agent: 'sentry-triage', agentVersion: '1.5.0', promptVersion: 'v8', scenario: 'npe-checkout' }, async (run) => {
    traceId = run.traceId;
    await traceTool(tracer, 'sentry.getIssue', { id: 'PAY-1' }, async () => ({ id: 'PAY-1' }));
    await traceTool(tracer, 'gitlab.searchCode', { q: 'x' }, () => ['a.ts']);
    await traceTool(tracer, 'gitlab.searchCode', { q: 'x' }, () => ['a.ts']);
    await assert.rejects(traceTool(tracer, 'jira.createIssue', { project: 'PAY' }, async () => { throw new Error('429 Too Many Requests'); }));
    run.score('correct', false);
  });
  const t = normalize(payload());
  assert.equal(traceId, 'ab'.repeat(16));
  assert.equal(t.metadata.agentName, 'sentry-triage');
  assert.equal(t.metadata.agentVersion, '1.5.0');
  assert.equal(t.metadata.promptVersion, 'v8');
  assert.equal(t.metadata.scenario?.name, 'npe-checkout');
  assert.deepEqual(t.metadata.scores, { correct: 0 });
  const m = computeMetrics(t);
  assert.equal(m.toolCallCount, 4);
  assert.equal(m.redundantToolCalls, 1);
  assert.equal(m.toolErrorCount, 1);
  assert.equal(m.status, 'ok', 'erreur d’outil rattrapée : le run réussit');
  assert.deepEqual((t.steps.find((s) => s.type === 'tool_call') as any).result, { id: 'PAY-1' });

  // Une exception qui sort du run le marque en échec.
  const failing = fakeTracer();
  await assert.rejects(traceRun(failing.tracer, { agent: 'a' }, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(computeMetrics(normalize(failing.payload())).status, 'error');
});
