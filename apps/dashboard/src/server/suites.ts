/**
 * Suites d'évaluation : les runs rattachés à un scénario (données et
 * outils mockés, joués en dev ou en CI). On les compare scénario par
 * scénario entre deux valeurs d'une dimension (version d'agent, de
 * prompt, d'appli, modèle) avec compareScenarios de @trajekt-ai/core.
 */

import { compareScenarios, type ScenarioRun, type SuiteComparison } from '@trajekt-ai/core';
import type { Db } from './db';
import { DIMENSIONS, type Dimension } from './queries';

const col = (d: Dimension) => DIMENSIONS[d].column;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface EvalAgent {
  name: string;
  runs: number;
  scenarios: number;
  lastRun: string;
  /** Dernière version d'agent évaluée. */
  latestVersion: string | null;
}

export interface SuiteValue {
  value: string;
  runs: number;
  scenarios: number;
  failedRuns: number;
  firstRun: string;
  lastRun: string;
}

export interface SuitePageData {
  agent: string;
  dimension: Dimension;
  values: SuiteValue[];
  a: string | null;
  b: string | null;
  comparison: SuiteComparison | null;
  /** Ids d'un run par scénario et par côté, pour ouvrir ou comparer. */
  sampleRuns: Record<string, { a?: string; b?: string }>;
}

export async function listEvalAgents(db: Db, projectId: string): Promise<EvalAgent[]> {
  const rows = await db.query<Record<string, unknown>>(
    `select agent_name, count(*)::int as runs, count(distinct scenario)::int as scenarios,
            max(started_at) as last_run,
            (array_agg(agent_version order by started_at desc))[1] as latest_version
       from trajectories
      where project_id = $1 and scenario is not null
      group by agent_name
      order by max(started_at) desc`,
    [projectId],
  );
  return rows.map((r) => ({
    name: String(r.agent_name),
    runs: Number(r.runs),
    scenarios: Number(r.scenarios),
    lastRun: new Date(r.last_run as string).toISOString(),
    latestVersion: (r.latest_version as string | null) ?? null,
  }));
}

/** Valeurs d'une dimension présentes dans les suites de l'agent, la plus récente d'abord. */
export async function suiteValues(db: Db, projectId: string, agent: string, dimension: Dimension): Promise<SuiteValue[]> {
  const c = col(dimension);
  const rows = await db.query<Record<string, unknown>>(
    `select ${c} as value, count(*)::int as runs, count(distinct scenario)::int as scenarios,
            (count(*) filter (where status = 'error'))::int as failed,
            min(started_at) as first_run, max(started_at) as last_run
       from trajectories
      where project_id = $1 and agent_name = $2 and scenario is not null and ${c} is not null
      group by ${c}
      order by min(started_at) desc`,
    [projectId, agent],
  );
  return rows.map((r) => ({
    value: String(r.value),
    runs: Number(r.runs),
    scenarios: Number(r.scenarios),
    failedRuns: Number(r.failed),
    firstRun: new Date(r.first_run as string).toISOString(),
    lastRun: new Date(r.last_run as string).toISOString(),
  }));
}

async function scenarioRuns(db: Db, projectId: string, agent: string, dimension: Dimension, value: string) {
  return db.query<Record<string, unknown>>(
    `select id, scenario, status, duration_ms, cost_usd::float8 as cost_usd, step_count,
            input_tokens + output_tokens as total_tokens, tool_call_count, tool_error_count,
            redundant_tool_calls, path_signature,
            (select jsonb_object_agg(rs.name, rs.value) from run_scores rs where rs.trajectory_id = trajectories.id)::text as scores_json
       from trajectories
      where project_id = $1 and agent_name = $2 and scenario is not null and ${col(dimension)} = $3
      order by started_at desc`,
    [projectId, agent, value],
  );
}

function toScenarioRun(r: Record<string, unknown>): ScenarioRun {
  return {
    scenario: String(r.scenario),
    status: r.status as 'ok' | 'error',
    durationMs: num(r.duration_ms),
    costUsd: num(r.cost_usd),
    stepCount: Number(r.step_count),
    totalTokens: Number(r.total_tokens),
    toolCalls: Number(r.tool_call_count),
    toolErrors: Number(r.tool_error_count),
    redundantToolCalls: Number(r.redundant_tool_calls),
    pathSignature: String(r.path_signature),
    scores: r.scores_json ? (JSON.parse(String(r.scores_json)) as Record<string, number>) : undefined,
  };
}

/**
 * Compare la suite de `b` à celle de `a` (A = référence). Sans valeurs :
 * la plus récente contre la précédente.
 */
export async function loadSuitePage(
  db: Db, projectId: string, agent: string,
  opts: { dimension?: Dimension; a?: string; b?: string } = {},
): Promise<SuitePageData | null> {
  const dimension = opts.dimension ?? 'agent';
  const values = await suiteValues(db, projectId, agent, dimension);
  if (values.length === 0) {
    const [any] = await db.query('select 1 from trajectories where project_id = $1 and agent_name = $2 and scenario is not null limit 1', [projectId, agent]);
    if (!any) return null;
  }
  const known = new Set(values.map((v) => v.value));
  const b = opts.b && known.has(opts.b) ? opts.b : values[0]?.value ?? null;
  const a = opts.a && known.has(opts.a) ? opts.a : values.find((v) => v.value !== b)?.value ?? null;
  if (!a || !b || a === b) {
    return { agent, dimension, values, a, b, comparison: null, sampleRuns: {} };
  }
  const [ra, rb] = await Promise.all([
    scenarioRuns(db, projectId, agent, dimension, a),
    scenarioRuns(db, projectId, agent, dimension, b),
  ]);
  const sampleRuns: SuitePageData['sampleRuns'] = {};
  for (const r of ra) (sampleRuns[String(r.scenario)] ??= {}).a ??= String(r.id);
  for (const r of rb) (sampleRuns[String(r.scenario)] ??= {}).b ??= String(r.id);
  return {
    agent, dimension, values, a, b,
    comparison: compareScenarios(ra.map(toScenarioRun), rb.map(toScenarioRun)),
    sampleRuns,
  };
}
