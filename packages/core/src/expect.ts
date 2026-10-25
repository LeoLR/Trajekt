/**
 * trajekt/core — Assertions sur une trajectoire.
 *
 * Pour les tests d'un agent (données et outils mockés) : on décrit ce
 * qu'un run doit faire — appeler tel outil, avec tels arguments, dans
 * tel ordre, sans dépasser un budget — et on obtient la liste de ce qui
 * ne va pas. Fonctionne avec node:test, vitest ou jest.
 *
 *   assertTrajectory(run, {
 *     status: 'ok',
 *     calls: ['sentry.getIssue', 'jira.createIssue'],
 *     order: ['sentry.getIssue', 'gitlab.readFile', 'jira.createIssue'],
 *     calledWith: [{ tool: 'jira.createIssue', args: { project: 'PAY' } }],
 *     notCalls: ['gitlab.createMergeRequest'],
 *     maxSteps: 12, maxCostUsd: 0.05, maxRepeatedToolCalls: 0,
 *   });
 */

import { toolCalls, type Trajectory } from './trajectory.js';
import { computeMetrics, type RunMetrics } from './metrics.js';

export interface TrajectoryExpectations {
  status?: 'ok' | 'error';
  /** Outils qui doivent être appelés au moins une fois. */
  calls?: string[];
  /** Outils qui ne doivent pas être appelés. */
  notCalls?: string[];
  /** Ces outils doivent apparaître dans cet ordre (d'autres appels peuvent s'intercaler). */
  order?: string[];
  /** Un appel de l'outil doit contenir ces arguments (comparaison partielle, en profondeur). */
  calledWith?: Array<{ tool: string; args: Record<string, unknown> }>;
  maxSteps?: number;
  maxToolCalls?: number;
  /** Nombre d'appels à un même outil. */
  maxCallsPerTool?: Record<string, number>;
  maxFailedToolCalls?: number;
  maxRepeatedToolCalls?: number;
  maxRetries?: number;
  maxCostUsd?: number;
  maxDurationMs?: number;
  maxTokens?: number;
}

export interface ExpectationFailure {
  rule: keyof TrajectoryExpectations;
  message: string;
}

export class TrajectoryAssertionError extends Error {
  constructor(
    public readonly failures: ExpectationFailure[],
    public readonly metrics: RunMetrics,
  ) {
    super(
      `Trajectory does not meet ${failures.length} expectation${failures.length > 1 ? 's' : ''}:\n` +
        failures.map((f) => `  - ${f.message}`).join('\n') +
        `\n  tool path: ${metrics.pathSignature}`,
    );
    this.name = 'TrajectoryAssertionError';
  }
}

/** Vrai si `actual` contient `expected` (objets : clés attendues seulement ; tableaux : à l'identique). */
export function matchesPartially(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesPartially(actual[i], e));
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([k, v]) => matchesPartially((actual as Record<string, unknown>)[k], v));
}

function argsOf(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** Ce qui ne va pas dans le run, au regard des attentes. Tableau vide = conforme. */
export function checkTrajectory(t: Trajectory, e: TrajectoryExpectations): ExpectationFailure[] {
  const m = computeMetrics(t);
  const calls = toolCalls(t);
  const names = calls.map((c) => c.name);
  const out: ExpectationFailure[] = [];
  const max = (rule: keyof TrajectoryExpectations, limit: number | undefined, actual: number | null | undefined, what: string, fmt = (x: number) => String(x)) => {
    if (limit === undefined || actual === null || actual === undefined) return;
    if (actual > limit) out.push({ rule, message: `${what}: ${fmt(actual)}, expected at most ${fmt(limit)}` });
  };

  if (e.status && m.status !== e.status) {
    const err = t.steps.find((s) => 'error' in s && s.error) as { error?: string; index: number } | undefined;
    out.push({
      rule: 'status',
      message: `run ${m.status === 'error' ? 'failed' : 'succeeded'}, expected ${e.status === 'ok' ? 'success' : 'failure'}` +
        (err ? ` (step #${err.index + 1}: ${err.error})` : ''),
    });
  }
  for (const tool of e.calls ?? []) {
    if (!names.includes(tool)) out.push({ rule: 'calls', message: `${tool} was never called` });
  }
  for (const tool of e.notCalls ?? []) {
    const n = names.filter((x) => x === tool).length;
    if (n) out.push({ rule: 'notCalls', message: `${tool} was called ${n} time${n > 1 ? 's' : ''}, expected never` });
  }
  if (e.order?.length) {
    let i = 0;
    for (const name of names) if (name === e.order[i]) i++;
    if (i < e.order.length) {
      out.push({
        rule: 'order',
        message: `expected ${e.order.join(' → ')} in that order; ${e.order[i]} ${names.includes(e.order[i]) ? 'came too early or out of order' : 'was never called'}`,
      });
    }
  }
  for (const { tool, args } of e.calledWith ?? []) {
    const candidates = calls.filter((c) => c.name === tool);
    if (!candidates.some((c) => matchesPartially(argsOf(c.args), args))) {
      out.push({
        rule: 'calledWith',
        message: candidates.length
          ? `${tool} was never called with ${JSON.stringify(args)} (got ${candidates.map((c) => JSON.stringify(argsOf(c.args))).join(', ')})`
          : `${tool} was never called (expected arguments ${JSON.stringify(args)})`,
      });
    }
  }
  for (const [tool, limit] of Object.entries(e.maxCallsPerTool ?? {})) {
    max('maxCallsPerTool', limit, names.filter((x) => x === tool).length, `${tool} calls`);
  }
  max('maxSteps', e.maxSteps, m.stepCount, 'steps');
  max('maxToolCalls', e.maxToolCalls, m.toolCallCount, 'tool calls');
  max('maxFailedToolCalls', e.maxFailedToolCalls, m.toolErrorCount, 'failed tool calls');
  max('maxRepeatedToolCalls', e.maxRepeatedToolCalls, m.redundantToolCalls, 'repeated tool calls (same tool, same arguments)');
  max('maxRetries', e.maxRetries, m.retryCount, 'retries');
  max('maxCostUsd', e.maxCostUsd, m.costUsd, 'cost', (x) => `$${x.toFixed(4)}`);
  max('maxDurationMs', e.maxDurationMs, m.durationMs, 'duration', (x) => `${Math.round(x)}ms`);
  max('maxTokens', e.maxTokens, m.inputTokens + m.outputTokens, 'tokens');
  return out;
}

/** Nombre de vérifications que représentent ces attentes (une par outil, par argument attendu, par budget…). */
export function countExpectations(e: TrajectoryExpectations): number {
  const budgets: Array<keyof TrajectoryExpectations> = [
    'maxSteps', 'maxToolCalls', 'maxFailedToolCalls', 'maxRepeatedToolCalls', 'maxRetries', 'maxCostUsd', 'maxDurationMs', 'maxTokens',
  ];
  return (e.status ? 1 : 0)
    + (e.calls?.length ?? 0)
    + (e.notCalls?.length ?? 0)
    + (e.order?.length ? 1 : 0)
    + (e.calledWith?.length ?? 0)
    + Object.keys(e.maxCallsPerTool ?? {}).length
    + budgets.filter((k) => e[k] !== undefined).length;
}

export interface ExpectationScore {
  /** Part des vérifications respectées, de 0 à 1. */
  score: number;
  passed: number;
  total: number;
  failures: ExpectationFailure[];
}

/**
 * Comme checkTrajectory, mais renvoie un score : la part des attentes
 * respectées. À envoyer à Trajekt comme score du run (POST /v1/scores,
 * ou l'attribut trajekt.score.assertions) pour le suivre dans le temps
 * et dans les comparaisons de versions.
 */
export function scoreTrajectory(t: Trajectory, e: TrajectoryExpectations): ExpectationScore {
  const failures = checkTrajectory(t, e);
  const total = countExpectations(e);
  const passed = Math.max(0, total - failures.length);
  return { score: total ? passed / total : 1, passed, total, failures };
}

/** Comme checkTrajectory, mais lève une erreur lisible au premier écart. */
export function assertTrajectory(t: Trajectory, e: TrajectoryExpectations): RunMetrics {
  const failures = checkTrajectory(t, e);
  const metrics = computeMetrics(t);
  if (failures.length) throw new TrajectoryAssertionError(failures, metrics);
  return metrics;
}
