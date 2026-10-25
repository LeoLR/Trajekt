import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareWindows, regressionsOnly, normalCdf, type WindowStats, type Moments } from '../src/index.js';

const m = (n: number, mean: number, stddev: number): Moments => ({ n, mean, stddev });

function stats(over: Partial<WindowStats> = {}): WindowStats {
  return {
    runs: 200,
    errorRuns: 6,
    toolCalls: 800,
    toolErrors: 16,
    durationMs: m(200, 12000, 3000),
    costUsd: m(200, 0.08, 0.02),
    stepCount: m(200, 12, 2),
    totalTokens: m(200, 18000, 4000),
    redundantToolCalls: m(200, 0.1, 0.3),
    paths: { 'sentry → jira → slack': 180, 'sentry → slack': 20 },
    ...over,
  };
}

const byMetric = (cs: ReturnType<typeof compareWindows>) =>
  Object.fromEntries(cs.map((c) => [c.metric, c]));

test('loi normale : valeurs de référence', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-2.326) - 0.01) < 1e-3);
});

test('deux fenêtres identiques : aucune régression', () => {
  const cs = compareWindows(stats(), stats());
  assert.equal(regressionsOnly(cs).length, 0);
  assert.ok(cs.every((c) => c.verdict === 'stable'));
});

test('la régression de la v1.5 est détectée sur les bonnes métriques', () => {
  const current = stats({
    errorRuns: 30, // 3 % → 15 %
    stepCount: m(200, 16, 3), // +33 %
    costUsd: m(200, 0.16, 0.04), // +100 %
    redundantToolCalls: m(200, 1.4, 0.8),
    paths: { 'sentry → gitlab → gitlab → jira → slack': 150, 'sentry → jira → slack': 50 },
  });
  const r = byMetric(compareWindows(stats(), current));
  assert.equal(r.errorRate.verdict, 'regression');
  assert.equal(r.errorRate.severity, 'critical');
  assert.equal(r.stepCount.verdict, 'regression');
  assert.equal(r.stepCount.severity, 'warning');
  assert.equal(r.costUsd.severity, 'critical');
  assert.equal(r.redundantToolCalls.verdict, 'regression');
  assert.equal(r.newPathShare.verdict, 'regression');
  assert.equal(r.newPathShare.current, 0.75);
  assert.match(r.newPathShare.detail ?? '', /gitlab → gitlab/);
  assert.equal(r.durationMs.verdict, 'stable');
});

test('écart significatif mais minuscule : pas une alerte', () => {
  // +5 % de durée sur 5000 runs : statistiquement net, sans intérêt opérationnel
  const base = stats({ runs: 5000, durationMs: m(5000, 12000, 3000) });
  const cur = stats({ runs: 5000, durationMs: m(5000, 12600, 3000) });
  assert.equal(byMetric(compareWindows(base, cur)).durationMs.verdict, 'stable');
});

test('grosse hausse mais trop peu de runs : insuffisant', () => {
  const cur = stats({ runs: 8, errorRuns: 6, stepCount: m(8, 30, 2) });
  const r = byMetric(compareWindows(stats(), cur));
  assert.equal(r.errorRate.verdict, 'insufficient');
  assert.equal(r.stepCount.verdict, 'insufficient');
  assert.equal(r.newPathShare.verdict, 'insufficient');
});

test('bruit : hausse dans la variance, pas de régression', () => {
  const cur = stats({ costUsd: m(30, 0.095, 0.06) }); // +19 %, mais très dispersé sur 30 runs
  assert.equal(byMetric(compareWindows(stats(), cur)).costUsd.verdict, 'stable');
});

test('amélioration reconnue comme telle', () => {
  const cur = stats({ costUsd: m(200, 0.04, 0.01) });
  assert.equal(byMetric(compareWindows(stats(), cur)).costUsd.verdict, 'improvement');
});

test('base nulle : passer de 0 à des boucles est une régression critique', () => {
  const base = stats({ redundantToolCalls: m(200, 0, 0) });
  const cur = stats({ redundantToolCalls: m(200, 0.5, 0.7) });
  const r = byMetric(compareWindows(base, cur)).redundantToolCalls;
  assert.equal(r.verdict, 'regression');
  assert.equal(r.severity, 'critical');
  assert.equal(r.relDelta, null);
});

test('Holm : un verdict qui ne tient pas une fois corrigé redevient stable', async () => {
  const { holmAdjust } = await import('../src/index.js');
  const c = (metric: any, pValue: number | null, verdict: any) => ({ metric, label: metric, baseline: 1, current: 2, delta: 1, relDelta: 1, pValue, verdict });
  const out = holmAdjust([
    c('costUsd', 0.001, 'regression'),     // 0.001 ≤ 0.05/4 : tient
    c('durationMs', 0.02, 'regression'),   // 0.02 > 0.05/3 : tombe
    c('stepCount', 0.03, 'improvement'),   // après l'arrêt : tombe
    c('totalTokens', 0.5, 'stable'),
    c('newPathShare', null, 'regression'), // pas de p-valeur : inchangé
  ], 0.05);
  assert.deepEqual(out.map((x) => x.verdict), ['regression', 'stable', 'stable', 'stable', 'regression']);
  assert.match(out[1].detail!, /corrected for the 4 metrics/);
});
