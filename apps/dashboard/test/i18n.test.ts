import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareScenarios, type ScenarioRun } from '@trajekt/core';
import { coreLabel, coreText, metricName, pickLang, relativeTime, scopeText } from '../src/lib/i18n';

test('i18n : langue depuis le cookie, sinon Accept-Language', () => {
  assert.equal(pickLang('fr', 'en-US'), 'fr');
  assert.equal(pickLang(undefined, 'fr-FR,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(pickLang(undefined, 'de-DE,en;q=0.5'), 'en');
  assert.equal(pickLang('xx', null), 'en');
});

test('i18n : libellés et détails de @trajekt/core traduits', () => {
  assert.equal(metricName('errorRate', 'fr'), 'Runs en échec');
  assert.equal(metricName('score:correct', 'fr'), 'Score · correct');
  assert.equal(coreLabel('Fails more often', 'fr'), 'Échoue plus souvent');
  assert.equal(coreText('12 vs 30 runs — need at least 20 on each side', 'fr'), '12 contre 30 runs — il en faut au moins 20 de chaque côté');
  assert.equal(coreText('Not significant once corrected for the 9 metrics tested at once (p = 0.031)', 'fr'),
    'Non significatif une fois corrigé pour les 9 métriques testées en même temps (p = 0.031)');
  assert.equal(coreText('npe-checkout: 0/3 → 2/3 failed', 'fr'), 'npe-checkout : 0/3 → 2/3 en échec');
  assert.equal(coreText('Mean cost regressed across the suite', 'fr'), 'Coût moyen : régression sur l’ensemble de la suite');
  assert.equal(scopeText('last 24 h vs previous 7 days', 'fr'), 'dernières 24 h vs 7 jours précédents');
  assert.equal(scopeText('1.5.0 vs 1.4.0', 'fr'), '1.5.0 vs 1.4.0');
  assert.equal(coreText('anything else', 'en'), 'anything else');
  assert.equal(relativeTime('2026-01-01T10:00:00Z', new Date('2026-01-01T13:00:00Z'), 'fr'), 'il y a 3 h');
});

test('i18n : toutes les raisons d’échec d’une suite réelle sont traduites', () => {
  const run = (scenario: string, status: 'ok' | 'error', correct: number, cost: number): ScenarioRun => ({
    scenario, status, durationMs: 1000, costUsd: cost, stepCount: 5, totalTokens: 1000, toolCalls: 3, toolErrors: 0,
    redundantToolCalls: 0, pathSignature: 'a → b', scores: { correct },
  });
  const names = Array.from({ length: 10 }, (_, i) => `s${i}`);
  const a = names.flatMap((n) => [run(n, 'ok', 1, 0.01), run(n, 'ok', 1, 0.01), run(n, 'ok', 1, 0.01)]);
  const b = names.flatMap((n, i) => [run(n, i < 2 ? 'error' : 'ok', i < 3 ? 0 : 1, 0.02), run(n, i < 2 ? 'error' : 'ok', i < 3 ? 0 : 1, 0.02), run(n, 'ok', 1, 0.02)]);
  const r = compareScenarios(a, b);
  assert.equal(r.result, 'fail');
  assert.ok(r.reasons.length > 0);
  for (const reason of r.reasons) assert.notEqual(coreText(reason, 'fr'), reason, `non traduit : ${reason}`);
  for (const s of r.scenarios) for (const c of s.changes) {
    if (c.detail) assert.notEqual(coreText(c.detail, 'fr'), c.detail, `détail non traduit : ${c.detail}`);
  }
});
