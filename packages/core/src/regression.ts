/**
 * trajekt/core — Détection de régression.
 *
 * Compare deux populations de runs d'un même agent (fenêtre récente vs
 * fenêtre de référence, ou version N vs N-1) et dit, métrique par
 * métrique, si l'écart est réel ou du bruit.
 *
 * Principes, pour éviter le tableau de bord qui crie au loup :
 *   - un minimum de runs de chaque côté, sinon "insuffisant" ;
 *   - un test statistique (z pour les taux, Welch pour les moyennes)
 *     ET un écart minimum en valeur : un écart significatif mais
 *     minuscule n'est pas une alerte ;
 *   - toutes les métriques suivies sont "plus haut = pire".
 *
 * Les tests utilisent l'approximation normale : correcte au-delà d'une
 * vingtaine de runs par côté, d'où le minimum par défaut.
 */

export type MetricKey =
  | 'errorRate'
  | 'toolErrorRate'
  | 'durationMs'
  | 'costUsd'
  | 'stepCount'
  | 'totalTokens'
  | 'redundantToolCalls'
  | 'newPathShare';

/** Un score de qualité (plus haut = mieux), ex. « score:correct ». */
export type ScoreKey = `score:${string}`;
/** Toute métrique comparable : les métriques de run et les scores. */
export type AnyMetricKey = MetricKey | ScoreKey;

export function isScoreKey(k: string): k is ScoreKey {
  return k.startsWith('score:');
}

export interface Moments {
  /** Nombre de runs ayant une valeur pour cette métrique. */
  n: number;
  mean: number;
  stddev: number;
  p50?: number;
  p95?: number;
}

export interface WindowStats {
  runs: number;
  errorRuns: number;
  toolCalls: number;
  toolErrors: number;
  durationMs: Moments;
  costUsd: Moments;
  stepCount: Moments;
  totalTokens: Moments;
  redundantToolCalls: Moments;
  /** Nombre de runs par signature de chemin d'outils. */
  paths: Record<string, number>;
  /** Scores de qualité par nom (runs qui ont ce score seulement). */
  scores?: Record<string, Moments>;
}

export type Verdict = 'regression' | 'improvement' | 'stable' | 'insufficient';
export type Severity = 'warning' | 'critical';

export interface Comparison {
  metric: AnyMetricKey;
  label: string;
  baseline: number | null;
  current: number | null;
  /** current - baseline */
  delta: number | null;
  /** (current - baseline) / baseline, null si baseline = 0 */
  relDelta: number | null;
  pValue: number | null;
  verdict: Verdict;
  severity?: Severity;
  detail?: string;
}

export interface CompareOptions {
  /** Runs minimum de chaque côté (défaut 20). */
  minRuns?: number;
  /** Seuil de significativité unilatéral (défaut 0.01). */
  alpha?: number;
  /** Hausse relative minimale pour une moyenne (défaut 0.15 = +15 %). */
  minRelIncrease?: number;
  /** Hausse absolue minimale d'un taux (défaut 0.03 = +3 points). */
  minRateIncrease?: number;
  /** Baisse minimale d'un score pour une régression (défaut 0.05, sur une échelle 0–1). */
  minScoreDrop?: number;
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  errorRate: 'Failed runs',
  toolErrorRate: 'Failed tool calls',
  durationMs: 'Mean duration',
  costUsd: 'Mean cost',
  stepCount: 'Steps per run',
  totalTokens: 'Tokens per run',
  redundantToolCalls: 'Repeated tool calls',
  newPathShare: 'Runs on a new tool path',
};

/** Libellé lisible d'une métrique ou d'un score. */
export function metricLabel(k: AnyMetricKey): string {
  return isScoreKey(k) ? `Score · ${k.slice(6)}` : METRIC_LABELS[k];
}

/* ------------------------------------------------------------------ */
/* Statistiques                                                         */
/* ------------------------------------------------------------------ */

/** Fonction de répartition de la loi normale centrée réduite. */
export function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26, erreur < 1.5e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** p-valeur unilatérale (hausse) d'un test z à deux proportions. */
export function proportionIncreasePValue(x0: number, n0: number, x1: number, n1: number): number {
  const p0 = x0 / n0;
  const p1 = x1 / n1;
  const pooled = (x0 + x1) / (n0 + n1);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n0 + 1 / n1));
  if (se === 0) return p1 > p0 ? 0 : 1;
  return 1 - normalCdf((p1 - p0) / se);
}

/** p-valeur unilatérale (hausse de la moyenne) d'un test de Welch, approx. normale. */
export function meanIncreasePValue(a: Moments, b: Moments): number {
  const se = Math.sqrt((a.stddev ** 2) / a.n + (b.stddev ** 2) / b.n);
  if (se === 0) return b.mean > a.mean ? 0 : 1;
  return 1 - normalCdf((b.mean - a.mean) / se);
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

function rel(baseline: number, current: number): number | null {
  return baseline === 0 ? null : (current - baseline) / baseline;
}

function compareRate(
  metric: MetricKey,
  x0: number, n0: number, x1: number, n1: number,
  minN: number, o: Required<CompareOptions>,
): Comparison {
  const label = METRIC_LABELS[metric];
  if (n0 < minN || n1 < minN) {
    return {
      metric, label,
      baseline: n0 ? x0 / n0 : null, current: n1 ? x1 / n1 : null,
      delta: null, relDelta: null, pValue: null, verdict: 'insufficient',
      detail: `${n0} vs ${n1} — need at least ${minN} on each side`,
    };
  }
  const b = x0 / n0;
  const c = x1 / n1;
  const delta = c - b;
  const pUp = proportionIncreasePValue(x0, n0, x1, n1);
  const pDown = proportionIncreasePValue(x1, n1, x0, n0);
  let verdict: Verdict = 'stable';
  let severity: Severity | undefined;
  if (pUp < o.alpha && delta >= o.minRateIncrease) {
    verdict = 'regression';
    severity = delta >= 0.1 || (b > 0 && c / b >= 2 && delta >= 0.05) ? 'critical' : 'warning';
  } else if (pDown < o.alpha && -delta >= o.minRateIncrease) {
    verdict = 'improvement';
  }
  return {
    metric, label, baseline: b, current: c, delta, relDelta: rel(b, c),
    pValue: verdict === 'improvement' ? pDown : pUp, verdict, severity,
  };
}

function compareMean(
  metric: MetricKey, a: Moments, b: Moments, o: Required<CompareOptions>,
): Comparison {
  const label = METRIC_LABELS[metric];
  if (a.n < o.minRuns || b.n < o.minRuns) {
    return {
      metric, label,
      baseline: a.n ? a.mean : null, current: b.n ? b.mean : null,
      delta: null, relDelta: null, pValue: null, verdict: 'insufficient',
      detail: `${a.n} vs ${b.n} runs — need at least ${o.minRuns} on each side`,
    };
  }
  const delta = b.mean - a.mean;
  const r = rel(a.mean, b.mean);
  const pUp = meanIncreasePValue(a, b);
  const pDown = meanIncreasePValue(b, a);
  // Base nulle (ex. zéro boucle avant) : toute hausse significative compte.
  const bigEnough = r === null ? delta > 0 : r >= o.minRelIncrease;
  const bigEnoughDown = r === null ? false : -r >= o.minRelIncrease;
  let verdict: Verdict = 'stable';
  let severity: Severity | undefined;
  if (pUp < o.alpha && bigEnough) {
    verdict = 'regression';
    severity = r === null || r >= 0.5 ? 'critical' : 'warning';
  } else if (pDown < o.alpha && bigEnoughDown) {
    verdict = 'improvement';
  }
  return {
    metric, label, baseline: a.mean, current: b.mean, delta, relDelta: r,
    pValue: verdict === 'improvement' ? pDown : pUp, verdict, severity,
  };
}

function comparePaths(a: WindowStats, b: WindowStats, o: Required<CompareOptions>): Comparison {
  const label = METRIC_LABELS.newPathShare;
  if (a.runs < o.minRuns || b.runs < o.minRuns) {
    return {
      metric: 'newPathShare', label, baseline: null, current: null, delta: null,
      relDelta: null, pValue: null, verdict: 'insufficient',
      detail: `${a.runs} vs ${b.runs} runs — need at least ${o.minRuns} on each side`,
    };
  }
  const known = new Set(Object.keys(a.paths));
  let fresh = 0;
  let topNew: [string, number] | undefined;
  for (const [sig, count] of Object.entries(b.paths)) {
    if (known.has(sig)) continue;
    fresh += count;
    if (!topNew || count > topNew[1]) topNew = [sig, count];
  }
  const share = fresh / b.runs;
  let verdict: Verdict = 'stable';
  let severity: Severity | undefined;
  if (share >= 0.2 && fresh >= 5) {
    verdict = 'regression';
    severity = share >= 0.5 ? 'critical' : 'warning';
  }
  return {
    metric: 'newPathShare', label, baseline: 0, current: share, delta: share,
    relDelta: null, pValue: null, verdict, severity,
    detail: topNew ? `Most common new path: ${topNew[0]} (${topNew[1]} runs)` : undefined,
  };
}

/** Un score : plus haut = mieux, la régression est une baisse. */
function compareScore(name: string, a: Moments, b: Moments, o: Required<CompareOptions>): Comparison {
  const metric: ScoreKey = `score:${name}`;
  const label = metricLabel(metric);
  if (a.n < o.minRuns || b.n < o.minRuns) {
    return {
      metric, label, baseline: a.n ? a.mean : null, current: b.n ? b.mean : null,
      delta: null, relDelta: null, pValue: null, verdict: 'insufficient',
      detail: `${a.n} vs ${b.n} scored runs — need at least ${o.minRuns} on each side`,
    };
  }
  const delta = b.mean - a.mean;
  const pDown = meanIncreasePValue(b, a); // la baisse de B
  const pUp = meanIncreasePValue(a, b);
  let verdict: Verdict = 'stable';
  let severity: Severity | undefined;
  if (pDown < o.alpha && -delta >= o.minScoreDrop) {
    verdict = 'regression';
    severity = -delta >= 0.15 ? 'critical' : 'warning';
  } else if (pUp < o.alpha && delta >= o.minScoreDrop) {
    verdict = 'improvement';
  }
  return {
    metric, label, baseline: a.mean, current: b.mean, delta, relDelta: rel(a.mean, b.mean),
    pValue: verdict === 'improvement' ? pUp : pDown, verdict, severity,
  };
}

/**
 * Compare `current` à `baseline` sur toutes les métriques suivies.
 * Renvoie une comparaison par métrique, régression ou non : l'interface
 * affiche le tableau complet, les alertes ne gardent que les régressions.
 */
export function compareWindows(
  baseline: WindowStats,
  current: WindowStats,
  options: CompareOptions = {},
): Comparison[] {
  const o: Required<CompareOptions> = {
    minRuns: options.minRuns ?? 20,
    alpha: options.alpha ?? 0.01,
    minRelIncrease: options.minRelIncrease ?? 0.15,
    minRateIncrease: options.minRateIncrease ?? 0.03,
    minScoreDrop: options.minScoreDrop ?? 0.05,
  };
  const scoreNames = Object.keys(baseline.scores ?? {}).filter((k) => current.scores?.[k]).sort();
  return holmAdjust([
    compareRate('errorRate', baseline.errorRuns, baseline.runs, current.errorRuns, current.runs, o.minRuns, o),
    compareRate('toolErrorRate', baseline.toolErrors, baseline.toolCalls, current.toolErrors, current.toolCalls, o.minRuns, o),
    compareMean('durationMs', baseline.durationMs, current.durationMs, o),
    compareMean('costUsd', baseline.costUsd, current.costUsd, o),
    compareMean('stepCount', baseline.stepCount, current.stepCount, o),
    compareMean('totalTokens', baseline.totalTokens, current.totalTokens, o),
    compareMean('redundantToolCalls', baseline.redundantToolCalls, current.redundantToolCalls, o),
    comparePaths(baseline, current, o),
    ...scoreNames.map((k) => compareScore(k, baseline.scores![k], current.scores![k], o)),
  ], o.alpha);
}

/**
 * Correction de Holm-Bonferroni : on teste plusieurs métriques à la fois,
 * donc une fausse alerte « par hasard » devient probable. Les verdicts
 * (régression ou amélioration) qui ne tiennent plus après correction
 * redeviennent « stable ». Les métriques sans p-valeur ne sont pas touchées.
 */
export function holmAdjust(comparisons: Comparison[], alpha: number): Comparison[] {
  const tested = comparisons
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.pValue !== null && c.verdict !== 'insufficient')
    .sort((a, b) => a.c.pValue! - b.c.pValue!);
  const m = tested.length;
  const out = [...comparisons];
  let stopped = false;
  tested.forEach(({ c, i }, k) => {
    if (!stopped && c.pValue! <= alpha / (m - k)) return;
    stopped = true;
    if (c.verdict === 'regression' || c.verdict === 'improvement') {
      out[i] = {
        ...c, verdict: 'stable', severity: undefined,
        detail: `Not significant once corrected for the ${m} metrics tested at once (p = ${c.pValue!.toPrecision(2)})`,
      };
    }
  });
  return out;
}

export function regressionsOnly(comparisons: Comparison[]): Comparison[] {
  return comparisons.filter((c) => c.verdict === 'regression');
}
