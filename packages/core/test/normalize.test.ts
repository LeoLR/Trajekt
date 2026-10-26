import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, normalizeAll, mergeTrajectories, computeMetrics, diffTrajectories } from '../src/index.js';
import { otlpPayload, otlpSpan, sentryRun, langfuseTrace, toolAttrs, type SpanSpec } from './fixtures.js';

test('OTLP : identité de l’agent lue sur la racine puis la ressource', () => {
  const [t] = normalizeAll(otlpPayload(sentryRun()));
  assert.equal(t.metadata.traceId, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assert.equal(t.metadata.agentName, 'sentry-triage');
  assert.equal(t.metadata.appVersion, '1.4.0'); // service.version
  assert.equal(t.metadata.agentVersion, undefined); // pas de version d'agent explicite
  assert.equal(t.metadata.sourceFormat, 'otlp');
  assert.equal(t.steps.length, 5);
  // tri chronologique : la racine (qui commence en premier) passe devant
  assert.equal(t.steps[0].type, 'custom');
  assert.deepEqual(
    t.steps.filter((s) => s.type === 'tool_call').map((s) => (s as any).name),
    ['sentry.getIssue', 'jira.createIssue', 'slack.postMessage'],
  );
  const tool = t.steps.find((s) => s.type === 'tool_call') as any;
  assert.deepEqual(tool.args, { id: 'PAY-1' }); // JSON des arguments décodé
  const llm = t.steps.find((s) => s.type === 'llm_call') as any;
  assert.equal(llm.model, 'claude-sonnet-4-5');
  assert.deepEqual(llm.usage, { inputTokens: 2000, outputTokens: 300 });
});

test('OTLP : trajekt.step.name nomme un appel LLM, le modèle reste lu', () => {
  const span = (spanId: string, attrs: SpanSpec['attrs']) => otlpSpan('f0', { spanId, name: 'span', startMs: 0, endMs: 1, attrs });
  const t = normalize(otlpPayload([
    span('a1', { 'gen_ai.request.model': { stringValue: 'sonnet' }, 'trajekt.step.name': { stringValue: 'DEVELOP#2' } }),
    span('a2', { 'gen_ai.request.model': { stringValue: 'sonnet' } }),
  ]));
  const [named, plain] = t.steps as any[];
  assert.equal(named.name, 'DEVELOP#2');
  assert.equal(named.model, 'sonnet');
  assert.equal('name' in plain, false); // sans l'attribut : rien ne change
});

test('OTLP : un payload multi-traces donne une trajectoire par traceId', () => {
  const a = sentryRun('aaaa');
  const b = sentryRun('bbbb');
  const out = normalizeAll(otlpPayload([...a, ...b]));
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((t) => t.metadata.traceId).sort(), ['aaaa', 'bbbb']);
});

test('OTLP : statut ERROR et événement exception deviennent des erreurs de step', () => {
  const tid = 'cccc';
  const out = normalize(
    otlpPayload([
      otlpSpan(tid, { spanId: 'x', name: 'execute_tool a', startMs: 1, endMs: 2, attrs: toolAttrs('a'), error: 'HTTP 429' }),
      otlpSpan(tid, { spanId: 'y', name: 'execute_tool b', startMs: 3, endMs: 4, attrs: toolAttrs('b'), exception: 'boom' }),
    ]),
  );
  assert.equal((out.steps[0] as any).error, 'HTTP 429');
  assert.equal((out.steps[1] as any).error, 'boom');
});

test('OTLP : service.name par défaut du SDK ignoré, gen_ai.agent.name prioritaire', () => {
  const tid = 'dddd';
  const out = normalize(
    otlpPayload(
      [otlpSpan(tid, { spanId: 'r', name: 'chat', startMs: 1, endMs: 2, attrs: { 'gen_ai.request.model': { stringValue: 'gpt-4o' } } })],
      { 'service.name': 'unknown_service:node' },
    ),
  );
  assert.equal(out.metadata.agentName, undefined);
});

test('OTLP : spans Vercel AI SDK (ai.*) reconnus', () => {
  const tid = 'eeee';
  const out = normalize(
    otlpPayload([
      otlpSpan(tid, { spanId: 'p', name: 'ai.generateText', startMs: 0, endMs: 100, attrs: { 'ai.model.id': { stringValue: 'gpt-4o-mini' }, 'ai.telemetry.functionId': { stringValue: 'checkout-agent' } } }),
      otlpSpan(tid, { spanId: 'c', parentSpanId: 'p', name: 'ai.generateText.doGenerate', startMs: 1, endMs: 90, attrs: { 'ai.model.id': { stringValue: 'gpt-4o-mini' }, 'ai.usage.promptTokens': { intValue: '50' }, 'ai.usage.completionTokens': { intValue: '10' }, 'ai.response.text': { stringValue: 'ok' } } }),
      otlpSpan(tid, { spanId: 't', parentSpanId: 'p', name: 'ai.toolCall', startMs: 91, endMs: 95, attrs: { 'ai.toolCall.name': { stringValue: 'getWeather' }, 'ai.toolCall.args': { stringValue: '{"city":"Nantes"}' } } }),
    ]),
  );
  assert.equal(out.metadata.agentName, 'checkout-agent');
  const types = out.steps.map((s) => s.type);
  assert.deepEqual(types, ['custom', 'llm_call', 'tool_call']); // le parent n'est pas compté comme appel LLM
  assert.deepEqual((out.steps[2] as any).args, { city: 'Nantes' });
});

test('Langfuse : identité, niveau ERROR, statusMessage informatif ignoré', () => {
  const t = normalize(langfuseTrace());
  assert.equal(t.metadata.agentName, 'support-bot');
  assert.equal(t.metadata.agentVersion, 'v2.1.0');
  assert.equal(t.metadata.promptVersion, '7');
  assert.equal(t.metadata.environment, 'production');
  assert.equal(t.metadata.traceId, 'lf-trace-1');
  assert.deepEqual(t.steps.map((s) => s.type), ['llm_call', 'tool_call', 'tool_call', 'custom']);
  assert.equal((t.steps[2] as any).error, 'refund API 500');
  assert.equal((t.steps[3] as any).error, undefined);
  assert.equal(t.steps[1].parentId, 'o1');
});

test('Fusion : une trace en deux lots = un seul run, sans doublon, idempotente', () => {
  const spans = sentryRun();
  const [first] = normalizeAll(otlpPayload(spans.slice(0, 3)));
  const [second] = normalizeAll(otlpPayload(spans.slice(2))); // s3 envoyé deux fois
  const merged = mergeTrajectories(first, second);
  assert.equal(merged.steps.length, 5);
  assert.deepEqual(merged.steps.map((s) => s.index), [0, 1, 2, 3, 4]);
  assert.equal(merged.steps[0].id, 'root');
  const again = mergeTrajectories(merged, second);
  assert.equal(again.steps.length, 5);
  // Avant la racine, le run est vu "en cours" ; après, sa durée est complète.
  assert.equal(computeMetrics(first).durationMs, 2990);
  assert.equal(computeMetrics(merged).durationMs, 3300);
});

test('OTLP : messages du prompt et réponse lus quand l’instrumentation les capture', () => {
  const tid = 'msg';
  const t = normalize(otlpPayload([
    otlpSpan(tid, { spanId: 'a', name: 'chat', startMs: 1, endMs: 2, attrs: {
      'gen_ai.request.model': { stringValue: 'gpt-4o' },
      'gen_ai.input.messages': { stringValue: JSON.stringify([{ role: 'system', parts: [{ type: 'text', content: 'You triage bugs.' }] }, { role: 'user', parts: [{ type: 'text', content: 'NPE in payment.ts' }] }]) },
      'gen_ai.output.messages': { stringValue: JSON.stringify([{ role: 'assistant', parts: [{ type: 'text', content: 'Create a ticket.' }] }]) },
    } }),
    otlpSpan(tid, { spanId: 'b', name: 'ai.generateText.doGenerate', startMs: 3, endMs: 4, attrs: {
      'ai.model.id': { stringValue: 'gpt-4o-mini' },
      'ai.prompt.messages': { stringValue: JSON.stringify([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]) },
      'ai.response.text': { stringValue: 'hi' },
    } }),
  ]));
  const [a, b] = t.steps as any[];
  assert.deepEqual(a.input.map((m: any) => [m.role, m.content]), [['system', 'You triage bugs.'], ['user', 'NPE in payment.ts']]);
  assert.equal(a.output.content, 'Create a ticket.');
  assert.deepEqual(b.input.map((m: any) => m.content), ['hello']);
  assert.equal(b.output.content, 'hi');
});

test('diff : alignement step par step, marqueurs = ≠ + −', () => {
  const tid = 'diff';
  const mk = (specs: Array<[string, unknown, string?]>) => normalize(otlpPayload(specs.map(([name, args, error], i) =>
    otlpSpan(tid, { spanId: String(i), name: 't', startMs: i * 10, endMs: i * 10 + 5, attrs: name === 'llm' ? { 'gen_ai.request.model': { stringValue: 'm' } } : toolAttrs(name, args), error }),
  )));
  const a = mk([['sentry', { id: 1 }], ['llm', undefined], ['search', { q: 'x' }], ['jira', { p: 1 }], ['slack', {}]]);
  const b = mk([['sentry', { id: 1 }], ['llm', undefined], ['search', { q: 'x' }], ['llm', undefined], ['search', { q: 'x' }], ['jira', { p: 2 }], ['mr', {}, '422']]);
  const d = diffTrajectories(a, b);
  assert.deepEqual(d.rows.map((r) => r.mark), ['=', '=', '=', '+', '+', '≠', '−', '+']);
  assert.deepEqual(d.rows[5].changes, ['args']);
  assert.deepEqual(d.counts, { '=': 3, '≠': 1, '+': 3, '−': 1 });
  assert.equal(d.b.status, 'error');
});

test('AI SDK : modèle lu dans response.modelId (permet l’estimation du coût)', () => {
  const t = normalize({ steps: [{ text: 'ok', usage: { promptTokens: 1e6, completionTokens: 0 }, response: { modelId: 'gpt-4o-mini' }, toolCalls: [] }] });
  assert.equal((t.steps[0] as any).model, 'gpt-4o-mini');
  assert.equal(computeMetrics(t).costUsd, 0.15);
});

test('OTLP : version d’appli distincte de la version d’agent', () => {
  const tid = 'appv';
  const sv = (stringValue: string) => ({ stringValue });
  // service.version seul : version d'appli ; la version d'agent reste vide
  // (le stockage la fait retomber sur la version d'appli)
  const a = normalize(otlpPayload([otlpSpan(tid, { spanId: 'r', name: 'agent', startMs: 0, endMs: 1 })], { 'service.name': 'checkout', 'service.version': '3.2.0' }));
  assert.equal(a.metadata.appVersion, '3.2.0');
  assert.equal(a.metadata.agentVersion, undefined);
  // version d'agent et de prompt explicites sur le span racine
  const b = normalize(otlpPayload([otlpSpan(tid, { spanId: 'r', name: 'agent', startMs: 0, endMs: 1, attrs: {
    'trajekt.agent.version': sv('1.5.0'), 'trajekt.prompt.version': sv('v8'),
  } })], { 'service.name': 'checkout', 'service.version': '3.2.0' }));
  assert.equal(b.metadata.appVersion, '3.2.0');
  assert.equal(b.metadata.agentVersion, '1.5.0');
  assert.equal(b.metadata.promptVersion, 'v8');
  // Langfuse : release = appli, version = agent
  const lf = normalize({ ...langfuseTrace(), release: 'web-3.2.0', version: '1.5.0' });
  assert.equal(lf.metadata.appVersion, 'web-3.2.0');
  assert.equal(lf.metadata.agentVersion, '1.5.0');
});

test('Fusion : un lot sans racine n’écrase pas la version d’agent portée par la racine', () => {
  const spans = sentryRun('ffff');
  const root = spans[spans.length - 1];
  root.attributes.push({ key: 'trajekt.agent.version', value: { stringValue: '1.5.0' } as any });
  const [withRoot] = normalizeAll(otlpPayload([root]));
  const [children] = normalizeAll(otlpPayload(spans.slice(0, 2))); // arrive APRÈS la racine
  const merged = mergeTrajectories(withRoot, children);
  assert.equal(merged.metadata.agentVersion, '1.5.0');
  assert.equal(merged.metadata.appVersion, '1.4.0');
});
