/**
 * trajekt/core — Comparaison de suites d'évaluation.
 *
 * Pendant le développement d'un agent, on rejoue un jeu fixe de
 * scénarios (données et outils mockés) sur deux versions. Comme chaque
 * scénario est joué des deux côtés, on compare scénario par scénario
 * (test apparié), bien plus sensible qu'une comparaison de moyennes :
 * quinze scénarios suffisent là où la prod demande des centaines de runs.
 *
 *   - Niveau suite : test des rangs signés de Wilcoxon (exact jusqu'à
 *     40 scénarios), unilatéral, plus un écart minimum en valeur.
 *     Les métriques d'échelle (durée, coût, steps, tokens) sont comparées
 *     en rapport (log), pour qu'un gros scénario ne pèse pas plus qu'un petit.
 *   - Niveau scénario : quelques runs seulement, donc pas de test, des
 *     seuils francs (un scénario qui se met à échouer, +50 % de coût…).
 */

import type { Trajectory } from './trajectory.js';
import { computeMetrics } from './metrics.js';
import {
  METRIC_LABELS,
  normalCdf,
  type Comparison,
  type MetricKey,
  type Severity,
  type Verdict,
} from './regression.js';

/** Les métriques d'un run d'évaluation — ce que stocke le dashboard. */
export interface ScenarioRun {
  scenario: string;
  status: 'ok' | 'error';
  durationMs: number | null;
  costUsd: number | null;
  stepCount: number;
  totalTokens: number;
  toolCalls: number;
  toolErrors: number;
  redundantToolCalls: number;
  pathSignature: string;
}

export interface ScenarioAggregate {
  runs: number;
  failed: number;
  errorRate: number;
  toolErrorRate: number | null;
  durationMs: number | null;
  costUsd: number | null;
  stepCount: number;
  totalTokens: number;
  redundantToolCalls: number;
  /** Chemin d'outils le plus fréquent. */
  path: string;
  paths: Record<string, number>;
}

export interface ScenarioChange {
  metric: MetricKey;
  label: string;
  baseline: number | null;
  current: number | null;
  relDelta: number | null;
  /** « changed » : à regarder, sans être pire en soi (chemin d'outils). */
  direction: 'worse' | 'better' | 'changed';
  detail?: string;
}

export interface ScenarioDiff {
  scenario: string;
  baseline: ScenarioAggregate;
  current: ScenarioAggregate;
  changes: ScenarioChange[];
  verdict: 'regression' | 'improvement' | 'changed' | 'stable';
}

export interface SuiteComparison {
  /** Scénarios joués des deux côtés. */
  paired: number;
  onlyBaseline: string[];
  onlyCurrent: string[];
  /** Une comparaison par métrique, même forme que compareWindows. */
  metrics: Comparison[];
  /** Tous les scénarios appariés, les régressions d'abord. */
  scenarios: ScenarioDiff[];
  /** Verdict pour une CI : échec si une métrique de suite régresse ou si un scénario se met à échouer. */
  result: 'pass' | 'fail';
  reasons: string[];
}

export interface SuiteCompareOptions {
  /** Scénarios appariés minimum pour un verdict de suite (défaut 5). */
  minScenarios?: number;
  /** Seuil unilatéral (défaut 0.05). */
  alpha?: number;
  /** Hausse relative minimale d'une métrique d'échelle (défaut 0.15). */
  minRelIncrease?: number;
  /** Hausse minimale d'un taux, en moyenne sur les scénarios (défaut 0.05). */
  minRateIncrease?: number;
  /** Hausse relative qui signale un scénario (défaut 0.5 = +50 %). */
  scenarioRelIncrease?: number;
  /** Hausse du taux d'échec qui signale un scénario (défaut 0.5). */
  scenarioRateIncrease?: number;
}

/** Métriques d'un run tirées d'une trajectoire, pour comparer en local ou en CI. */
export function scenarioRunOf(t: Trajectory, scenario = t.metadata.scenario?.name): ScenarioRun {
  if (!scenario) throw new Error('This run has no scenario — set the trajekt.scenario attribute.');
  const m = computeMetrics(t);
  return {
    scenario,
    status: m.status,
    durationMs: m.durationMs ?? null,
    costUsd: m.costUsd,
    stepCount: m.stepCount,
    totalTokens: m.inputTokens + m.outputTokens,
    toolCalls: m.toolCallCount,
    toolErrors: m.toolErrorCount,
    redundantToolCalls: m.redundantToolCalls,
    pathSignature: m.pathSignature,
  };
}

/* ------------------------------------------------------------------ */
/* Test des rangs signés                                               */
/* ------------------------------------------------------------------ */

/**
 * p-valeurs unilatérales du test des rangs signés de Wilcoxon sur des
 * différences appariées : pUp pour « les différences sont positives »,
 * pDown pour l'inverse. Différences nulles écartées, ex aequo en rang moyen.
 */
export function signedRankPValues(diffs: number[]): { pUp: number; pDown: number; n: number } {
  const d = diffs.filter((x) => Number.isFinite(x) && Math.abs(x) > 1e-12);
  const n = d.length;
  if (n === 0) return { pUp: 1, pDown: 1, n };
  const order = d.map((x, i) => [Math.abs(x), i] as const).sort((a, b) => a[0] - b[0]);
  // Rangs doublés (entiers même avec des ex aequo).
  const rank2 = new Array<number>(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && Math.abs(order[j + 1][0] - order[i][0]) < 1e-12) j++;
    const avg2 = i + 1 + j + 1; // (i+1 + j+1) / 2, doublé
    for (let k = i; k <= j; k++) rank2[order[k][1]] = avg2;
    i = j + 1;
  }
  const total = rank2.reduce((s, r) => s + r, 0);
  const wPlus = d.reduce((s, x, i) => (x > 0 ? s + rank2[i] : s), 0);

  if (n <= 40) {
    // Distribution exacte de la somme des rangs positifs sous H0.
    const counts = new Float64Array(total + 1);
    counts[0] = 1;
    let max = 0;
    for (const r of rank2) {
      for (let s = max; s >= 0; s--) if (counts[s]) counts[s + r] += counts[s];
      max += r;
    }
    const all = 2 ** n;
    let ge = 0;
    let le = 0;
    for (let s = 0; s <= total; s++) {
      if (s >= wPlus) ge += counts[s];
      if (s <= wPlus) le += counts[s];
    }
    return { pUp: ge / all, pDown: le / all, n };
  }
  const mean = total / 2;
  const sd = Math.sqrt(rank2.reduce((s, r) => s + r * r, 0) / 4);
  const z = (wPlus - mean) / sd;
  return { pUp: 1 - normalCdf(z), pDown: normalCdf(z), n };
}

/* ------------------------------------------------------------------ */
/* Agrégats par scénario                                               */
/* ------------------------------------------------------------------ */

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function aggregate(runs: ScenarioRun[]): ScenarioAggregate {
  const nums = (f: (r: ScenarioRun) => number | null) =>
    runs.map(f).filter((x): x is number => x !== null && Number.isFinite(x));
  const durations = nums((r) => r.durationMs);
  const costs = nums((r) => r.costUsd);
  const toolCalls = runs.reduce((s, r) => s + r.toolCalls, 0);
  const paths: Record<string, number> = {};
  for (const r of runs) paths[r.pathSignature] = (paths[r.pathSignature] ?? 0) + 1;
  const path = Object.entries(paths).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  const failed = runs.filter((r) => r.status === 'error').length;
  return {
    runs: runs.length,
    failed,
    errorRate: runs.length ? failed / runs.length : 0,
    toolErrorRate: toolCalls ? runs.reduce((s, r) => s + r.toolErrors, 0) / toolCalls : null,
    durationMs: durations.length ? mean(durations) : null,
    costUsd: costs.length ? mean(costs) : null,
    stepCount: mean(runs.map((r) => r.stepCount)),
    totalTokens: mean(runs.map((r) => r.totalTokens)),
    redundantToolCalls: mean(runs.map((r) => r.redundantToolCalls)),
    path,
    paths,
  };
}

function groupByScenario(runs: ScenarioRun[]): Map<string, ScenarioRun[]> {
  const m = new Map<string, ScenarioRun[]>();
  for (const r of runs) {
    const list = m.get(r.scenario);
    if (list) list.push(r);
    else m.set(r.scenario, [r]);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

type Pair = { a: ScenarioAggregate; b: ScenarioAggregate };
const SCALE: Array<'durationMs' | 'costUsd' | 'stepCount' | 'totalTokens'> = [
  'durationMs', 'costUsd', 'stepCount', 'totalTokens',
];

function insufficient(metric: MetricKey, n: number, min: number, baseline: number | null, current: number | null): Comparison {
  return {
    metric, label: METRIC_LABELS[metric], baseline, current, delta: null, relDelta: null,
    pValue: null, verdict: 'insufficient',
    detail: `${n} paired scenario${n === 1 ? '' : 's'} — need at least ${min}`,
  };
}

function verdictOf(pUp: number, pDown: number, up: boolean, down: boolean, alpha: number): { verdict: Verdict; p: number } {
  if (pUp < alpha && up) return { verdict: 'regression', p: pUp };
  if (pDown < alpha && down) return { verdict: 'improvement', p: pDown };
  return { verdict: 'stable', p: pUp };
}

/** Taux (échecs, outils en erreur) : différences brutes. */
function compareRateMetric(
  metric: 'errorRate' | 'toolErrorRate', pairs: Pair[], o: Required<SuiteCompareOptions>,
): Comparison {
  const xs = pairs
    .map(({ a, b }) => [a[metric], b[metric]] as const)
    .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null);
  const baseline = xs.length ? mean(xs.map((x) => x[0])) : null;
  const current = xs.length ? mean(xs.map((x) => x[1])) : null;
  if (xs.length < o.minScenarios) return insufficient(metric, xs.length, o.minScenarios, baseline, current);
  const delta = current! - baseline!;
  const { pUp, pDown } = signedRankPValues(xs.map(([x, y]) => y - x));
  const { verdict, p } = verdictOf(pUp, pDown, delta >= o.minRateIncrease, -delta >= o.minRateIncrease, o.alpha);
  let severity: Severity | undefined;
  if (verdict === 'regression') severity = delta >= 0.1 ? 'critical' : 'warning';
  return {
    metric, label: METRIC_LABELS[metric], baseline, current, delta,
    relDelta: baseline ? delta / baseline : null, pValue: p, verdict, severity,
  };
}

/** Métriques d'échelle : rapport géométrique, pour que chaque scénario pèse pareil. */
function compareScaleMetric(
  metric: (typeof SCALE)[number], pairs: Pair[], o: Required<SuiteCompareOptions>,
): Comparison {
  const xs = pairs
    .map(({ a, b }) => [a[metric], b[metric]] as const)
    .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null && x[0] > 0 && x[1] > 0);
  const baseline = xs.length ? mean(xs.map((x) => x[0])) : null;
  const current = xs.length ? mean(xs.map((x) => x[1])) : null;
  if (xs.length < o.minScenarios) return insufficient(metric, xs.length, o.minScenarios, baseline, current);
  const logs = xs.map(([x, y]) => Math.log(y / x));
  const ratio = Math.exp(mean(logs)) - 1;
  const { pUp, pDown } = signedRankPValues(logs);
  const { verdict, p } = verdictOf(pUp, pDown, ratio >= o.minRelIncrease, ratio <= -o.minRelIncrease / (1 + o.minRelIncrease), o.alpha);
  let severity: Severity | undefined;
  if (verdict === 'regression') severity = ratio >= 0.5 ? 'critical' : 'warning';
  return {
    metric, label: METRIC_LABELS[metric], baseline, current, delta: current! - baseline!,
    relDelta: ratio, pValue: p, verdict, severity,
    detail: 'Typical change per scenario (geometric mean of the ratios)',
  };
}

function compareRedundant(pairs: Pair[], o: Required<SuiteCompareOptions>): Comparison {
  const xs = pairs.map(({ a, b }) => [a.redundantToolCalls, b.redundantToolCalls] as const);
  const baseline = xs.length ? mean(xs.map((x) => x[0])) : null;
  const current = xs.length ? mean(xs.map((x) => x[1])) : null;
  if (xs.length < o.minScenarios) return insufficient('redundantToolCalls', xs.length, o.minScenarios, baseline, current);
  const delta = current! - baseline!;
  const r = baseline! > 0 ? delta / baseline! : null;
  const up = r === null ? delta >= 0.2 : r >= o.minRelIncrease && delta >= 0.2;
  const down = r !== null && -r >= o.minRelIncrease && -delta >= 0.2;
  const { pUp, pDown } = signedRankPValues(xs.map(([x, y]) => y - x));
  const { verdict, p } = verdictOf(pUp, pDown, up, down, o.alpha);
  return {
    metric: 'redundantToolCalls', label: METRIC_LABELS.redundantToolCalls, baseline, current, delta,
    relDelta: r, pValue: p, verdict,
    severity: verdict === 'regression' ? (r === null || r >= 0.5 ? 'critical' : 'warning') : undefined,
  };
}

function comparePathShare(pairs: Pair[], o: Required<SuiteCompareOptions>): Comparison {
  const label = METRIC_LABELS.newPathShare;
  if (pairs.length < o.minScenarios) return insufficient('newPathShare', pairs.length, o.minScenarios, null, null);
  const changed = pairs.filter(({ a, b }) => !(b.path in a.paths)).length;
  const share = changed / pairs.length;
  const regression = share >= 0.2 && changed >= 2;
  return {
    metric: 'newPathShare', label, baseline: 0, current: share, delta: share, relDelta: null,
    pValue: null, verdict: regression ? 'regression' : 'stable',
    // Jamais bloquant : un nouveau chemin est à regarder, pas une faute en soi.
    severity: regression ? 'warning' : undefined,
    detail: `${changed} of ${pairs.length} scenarios now take a tool path never seen in the baseline`,
  };
}

function scenarioChanges(a: ScenarioAggregate, b: ScenarioAggregate, o: Required<SuiteCompareOptions>): ScenarioChange[] {
  const out: ScenarioChange[] = [];
  const rateDelta = b.errorRate - a.errorRate;
  if (Math.abs(rateDelta) >= o.scenarioRateIncrease) {
    out.push({
      metric: 'errorRate', label: rateDelta > 0 ? 'Fails more often' : 'Fails less often',
      baseline: a.errorRate, current: b.errorRate, relDelta: null,
      direction: rateDelta > 0 ? 'worse' : 'better',
      detail: `${a.failed}/${a.runs} → ${b.failed}/${b.runs} failed`,
    });
  }
  for (const metric of SCALE) {
    const x = a[metric];
    const y = b[metric];
    if (x === null || y === null || x <= 0 || y <= 0) continue;
    const r = y / x - 1;
    if (r >= o.scenarioRelIncrease || r <= -o.scenarioRelIncrease / (1 + o.scenarioRelIncrease)) {
      out.push({ metric, label: METRIC_LABELS[metric], baseline: x, current: y, relDelta: r, direction: r > 0 ? 'worse' : 'better' });
    }
  }
  const dr = b.redundantToolCalls - a.redundantToolCalls;
  if (Math.abs(dr) >= 1) {
    out.push({
      metric: 'redundantToolCalls', label: METRIC_LABELS.redundantToolCalls,
      baseline: a.redundantToolCalls, current: b.redundantToolCalls,
      relDelta: a.redundantToolCalls > 0 ? dr / a.redundantToolCalls : null,
      direction: dr > 0 ? 'worse' : 'better',
    });
  }
  if (!(b.path in a.paths)) {
    out.push({
      metric: 'newPathShare', label: 'Tool path changed', baseline: null, current: null, relDelta: null,
      direction: 'changed', detail: `was ${a.path} · now ${b.path}`,
    });
  }
  return out;
}

/**
 * Compare la suite `current` à `baseline`, scénario par scénario.
 * Les scénarios joués d'un seul côté sont listés mais pas comparés.
 */
export function compareScenarios(
  baseline: ScenarioRun[],
  current: ScenarioRun[],
  options: SuiteCompareOptions = {},
): SuiteComparison {
  const o: Required<SuiteCompareOptions> = {
    minScenarios: options.minScenarios ?? 5,
    alpha: options.alpha ?? 0.05,
    minRelIncrease: options.minRelIncrease ?? 0.15,
    minRateIncrease: options.minRateIncrease ?? 0.05,
    scenarioRelIncrease: options.scenarioRelIncrease ?? 0.5,
    scenarioRateIncrease: options.scenarioRateIncrease ?? 0.5,
  };
  const A = groupByScenario(baseline);
  const B = groupByScenario(current);
  const names = [...A.keys()].filter((k) => B.has(k)).sort();
  const pairs: Array<Pair & { name: string }> = names.map((name) => ({
    name, a: aggregate(A.get(name)!), b: aggregate(B.get(name)!),
  }));

  const metrics: Comparison[] = [
    compareRateMetric('errorRate', pairs, o),
    compareRateMetric('toolErrorRate', pairs, o),
    ...SCALE.map((m) => compareScaleMetric(m, pairs, o)),
    compareRedundant(pairs, o),
    comparePathShare(pairs, o),
  ];
  // Même ordre que compareWindows.
  const ORDER: MetricKey[] = ['errorRate', 'toolErrorRate', 'durationMs', 'costUsd', 'stepCount', 'totalTokens', 'redundantToolCalls', 'newPathShare'];
  metrics.sort((x, y) => ORDER.indexOf(x.metric) - ORDER.indexOf(y.metric));

  const rank = { regression: 0, changed: 1, improvement: 2, stable: 3 } as const;
  const scenarios: ScenarioDiff[] = pairs
    .map(({ name, a, b }) => {
      const changes = scenarioChanges(a, b, o);
      const verdict: ScenarioDiff['verdict'] = changes.some((c) => c.direction === 'worse')
        ? 'regression'
        : changes.some((c) => c.direction === 'better') ? 'improvement'
        : changes.length ? 'changed' : 'stable';
      return { scenario: name, baseline: a, current: b, changes, verdict };
    })
    .sort((x, y) => rank[x.verdict] - rank[y.verdict] || y.changes.length - x.changes.length || x.scenario.localeCompare(y.scenario));

  const reasons: string[] = [];
  for (const m of metrics) {
    // Un chemin d'outils nouveau est à regarder, pas une raison d'échouer.
    if (m.verdict === 'regression' && m.metric !== 'newPathShare') reasons.push(`${m.label} regressed across the suite`);
  }
  for (const s of scenarios) {
    const fail = s.changes.find((c) => c.metric === 'errorRate' && c.direction === 'worse');
    if (fail) reasons.push(`${s.scenario}: ${fail.detail}`);
  }
  return {
    paired: pairs.length,
    onlyBaseline: [...A.keys()].filter((k) => !B.has(k)).sort(),
    onlyCurrent: [...B.keys()].filter((k) => !A.has(k)).sort(),
    metrics,
    scenarios,
    result: reasons.length ? 'fail' : 'pass',
    reasons,
  };
}
