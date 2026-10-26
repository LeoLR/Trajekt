import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, diffTrajectories, computeMetrics } from '../src/index.js';
import { otlpPayload, otlpSpan, langfuseTrace, type SpanSpec } from './fixtures.js';

const llm = (spanId: string, startMs: number, name?: string, error?: string) => {
  const attrs: SpanSpec['attrs'] = { 'gen_ai.request.model': { stringValue: 'sonnet' } };
  if (name) attrs['trajekt.step.name'] = { stringValue: name };
  return otlpSpan('f1', { spanId, name: 'chat sonnet', startMs, endMs: startMs + 1, attrs, error });
};

test('diff : les appels LLM nommés s’alignent sur leur nom quand les deux runs nomment', () => {
  const a = normalize(otlpPayload([llm('a1', 0, 'PLAN'), llm('a2', 2, 'DEVELOP'), llm('a3', 4, 'REVIEW')]));
  const b = normalize(otlpPayload([llm('b1', 0, 'PLAN'), llm('b2', 2, 'REVIEW')]));
  const d = diffTrajectories(a, b);
  assert.deepEqual(d.rows.map((r) => r.mark), ['=', '−', '=']);
  assert.equal((d.rows[1].a as any).name, 'DEVELOP');
});

test('diff : un run nommé contre un run sans noms reste aligné sur les appels LLM', () => {
  const a = normalize(otlpPayload([llm('a1', 0), llm('a2', 2)]));
  const b = normalize(otlpPayload([llm('b1', 0, 'PLAN'), llm('b2', 2, 'DEVELOP')]));
  assert.deepEqual(diffTrajectories(a, b).rows.map((r) => r.mark), ['=', '=']);
});

test('retries : un appel LLM en échec suivi d’une autre phase du même modèle n’est pas un retry', () => {
  const other = computeMetrics(normalize(otlpPayload([llm('c1', 0, 'PLAN', 'overloaded'), llm('c2', 2, 'DEVELOP')])));
  const same = computeMetrics(normalize(otlpPayload([llm('d1', 0, 'PLAN', 'overloaded'), llm('d2', 2, 'PLAN')])));
  assert.equal(other.retryCount, 0);
  assert.equal(same.retryCount, 1);
});

test('Langfuse : le nom choisi d’une génération devient le nom du step, pas les noms par défaut des SDK', () => {
  const withName = (name: string, metadata?: unknown) => {
    const t: any = structuredClone(langfuseTrace());
    const gen = t.observations.find((o: any) => o.type === 'GENERATION');
    gen.name = name;
    if (metadata) gen.metadata = metadata;
    return (normalize(t).steps.find((s) => s.type === 'llm_call') as any).name;
  };
  assert.equal(withName('plan'), 'plan');
  assert.equal(withName('gpt-4o'), undefined, 'le nom du modèle');
  for (const generic of ['generation', 'ChatOpenAI', 'ChatAnthropic', 'OpenAI-generation', 'litellm-completion', 'chat']) {
    assert.equal(withName(generic), undefined, generic);
  }
  assert.equal(withName('ChatOpenAI', { 'trajekt.step.name': 'QA' }), 'QA', 'metadata explicite');
});
