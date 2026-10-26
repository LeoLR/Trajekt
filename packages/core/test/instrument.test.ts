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

test('traceAnthropic : modèle, tokens avec cache, coût, messages ; le reste du client intact', async () => {
  const { traceAnthropic, traceRun: tr } = await import('../src/index.js');
  const { tracer, payload } = fakeTracer();
  const fakeClient = {
    apiKey: 'sk-ant',
    messages: {
      calls: 0,
      async create(params: any) {
        this.calls++;
        return {
          model: params.model, stop_reason: 'tool_use',
          content: [{ type: 'text', text: 'Looking it up.' }, { type: 'tool_use', name: 'sentry.getIssue', input: { id: 'PAY-1' } }],
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
        };
      },
      countTokens: () => 42,
    },
  };
  const anthropic = traceAnthropic(fakeClient, tracer);
  await tr(tracer, { agent: 'sentry-triage' }, async () => {
    const msg = await anthropic.messages.create({ model: 'claude-sonnet-5-5', system: 'You triage.', messages: [{ role: 'user', content: 'PAY-1' }], max_tokens: 500 });
    assert.equal(msg.stop_reason, 'tool_use');
  });
  assert.equal(anthropic.apiKey, 'sk-ant');
  assert.equal(anthropic.messages.countTokens(), 42);
  assert.equal(fakeClient.messages.calls, 1);
  const t = normalize(payload());
  const llm = t.steps.find((s) => s.type === 'llm_call') as any;
  assert.equal(llm.model, 'claude-sonnet-5-5');
  assert.deepEqual(llm.usage, { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 9000, cacheWriteTokens: 0 });
  assert.deepEqual(llm.input.map((m: any) => m.role), ['system', 'user']);
  assert.match(llm.output.content, /Looking it up/);
  const m = computeMetrics(t);
  assert.equal(m.inputTokens, 10_000, 'le prompt complet, cache compris');
  // 1000 × 2 $ + 200 × 10 $ + 9000 × 0,10 $ (lecture du cache) par million = 0,0049 $
  assert.equal(m.costUsd, 0.0049);
  assert.equal(m.costEstimated, true);
});

test('traceAnthropic / traceLlm : stepName nomme les appels (chaîne ou fonction des paramètres)', async () => {
  const { traceAnthropic, traceLlm, traceRun: tr } = await import('../src/index.js');
  const { tracer, payload } = fakeTracer();
  const client = { messages: { async create(p: any) { return { model: p.model, content: [], usage: { input_tokens: 1, output_tokens: 1 } }; } } };
  const planner = traceAnthropic(client, tracer, { stepName: 'PLAN' });
  const byPhase = traceAnthropic(client, tracer, { stepName: (p) => p.metadata?.phase });
  const plain = traceAnthropic(client, tracer);
  await tr(tracer, { agent: 'relay' }, async () => {
    await planner.messages.create({ model: 'claude-sonnet-5-5', messages: [] });
    await byPhase.messages.create({ model: 'claude-sonnet-5-5', messages: [], metadata: { phase: 'DEVELOP#2' } });
    await plain.messages.create({ model: 'claude-sonnet-5-5', messages: [] });
    await traceLlm(tracer, { model: 'claude-haiku-5-5', name: 'REVIEW' }, async () => ({ content: [] }));
  });
  const llms = normalize(payload()).steps.filter((s) => s.type === 'llm_call') as any[];
  assert.deepEqual(llms.map((s) => s.name), ['PLAN', 'DEVELOP#2', undefined, 'REVIEW']);
  assert.deepEqual(llms.map((s) => s.model), ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
});
