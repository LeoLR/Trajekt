/**
 * trajekt/core — Comparaison de deux runs, step par step.
 *
 * Aligne deux trajectoires (plus longue sous-séquence commune sur une
 * signature de step) et qualifie chaque ligne :
 *   =  même step des deux côtés (même outil et mêmes arguments, ou même modèle)
 *   ≠  même outil des deux côtés, mais arguments ou issue différents
 *   +  step présent seulement dans B
 *   −  step présent seulement dans A
 * Les spans "système" (custom) sont ignorés : ils décrivent la
 * plomberie, pas le comportement de l'agent.
 */

import { Trajectory, TrajectoryStep } from './trajectory.js';
import { stableStringify, computeMetrics, type RunMetrics } from './metrics.js';

export type DiffMark = '=' | '≠' | '+' | '−';

export interface DiffRow {
  mark: DiffMark;
  /** Step de A (absent pour "+"). */
  a?: TrajectoryStep;
  /** Step de B (absent pour "−"). */
  b?: TrajectoryStep;
  /** Pour "≠" : ce qui diffère. */
  changes?: Array<'args' | 'outcome' | 'model'>;
}

export interface TrajectoryDiff {
  rows: DiffRow[];
  counts: Record<DiffMark, number>;
  a: RunMetrics;
  b: RunMetrics;
}

const comparable = (s: TrajectoryStep) => s.type !== 'custom';

/**
 * Identité "faible" : sur quoi on aligne. Un appel LLM nommé
 * (trajekt.step.name) s'aligne sur le même nom, mais seulement si les
 * deux runs nomment leurs appels : sinon, comparer une version qui nomme
 * à une qui ne nomme pas décalerait tout.
 */
function kind(s: TrajectoryStep, useNames: boolean): string {
  if (s.type === 'tool_call') return `tool:${s.name}`;
  if (s.type === 'llm_call') return useNames && s.name ? `llm:${s.name}` : 'llm';
  return s.type;
}

const namesLlm = (steps: TrajectoryStep[]) => steps.some((s) => s.type === 'llm_call' && !!s.name);

function failed(s: TrajectoryStep): boolean {
  return 'error' in s && typeof s.error === 'string' && s.error.length > 0;
}

function changesBetween(a: TrajectoryStep, b: TrajectoryStep): DiffRow['changes'] {
  const out: NonNullable<DiffRow['changes']> = [];
  if (a.type === 'tool_call' && b.type === 'tool_call') {
    if (a.args !== undefined && b.args !== undefined && stableStringify(a.args) !== stableStringify(b.args)) out.push('args');
  }
  if (a.type === 'llm_call' && b.type === 'llm_call' && a.model && b.model && a.model !== b.model) out.push('model');
  if (failed(a) !== failed(b)) out.push('outcome');
  return out;
}

export function diffTrajectories(ta: Trajectory, tb: Trajectory): TrajectoryDiff {
  const A = ta.steps.filter(comparable);
  const B = tb.steps.filter(comparable);
  const useNames = namesLlm(A) && namesLlm(B);
  const ka = A.map((s) => kind(s, useNames));
  const kb = B.map((s) => kind(s, useNames));

  // LCS classique (O(n·m)) : les runs d'agent comptent des dizaines de
  // steps, pas des milliers. Au-delà, on borne pour rester raisonnable.
  const n = Math.min(A.length, 2000);
  const m = Math.min(B.length, 2000);
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      const changes = changesBetween(A[i], B[j]);
      rows.push(changes && changes.length ? { mark: '≠', a: A[i], b: B[j], changes } : { mark: '=', a: A[i], b: B[j] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) {
      rows.push({ mark: '−', a: A[i++] });
    } else {
      rows.push({ mark: '+', b: B[j++] });
    }
  }
  while (i < n) rows.push({ mark: '−', a: A[i++] });
  while (j < m) rows.push({ mark: '+', b: B[j++] });

  const counts: Record<DiffMark, number> = { '=': 0, '≠': 0, '+': 0, '−': 0 };
  for (const r of rows) counts[r.mark]++;
  return { rows, counts, a: computeMetrics(ta), b: computeMetrics(tb) };
}
