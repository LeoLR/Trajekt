import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  assertTrajectory,
  checkTrajectory,
  compareScenarios,
  matchesPartially,
  normalize,
  scenarioRunOf,
  signedRankPValues,
  TrajectoryAssertionError,
  type ScenarioRun,
  type Trajectory,
  type TrajectoryStep,
} from '../src/index.js';
import { otlpPayload, otlpSpan } from './fixtures.js';

/* ---------------- Test des rangs signés ---------------- */

test('rangs signés : valeurs exactes de référence', () => {
  // 5 différences toutes positives : p = 1/32.
  const all = signedRankPValues([1, 2, 3, 4, 5]);
  assert.equal(all.pUp, 1 / 32);
  assert.equal(all.pDown, 1);
  // Symétrique, zéros écartés.
  const z = signedRankPValues([0, 0, -1, 1]);
  assert.equal(z.n, 2);
  assert.equal(z.pUp, 0.75);
  // Ex aequo : rangs moyens, la distribution reste valide (somme = 1).
  const t = signedRankPValues([2, 2, -2, 5]);
  assert.ok(t.pUp > 0 && t.pUp <= 1 && t.pDown > 0 && t.pDown <= 1);
});

test('rangs signés : approximation normale au-delà de 40', () => {
  const d = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? -1 : 1) * (i + 1));
  const r = signedRankPValues(d);
  assert.ok(r.pUp < 0.05, `pUp=${r.pUp}`);
});

/* ---------------- Comparaison de suites ---------------- */

function run(scenario: string, over: Partial<ScenarioRun> = {}): ScenarioRun {
  return {
    scenario, status: 'ok', durationMs: 10_000, costUsd: 0.04, stepCount: 9, totalTokens: 11_000,
    toolCalls: 5, toolErrors: 0, redundantToolCalls: 0, pathSignature: 'a → b → c', ...over,
  };
}

/** n scénarios, `repeats` runs chacun, échelle propre à chaque scénario. */
function suite(n: number, repeats: number, f: (i: number, k: number) => Partial<ScenarioRun> = () => ({})): ScenarioRun[] {
  const out: ScenarioRun[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < repeats; k++) {
      const scale = 1 + i * 0.7; // des scénarios de tailles très différentes
      const jitter = 1 + ((i * 7 + k * 3) % 5 - 2) * 0.02;
      out.push(run(`case-${String(i).padStart(2, '0')}`, {
        durationMs: 8_000 * scale * jitter, costUsd: 0.02 * scale * jitter,
        stepCount: Math.round(6 * scale), totalTokens: Math.round(6_000 * scale * jitter),
        ...f(i, k),
      }));
    }
  }
  return out;
}

test('suite identique : pass, aucune régression', () => {
  const a = suite(12, 3);
  const r = compareScenarios(a, a);
  assert.equal(r.paired, 12);
  assert.equal(r.result, 'pass');
  assert.ok(r.metrics.every((m) => m.verdict === 'stable'), JSON.stringify(r.metrics.map((m) => [m.metric, m.verdict])));
  assert.ok(r.scenarios.every((s) => s.verdict === 'stable'));
});

test('+30 % de coût sur chaque scénario : régression de suite, même avec 8 scénarios', () => {
  const a = suite(8, 3);
  const b = suite(8, 3).map((x) => ({ ...x, costUsd: x.costUsd! * 1.3, totalTokens: Math.round(x.totalTokens * 1.3) }));
  const r = compareScenarios(a, b);
  const cost = r.metrics.find((m) => m.metric === 'costUsd')!;
  assert.equal(cost.verdict, 'regression');
  assert.ok(Math.abs(cost.relDelta! - 0.3) < 0.01, `relDelta=${cost.relDelta}`);
  assert.equal(r.metrics.find((m) => m.metric === 'durationMs')!.verdict, 'stable');
  assert.equal(r.result, 'fail');
  assert.match(r.reasons.join('\n'), /Mean cost/);
});

test('un scénario qui se met à échouer fait échouer la suite, sans test statistique', () => {
  const a = suite(10, 3);
  const b = suite(10, 3, (i, k) => (i === 4 && k < 2 ? { status: 'error' } : {}));
  const r = compareScenarios(a, b);
  assert.equal(r.metrics.find((m) => m.metric === 'errorRate')!.verdict, 'stable'); // 1 scénario sur 10 : pas significatif
  assert.equal(r.result, 'fail');
  assert.equal(r.scenarios[0].scenario, 'case-04');
  assert.equal(r.scenarios[0].verdict, 'regression');
  assert.match(r.reasons[0], /case-04: 0\/3 → 2\/3 failed/);
});

test('scénario : changement de chemin signalé, mais pas compté comme pire', () => {
  const a = suite(6, 2);
  const b = suite(6, 2, (i) => (i === 2 ? { pathSignature: 'a → b ×2 → c' } : {}));
  const r = compareScenarios(a, b);
  const s = r.scenarios.find((x) => x.scenario === 'case-02')!;
  assert.equal(s.verdict, 'changed');
  assert.equal(s.changes[0].detail, 'was a → b → c · now a → b ×2 → c');
  assert.equal(r.result, 'pass');
});

test('amélioration reconnue, et scénarios non appariés listés', () => {
  const a = suite(8, 2);
  const b = suite(8, 2)
    .map((x) => ({ ...x, stepCount: Math.round(x.stepCount * 0.6), durationMs: x.durationMs! * 0.6 }))
    .concat([run('brand-new')]);
  const r = compareScenarios(a.concat([run('removed')]), b);
  assert.equal(r.metrics.find((m) => m.metric === 'durationMs')!.verdict, 'improvement');
  assert.deepEqual(r.onlyBaseline, ['removed']);
  assert.deepEqual(r.onlyCurrent, ['brand-new']);
  assert.equal(r.result, 'pass');
});

test('trop peu de scénarios : insuffisant, mais les scénarios restent comparés', () => {
  const r = compareScenarios(suite(3, 3), suite(3, 3, () => ({ costUsd: 1 })));
  assert.ok(r.metrics.every((m) => m.verdict === 'insufficient'));
  assert.ok(r.scenarios.every((s) => s.changes.some((c) => c.metric === 'costUsd' && c.direction === 'worse')));
});

/* ---------------- Assertions ---------------- */

let ix = 0;
function traj(steps: Array<Omit<TrajectoryStep, 'index'>>, scenario?: string): Trajectory {
  ix = 0;
  return {
    schemaVersion: SCHEMA_VERSION, id: 't', source: 'simulation',
    steps: steps.map((s) => ({ ...s, index: ix++ }) as TrajectoryStep),
    metadata: { agentName: 'sentry-triage', scenario: scenario ? { name: scenario } : undefined },
  };
}

const good = traj([
  { type: 'llm_call', model: 'gpt-4.1-mini', input: [], usage: { inputTokens: 1000, outputTokens: 100 }, costUsd: 0.01, durationMs: 1000 },
  { type: 'tool_call', name: 'sentry.getIssue', args: { id: 'PAY-1' }, result: { id: 'PAY-1' }, durationMs: 200 },
  { type: 'tool_call', name: 'gitlab.readFile', args: '{"path":"checkout.ts"}', durationMs: 200 },
  { type: 'tool_call', name: 'jira.createIssue', args: { project: 'PAY', fields: { priority: 'High', labels: ['bot'] } }, durationMs: 300 },
], 'npe-checkout');

test('assertions : un run conforme passe et renvoie ses métriques', () => {
  const m = assertTrajectory(good, {
    status: 'ok',
    calls: ['sentry.getIssue', 'jira.createIssue'],
    notCalls: ['gitlab.createMergeRequest'],
    order: ['sentry.getIssue', 'gitlab.readFile', 'jira.createIssue'],
    calledWith: [
      { tool: 'jira.createIssue', args: { project: 'PAY', fields: { priority: 'High' } } },
      { tool: 'gitlab.readFile', args: { path: 'checkout.ts' } }, // arguments sérialisés en JSON : relus
    ],
    maxSteps: 4, maxCostUsd: 0.02, maxRepeatedToolCalls: 0, maxCallsPerTool: { 'sentry.getIssue': 1 },
  });
  assert.equal(m.toolCallCount, 3);
});

test('assertions : chaque écart est décrit', () => {
  const failures = checkTrajectory(good, {
    calls: ['slack.postMessage'],
    notCalls: ['gitlab.readFile'],
    order: ['jira.createIssue', 'sentry.getIssue'],
    calledWith: [{ tool: 'jira.createIssue', args: { project: 'OPS' } }],
    maxSteps: 2,
    maxCostUsd: 0.001,
  });
  assert.deepEqual(failures.map((f) => f.rule), ['calls', 'notCalls', 'order', 'calledWith', 'maxSteps', 'maxCostUsd']);
  assert.match(failures[0].message, /slack.postMessage was never called/);
  assert.match(failures[3].message, /got \{"project":"PAY"/);
  assert.match(failures[5].message, /cost: \$0\.0100, expected at most \$0\.0010/);
});

test('assertions : l\'erreur levée liste tout et le chemin d\'outils', () => {
  const bad = traj([{ type: 'tool_call', name: 'jira.createIssue', args: {}, error: '429 Too Many Requests' }]);
  assert.throws(
    () => assertTrajectory(bad, { status: 'ok', calls: ['sentry.getIssue'] }),
    (e: unknown) => e instanceof TrajectoryAssertionError
      && e.failures.length === 2
      && /run failed, expected success \(step #1: 429 Too Many Requests\)/.test(e.message)
      && /tool path: jira.createIssue/.test(e.message),
  );
});

test('matchesPartially : objets partiels, tableaux exacts', () => {
  assert.ok(matchesPartially({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } }));
  assert.ok(!matchesPartially({ a: [1, 2] }, { a: [1] }));
  assert.ok(!matchesPartially(null, { a: 1 }));
});

/* ---------------- Scénario dans les traces ---------------- */

test('le scénario est lu depuis les traces OTLP (span ou ressource) et Langfuse', () => {
  const t = normalize(otlpPayload([
    otlpSpan('t1', { spanId: 'r', name: 'invoke_agent', startMs: 0, endMs: 10, attrs: { 'trajekt.scenario': { stringValue: 'npe-checkout' } } }),
  ]));
  assert.equal(t.metadata.scenario?.name, 'npe-checkout');
  const t2 = normalize(otlpPayload(
    [otlpSpan('t2', { spanId: 'r', name: 'invoke_agent', startMs: 0, endMs: 10 })],
    { 'service.name': 'sentry-triage', 'trajekt.scenario': 'rate-limit' },
  ));
  assert.equal(scenarioRunOf(t2).scenario, 'rate-limit');
  const lf = normalize({ id: 'lf', name: 'support-bot', metadata: { scenario: 'refund' }, observations: [] });
  assert.equal(lf.metadata.scenario?.name, 'refund');
  const none = normalize(otlpPayload([otlpSpan('t3', { spanId: 'r', name: 'x', startMs: 0, endMs: 1 })]));
  assert.throws(() => scenarioRunOf(none), /no scenario/);
});

/* ---------------- Scores ---------------- */

test('scores : lus dans OTLP (trajekt.score.*) et Langfuse, cumulés à la fusion', async () => {
  const { mergeTrajectories } = await import('../src/index.js');
  const a = normalize(otlpPayload([
    otlpSpan('s1', { spanId: 'r', name: 'invoke_agent', startMs: 0, endMs: 10, attrs: { 'trajekt.score.correct': { doubleValue: 1 }, 'trajekt.score.helpful': { stringValue: '0.5' } } }),
  ]));
  assert.deepEqual(a.metadata.scores, { correct: 1, helpful: 0.5 });
  const b = normalize(otlpPayload([otlpSpan('s1', { spanId: 'c', parentSpanId: 'r', name: 'x', startMs: 1, endMs: 2, attrs: { 'trajekt.score.judge': { intValue: '0' } } })]));
  assert.deepEqual(mergeTrajectories(a, b).metadata.scores, { correct: 1, helpful: 0.5, judge: 0 });
  const lf = normalize({ id: 'lf2', name: 'support-bot', scores: [{ name: 'helpful', value: 1 }, { name: 'label', value: 'good' }, { name: 'ok', value: true }], observations: [] });
  assert.deepEqual(lf.metadata.scores, { helpful: 1, ok: 1 });
});

test('scores : une baisse de qualité fait échouer la suite, même si le coût baisse', () => {
  const a = suite(10, 3, () => ({ scores: { correct: 1 } }));
  // B est 20 % moins cher… mais se trompe sur 3 scénarios.
  const b = suite(10, 3, (i, k) => ({ costUsd: 0.016 * (1 + i * 0.7), scores: { correct: i < 3 && k < 2 ? 0 : 1 } }));
  const r = compareScenarios(a, b);
  assert.equal(r.metrics[0].metric, 'score:correct', 'les scores viennent en premier');
  assert.equal(r.metrics[0].label, 'Score · correct');
  assert.equal(r.result, 'fail');
  assert.ok(r.reasons.some((x) => x === 'case-00: Score · correct 1.00 → 0.33'), r.reasons.join(' | '));
  const s0 = r.scenarios.find((s) => s.scenario === 'case-00')!;
  assert.ok(s0.changes.some((c) => c.metric === 'score:correct' && c.direction === 'worse'));
});

test('scores en prod : compareWindows compare chaque score présent des deux côtés', async () => {
  const { compareWindows } = await import('../src/index.js');
  const mom = (n: number, mean: number, stddev: number) => ({ n, mean, stddev });
  const base = { runs: 200, errorRuns: 4, toolCalls: 1000, toolErrors: 10, durationMs: mom(200, 10, 2), costUsd: mom(200, 0.04, 0.01), stepCount: mom(200, 9, 1), totalTokens: mom(200, 11000, 1500), redundantToolCalls: mom(200, 0, 0), paths: { a: 200 } };
  const r = compareWindows(
    { ...base, scores: { correct: mom(150, 0.95, 0.2), helpful: mom(100, 0.8, 0.4) } },
    { ...base, scores: { correct: mom(150, 0.78, 0.4) } },
  );
  const sc = r.find((c) => c.metric === 'score:correct')!;
  assert.equal(sc.verdict, 'regression');
  assert.equal(sc.severity, 'critical');
  assert.equal(r.find((c) => c.metric === 'score:helpful'), undefined, 'absent d’un côté : pas comparé');
});

test('scoreTrajectory : part des attentes respectées', async () => {
  const { scoreTrajectory } = await import('../src/index.js');
  const r = scoreTrajectory(good, { status: 'ok', calls: ['sentry.getIssue', 'slack.postMessage'], maxSteps: 2, maxCostUsd: 1 });
  assert.equal(r.total, 5);
  assert.equal(r.passed, 3);
  assert.equal(r.score, 0.6);
});
