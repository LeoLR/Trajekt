import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annotateSteps,
  normalize,
  normalizeAll,
  computeMetrics,
  estimateCostUsd,
  setPricing,
  DEFAULT_PRICING,
  NO_TOOL_PATH,
  type Trajectory,
} from '../src/index.js';
import { otlpPayload, otlpSpan, sentryRun, langfuseTrace, toolAttrs, llmAttrs } from './fixtures.js';

test('métriques du run de référence', () => {
  const [t] = normalizeAll(otlpPayload(sentryRun()));
  const m = computeMetrics(t);
  assert.equal(m.status, 'ok');
  assert.equal(m.startedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(m.durationMs, 3300);
  assert.equal(m.stepCount, 5);
  assert.equal(m.llmCallCount, 1);
  assert.equal(m.toolCallCount, 3);
  assert.equal(m.inputTokens, 2000);
  assert.equal(m.outputTokens, 300);
  // claude-sonnet-4 : 3 $ / 15 $ par million → 0.006 + 0.0045
  assert.equal(m.costUsd, 0.0105);
  assert.equal(m.costEstimated, true);
  assert.equal(m.pathSignature, 'sentry.getIssue → jira.createIssue → slack.postMessage');
  assert.equal(m.primaryModel, 'claude-sonnet-4-5');
  assert.equal(m.redundantToolCalls, 0);
});

test('boucle : même outil + mêmes arguments compté, arguments différents non', () => {
  const tid = 'loop';
  const t = normalize(
    otlpPayload([
      otlpSpan(tid, { spanId: '1', name: 't', startMs: 1, endMs: 2, attrs: toolAttrs('gitlab.searchCode', { q: 'payment', page: 1 }) }),
      otlpSpan(tid, { spanId: '2', name: 't', startMs: 3, endMs: 4, attrs: toolAttrs('gitlab.readFile', { path: 'a.ts' }) }),
      otlpSpan(tid, { spanId: '3', name: 't', startMs: 5, endMs: 6, attrs: toolAttrs('gitlab.searchCode', { page: 1, q: 'payment' }) }), // clés dans un autre ordre
      otlpSpan(tid, { spanId: '4', name: 't', startMs: 7, endMs: 8, attrs: toolAttrs('gitlab.searchCode', { q: 'payment', page: 2 }) }),
      otlpSpan(tid, { spanId: '5', name: 't', startMs: 9, endMs: 10, attrs: toolAttrs('gitlab.searchCode') }), // sans arguments : on ne conclut rien
    ]),
  );
  const m = computeMetrics(t);
  assert.equal(m.redundantToolCalls, 1);
  assert.deepEqual(m.toolPath, ['gitlab.searchCode', 'gitlab.readFile', 'gitlab.searchCode ×3']);
});

test('retry : un step identique juste après un échec', () => {
  const tid = 'retry';
  const t = normalize(
    otlpPayload([
      otlpSpan(tid, { spanId: '1', parentSpanId: 'r', name: 't', startMs: 1, endMs: 2, attrs: toolAttrs('jira.createIssue', { a: 1 }), error: '429' }),
      otlpSpan(tid, { spanId: '2', parentSpanId: 'r', name: 't', startMs: 3, endMs: 4, attrs: toolAttrs('jira.createIssue', { a: 1 }), error: '429' }),
      otlpSpan(tid, { spanId: '3', parentSpanId: 'r', name: 't', startMs: 5, endMs: 6, attrs: toolAttrs('jira.createIssue', { a: 1 }) }),
      otlpSpan(tid, { spanId: 'r', name: 'agent', startMs: 0, endMs: 7 }),
    ]),
  );
  const m = computeMetrics(t);
  assert.equal(m.retryCount, 2);
  assert.equal(m.redundantToolCalls, 0); // relancer après un échec n'est pas boucler
  assert.equal(m.toolErrorCount, 2);
  assert.equal(m.errorCount, 2);
  assert.equal(m.status, 'ok'); // racine saine : les erreurs ont été rattrapées
  assert.equal(m.pathSignature, 'jira.createIssue');
});

test('statut : racine en erreur = run en échec', () => {
  const tid = 'fail';
  const t = normalize(
    otlpPayload([
      otlpSpan(tid, { spanId: 'r', name: 'agent', startMs: 0, endMs: 9, error: 'MR rejected: 422' }),
      otlpSpan(tid, { spanId: '1', parentSpanId: 'r', name: 't', startMs: 1, endMs: 2, attrs: toolAttrs('gitlab.createMergeRequest', {}), error: '422' }),
    ]),
  );
  assert.equal(computeMetrics(t).status, 'error');
});

test('statut sans arbre : le dernier step significatif décide', () => {
  const base: Omit<Trajectory, 'steps'> = { schemaVersion: 1, id: 'x', source: 'live', metadata: {} };
  const ok = computeMetrics({ ...base, steps: [
    { index: 0, type: 'tool_call', name: 'a', error: 'x' },
    { index: 1, type: 'tool_call', name: 'a' },
  ] });
  const ko = computeMetrics({ ...base, steps: [
    { index: 0, type: 'tool_call', name: 'a' },
    { index: 1, type: 'llm_call', input: [], error: 'context length exceeded' },
  ] });
  assert.equal(ok.status, 'ok');
  assert.equal(ko.status, 'error');
});

test('coût : celui de la source prime, estimation signalée, modèle inconnu = null', () => {
  const lf = computeMetrics(normalize(langfuseTrace()));
  assert.equal(lf.costUsd, 0.0012);
  assert.equal(lf.costEstimated, false);
  // pas de racine unique : le dernier step significatif (le remboursement en échec) décide
  assert.equal(lf.status, 'error');
});

test('coût : modèle inconnu → null ; surcharge de la table de prix', () => {
  const tid = 'cost';
  const t = normalize(otlpPayload([
    otlpSpan(tid, { spanId: '1', name: 'chat', startMs: 1, endMs: 2, attrs: llmAttrs('mon-modele-maison', 1000, 1000) }),
  ]));
  assert.equal(computeMetrics(t).costUsd, null);
  setPricing({ 'mon-modele': { input: 1, output: 2 } });
  assert.equal(computeMetrics(t).costUsd, 0.003);
  setPricing(DEFAULT_PRICING, true);
  assert.equal(computeMetrics(t).costUsd, null);
});

test('prix : préfixe le plus long et préfixe de fournisseur', () => {
  assert.equal(estimateCostUsd('gpt-4o-mini-2024-07-18', 1e6, 0), 0.15);
  assert.equal(estimateCostUsd('openai/gpt-4o', 1e6, 0), 2.5);
  assert.equal(estimateCostUsd('anthropic:claude-opus-4-1-20250805', 0, 1e6), 75);
  assert.equal(estimateCostUsd(undefined, 10, 10), undefined);
});

test('run sans outil', () => {
  const m = computeMetrics({ schemaVersion: 1, id: 'x', source: 'live', metadata: {}, steps: [] });
  assert.equal(m.pathSignature, NO_TOOL_PATH);
  assert.equal(m.costUsd, null);
  assert.equal(m.durationMs, undefined);
});

test('annotations : REPEAT #n, tentatives, erreurs', () => {
  const tid = 'ann';
  const t = normalize(otlpPayload([
    otlpSpan(tid, { spanId: '1', name: 't', startMs: 1, endMs: 2, attrs: toolAttrs('gitlab.searchCode', { q: 'x' }) }),
    otlpSpan(tid, { spanId: '2', name: 't', startMs: 3, endMs: 4, attrs: toolAttrs('jira.createIssue', { p: 1 }), error: '429' }),
    otlpSpan(tid, { spanId: '3', name: 't', startMs: 5, endMs: 6, attrs: toolAttrs('jira.createIssue', { p: 1 }), error: '429' }),
    otlpSpan(tid, { spanId: '4', name: 't', startMs: 7, endMs: 8, attrs: toolAttrs('jira.createIssue', { p: 1 }) }),
    otlpSpan(tid, { spanId: '5', name: 't', startMs: 9, endMs: 10, attrs: toolAttrs('gitlab.searchCode', { q: 'x' }) }),
  ]));
  const a = annotateSteps(t);
  assert.equal(a[0].repeatOf, undefined);
  assert.equal(a[1].error, '429');
  assert.equal(a[1].attempt, undefined);
  assert.equal(a[2].attempt, 2);
  assert.equal(a[3].attempt, 3);
  assert.equal(a[3].repeatOf, undefined); // retry, pas boucle
  assert.equal(a[4].repeatOf, 0);
  const m = computeMetrics(t);
  assert.equal(m.redundantToolCalls, a.filter((x) => x.repeatOf !== undefined).length);
  assert.equal(m.retryCount, a.filter((x) => x.attempt !== undefined).length);
});

test('chemin : répétition visible, relance ignorée', () => {
  const tid = 'path';
  const t = normalize(otlpPayload([
    otlpSpan(tid, { spanId: '1', name: 't', startMs: 1, endMs: 2, attrs: toolAttrs('search', { q: 1 }) }),
    otlpSpan(tid, { spanId: '2', name: 't', startMs: 3, endMs: 4, attrs: toolAttrs('search', { q: 1 }) }),
    otlpSpan(tid, { spanId: '3', name: 't', startMs: 5, endMs: 6, attrs: toolAttrs('jira', { a: 1 }), error: '429' }),
    otlpSpan(tid, { spanId: '4', name: 't', startMs: 7, endMs: 8, attrs: toolAttrs('jira', { a: 1 }) }),
  ]));
  assert.equal(computeMetrics(t).pathSignature, 'search ×2 → jira');
});
