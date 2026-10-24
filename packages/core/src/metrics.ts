/**
 * trajekt/core — Métriques d'un run.
 *
 * Ce qui permet de suivre un agent dans le temps : on réduit chaque
 * trajectoire à une poignée de nombres comparables d'un run à l'autre.
 *
 * Au-delà de la durée et du coût (que tout outil d'observabilité
 * donne), on mesure le COMPORTEMENT de l'agent :
 *   - redundantToolCalls : appels d'outil répétés à l'identique
 *     (même outil, mêmes arguments) — le signe d'une boucle ;
 *   - retryCount : step relancé juste après un échec ;
 *   - pathSignature : la séquence d'outils empruntée, pour voir
 *     quand l'agent change de stratégie pour la même tâche.
 */

import {
  Trajectory,
  TrajectoryStep,
  LlmCallStep,
  ToolCallStep,
  RunStatus,
} from './trajectory.js';
import { estimateCostUsd } from './pricing.js';

export interface RunMetrics {
  status: RunStatus;
  /** Début du run (ISO 8601) — l'axe temporel des séries. */
  startedAt?: string;
  durationMs?: number;
  stepCount: number;
  llmCallCount: number;
  toolCallCount: number;
  /** Steps en erreur, tous types confondus. */
  errorCount: number;
  toolErrorCount: number;
  inputTokens: number;
  outputTokens: number;
  /** null si aucun appel LLM n'a de coût connu ni estimable. */
  costUsd: number | null;
  /** true si au moins une partie du coût vient de la table de prix. */
  costEstimated: boolean;
  redundantToolCalls: number;
  retryCount: number;
  /** Outils dans l'ordre, répétitions consécutives fusionnées. */
  toolPath: string[];
  pathSignature: string;
  /** Modèle le plus utilisé du run. */
  primaryModel?: string;
}

export const NO_TOOL_PATH = '(aucun outil)';
const MAX_SIGNATURE_LENGTH = 500;

function hasError(s: TrajectoryStep): boolean {
  return 'error' in s && typeof s.error === 'string' && s.error.length > 0;
}

/** JSON à clés triées : deux objets égaux donnent la même chaîne. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function stepName(s: TrajectoryStep): string {
  if (s.type === 'tool_call') return s.name;
  if (s.type === 'llm_call') return s.model ?? '';
  if (s.type === 'custom') return s.kind;
  return '';
}

function computeStatus(t: Trajectory): RunStatus {
  if (t.metadata.status) return t.metadata.status;
  const steps = t.steps;
  if (steps.length === 0) return 'ok';
  const lastSignificant = (list: TrajectoryStep[]) =>
    [...list].reverse().find((s) => s.type !== 'custom') ?? list[list.length - 1];

  const hasTree = steps.some((s) => s.id !== undefined);
  if (hasTree) {
    // Une seule vraie racine (style OTel : le span de l'agent englobe
    // tout) → c'est elle qui fait foi ; les erreurs internes rattrapées
    // ne font pas échouer le run.
    const trueRoots = steps.filter((s) => !s.parentId);
    if (trueRoots.length === 1) return hasError(trueRoots[0]) ? 'error' : 'ok';
    // Sinon (Langfuse : la trace elle-même n'est pas un step, plusieurs
    // observations au premier niveau ; ou lot partiel sans racine) :
    // le dernier step significatif du premier niveau décide.
    const ids = new Set(steps.map((s) => s.id).filter(Boolean));
    const topLevel = steps.filter((s) => !s.parentId || !ids.has(s.parentId));
    return hasError(lastSignificant(topLevel)) ? 'error' : 'ok';
  }
  return hasError(lastSignificant(steps)) ? 'error' : 'ok';
}

function computeDuration(t: Trajectory): { startedAt?: string; durationMs?: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const s of t.steps) {
    if (!s.timestamp) continue;
    const ts = Date.parse(s.timestamp);
    if (!Number.isFinite(ts)) continue;
    start = Math.min(start, ts);
    end = Math.max(end, ts + (s.durationMs ?? 0));
  }
  if (Number.isFinite(start)) {
    return { startedAt: new Date(start).toISOString(), durationMs: Math.round(end - start) };
  }
  const declared = t.metadata.totalDurationMs;
  if (typeof declared === 'number') return { startedAt: t.createdAt, durationMs: declared };
  const durations = t.steps.map((s) => s.durationMs).filter((d): d is number => d != null);
  return {
    startedAt: t.createdAt,
    durationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0)) : undefined,
  };
}

export function computeMetrics(t: Trajectory): RunMetrics {
  const llm = t.steps.filter((s): s is LlmCallStep => s.type === 'llm_call');
  const tools = t.steps.filter((s): s is ToolCallStep => s.type === 'tool_call');

  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let costKnown = false;
  let costEstimated = false;
  const modelCounts = new Map<string, number>();

  for (const s of llm) {
    const inT = s.usage?.inputTokens ?? 0;
    const outT = s.usage?.outputTokens ?? 0;
    inputTokens += inT;
    outputTokens += outT;
    if (s.model) modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
    if (typeof s.costUsd === 'number') {
      cost += s.costUsd;
      costKnown = true;
    } else {
      const est = estimateCostUsd(s.model, s.usage?.inputTokens, s.usage?.outputTokens);
      if (est !== undefined) {
        cost += est;
        costKnown = true;
        costEstimated = true;
      }
    }
  }
  if (!costKnown && typeof t.metadata.totalCostUsd === 'number') {
    cost = t.metadata.totalCostUsd;
    costKnown = true;
  }

  // Boucles : même outil + mêmes arguments qu'un appel précédent. Sans
  // arguments capturés on ne conclut rien (un outil peut légitimement
  // être appelé plusieurs fois).
  const seen = new Set<string>();
  let redundantToolCalls = 0;
  for (const s of tools) {
    if (s.args === undefined) continue;
    const key = `${s.name}::${stableStringify(s.args)}`;
    if (seen.has(key)) redundantToolCalls++;
    else seen.add(key);
  }

  // Retries : un step qui suit immédiatement l'échec d'un step du même
  // type et du même nom (outil ou modèle).
  let retryCount = 0;
  const meaningful = t.steps.filter((s) => s.type === 'llm_call' || s.type === 'tool_call');
  for (let i = 1; i < meaningful.length; i++) {
    const prev = meaningful[i - 1];
    const cur = meaningful[i];
    if (hasError(prev) && prev.type === cur.type && stepName(prev) === stepName(cur)) retryCount++;
  }

  const toolPath: string[] = [];
  for (const s of tools) if (toolPath[toolPath.length - 1] !== s.name) toolPath.push(s.name);
  let pathSignature = toolPath.length ? toolPath.join(' → ') : NO_TOOL_PATH;
  if (pathSignature.length > MAX_SIGNATURE_LENGTH) {
    pathSignature = pathSignature.slice(0, MAX_SIGNATURE_LENGTH - 1) + '…';
  }

  const primaryModel = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    status: computeStatus(t),
    ...computeDuration(t),
    stepCount: t.steps.length,
    llmCallCount: llm.length,
    toolCallCount: tools.length,
    errorCount: t.steps.filter(hasError).length,
    toolErrorCount: tools.filter(hasError).length,
    inputTokens,
    outputTokens,
    costUsd: costKnown ? Number(cost.toFixed(8)) : null,
    costEstimated,
    redundantToolCalls,
    retryCount,
    toolPath,
    pathSignature,
    primaryModel,
  };
}
