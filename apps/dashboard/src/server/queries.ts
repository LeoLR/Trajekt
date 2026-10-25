/**
 * Requêtes de lecture : suivi des agents dans le temps.
 *
 * Tout est scopé par projet. Les fenêtres temporelles sont passées en
 * paramètres ISO (jamais interpolées), les unités de bucket passent par
 * une liste blanche.
 */

import {
  compareWindows,
  type Comparison,
  type Moments,
  type WindowStats,
  type Trajectory,
} from '@trajekt/core';
import type { Db } from './db';
import { asJson } from './ingest';

/* ------------------------------------------------------------------ */
/* Types renvoyés                                                       */
/* ------------------------------------------------------------------ */

export interface AgentOverview {
  name: string;
  latestVersion: string | null;
  lastSeen: string;
  runs24h: number;
  runs7d: number;
  errorRate24h: number | null;
  p50DurationMs24h: number | null;
  avgCostUsd24h: number | null;
  /** 14 derniers jours, du plus ancien au plus récent. */
  daily: Array<{ date: string; runs: number; errorRate: number | null; avgCostUsd: number | null }>;
}

export interface TimeseriesPoint {
  t: string;
  runs: number;
  errorRate: number | null;
  toolErrorRate: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  avgCostUsd: number | null;
  avgSteps: number | null;
  avgTokens: number | null;
  avgRedundantToolCalls: number | null;
}

export interface VersionStats {
  /** Valeur de la dimension (version, modèle…), null si absente. */
  version: string | null;
  firstSeen: string;
  lastSeen: string;
  runs: number;
  errorRate: number;
  p50DurationMs: number | null;
  avgCostUsd: number | null;
  avgSteps: number;
  avgRedundantToolCalls: number;
  topPath: string | null;
  topPathShare: number | null;
}

export interface ComparisonResult {
  /** window : fenêtres de temps ; version : dernière valeur vs précédente ; ab : deux valeurs choisies. */
  mode: 'window' | 'version' | 'ab';
  dimension?: Dimension;
  baselineLabel: string;
  currentLabel: string;
  baselineRuns: number;
  currentRuns: number;
  comparisons: Comparison[];
}

export interface RunSummary {
  id: string;
  traceId: string | null;
  agentName: string;
  appVersion: string | null;
  agentVersion: string | null;
  promptVersion: string | null;
  status: 'ok' | 'error';
  startedAt: string;
  durationMs: number | null;
  stepCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  redundantToolCalls: number;
  retryCount: number;
  costUsd: number | null;
  costEstimated: boolean;
  primaryModel: string | null;
  pathSignature: string;
  sourceFormat: string | null;
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                          */
/* ------------------------------------------------------------------ */

/**
 * Les axes sur lesquels on compare des runs. La colonne vient de cette
 * liste blanche, jamais de l'entrée utilisateur.
 */
export const DIMENSIONS = {
  app: { column: 'app_version', label: 'App version' },
  agent: { column: 'agent_version', label: 'Agent version' },
  prompt: { column: 'prompt_version', label: 'Prompt version' },
  model: { column: 'primary_model', label: 'Model' },
} as const;
export type Dimension = keyof typeof DIMENSIONS;
export function isDimension(v: unknown): v is Dimension {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DIMENSIONS, v);
}
const col = (d: Dimension) => DIMENSIONS[d].column;

const BUCKETS = { hour: 'hour', day: 'day' } as const;
export type Bucket = keyof typeof BUCKETS;

const DAY = 24 * 3600 * 1000;
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/* ------------------------------------------------------------------ */
/* Vue d'ensemble des agents                                            */
/* ------------------------------------------------------------------ */

export async function listAgents(db: Db, projectId: string, now = new Date()): Promise<AgentOverview[]> {
  const since14 = new Date(now.getTime() - 14 * DAY).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY).toISOString();
  const since1 = new Date(now.getTime() - DAY).toISOString();

  const rows = await db.query<Record<string, unknown>>(
    `select agent_name,
            max(started_at) as last_seen,
            count(*) filter (where started_at >= $3::timestamptz)::int as runs_24h,
            count(*) filter (where started_at >= $4::timestamptz)::int as runs_7d,
            (count(*) filter (where started_at >= $3::timestamptz and status = 'error'))::float8
              / nullif(count(*) filter (where started_at >= $3::timestamptz), 0) as error_rate_24h,
            percentile_cont(0.5) within group (order by duration_ms)
              filter (where started_at >= $3::timestamptz)::float8 as p50_24h,
            (avg(cost_usd) filter (where started_at >= $3::timestamptz))::float8 as cost_24h
       from trajectories
      where project_id = $1 and started_at >= $2::timestamptz
      group by agent_name
      order by max(started_at) desc`,
    [projectId, since14, since1, since7],
  );
  if (rows.length === 0) return [];

  const latest = await db.query<{ agent_name: string; agent_version: string | null }>(
    `select distinct on (agent_name) agent_name, agent_version
       from trajectories
      where project_id = $1 and started_at >= $2::timestamptz
      order by agent_name, started_at desc`,
    [projectId, since14],
  );
  const latestByAgent = new Map(latest.map((r) => [r.agent_name, r.agent_version]));

  const daily = await db.query<{ agent_name: string; day: string; runs: number; error_rate: number | null; avg_cost: number | null }>(
    `select agent_name,
            to_char(date_trunc('day', started_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
            count(*)::int as runs,
            (count(*) filter (where status = 'error'))::float8 / count(*) as error_rate,
            avg(cost_usd)::float8 as avg_cost
       from trajectories
      where project_id = $1 and started_at >= $2::timestamptz
      group by 1, 2`,
    [projectId, since14],
  );
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(now.getTime() - i * DAY).toISOString().slice(0, 10));

  return rows.map((r) => {
    const name = String(r.agent_name);
    const byDay = new Map(daily.filter((d) => d.agent_name === name).map((d) => [d.day, d]));
    return {
      name,
      latestVersion: latestByAgent.get(name) ?? null,
      lastSeen: iso(r.last_seen as Date),
      runs24h: Number(r.runs_24h),
      runs7d: Number(r.runs_7d),
      errorRate24h: n(r.error_rate_24h),
      p50DurationMs24h: n(r.p50_24h),
      avgCostUsd24h: n(r.cost_24h),
      daily: days.map((date) => {
        const d = byDay.get(date);
        return { date, runs: d?.runs ?? 0, errorRate: d ? n(d.error_rate) : null, avgCostUsd: d ? n(d.avg_cost) : null };
      }),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Série temporelle d'un agent                                          */
/* ------------------------------------------------------------------ */

export async function agentTimeseries(
  db: Db,
  projectId: string,
  agent: string,
  opts: { from: Date; to: Date; bucket: Bucket; version?: string; dimension?: Dimension },
): Promise<TimeseriesPoint[]> {
  const unit = BUCKETS[opts.bucket];
  const params: unknown[] = [projectId, agent, opts.from.toISOString(), opts.to.toISOString()];
  let versionFilter = '';
  if (opts.version !== undefined) {
    params.push(opts.version);
    versionFilter = `and ${col(opts.dimension ?? 'agent')} is not distinct from $${params.length}`;
  }
  const rows = await db.query<Record<string, unknown>>(
    `select to_char(date_trunc('${unit}', started_at at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bucket,
            count(*)::int as runs,
            (count(*) filter (where status = 'error'))::float8 / count(*) as error_rate,
            sum(tool_error_count)::float8 / nullif(sum(tool_call_count), 0) as tool_error_rate,
            percentile_cont(0.5) within group (order by duration_ms)::float8 as p50,
            percentile_cont(0.95) within group (order by duration_ms)::float8 as p95,
            avg(cost_usd)::float8 as avg_cost,
            avg(step_count)::float8 as avg_steps,
            avg(input_tokens + output_tokens)::float8 as avg_tokens,
            avg(redundant_tool_calls)::float8 as avg_redundant
       from trajectories
      where project_id = $1 and agent_name = $2
        and started_at >= $3::timestamptz and started_at < $4::timestamptz
        ${versionFilter}
      group by 1
      order by 1`,
    params,
  );

  // Buckets vides remplis : une courbe qui saute un jour sans run ment.
  const step = opts.bucket === 'hour' ? 3600 * 1000 : DAY;
  const byKey = new Map(rows.map((r) => [new Date(String(r.bucket)).toISOString(), r]));
  const out: TimeseriesPoint[] = [];
  const start = floorUtc(opts.from, opts.bucket);
  for (let t = start.getTime(); t < opts.to.getTime(); t += step) {
    const key = new Date(t).toISOString();
    const r = byKey.get(key);
    out.push({
      t: key,
      runs: r ? Number(r.runs) : 0,
      errorRate: r ? n(r.error_rate) : null,
      toolErrorRate: r ? n(r.tool_error_rate) : null,
      p50DurationMs: r ? n(r.p50) : null,
      p95DurationMs: r ? n(r.p95) : null,
      avgCostUsd: r ? n(r.avg_cost) : null,
      avgSteps: r ? n(r.avg_steps) : null,
      avgTokens: r ? n(r.avg_tokens) : null,
      avgRedundantToolCalls: r ? n(r.avg_redundant) : null,
    });
  }
  return out;
}

function floorUtc(d: Date, bucket: Bucket): Date {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  if (bucket === 'day') x.setUTCHours(0);
  return x;
}

/* ------------------------------------------------------------------ */
/* Versions                                                             */
/* ------------------------------------------------------------------ */

/**
 * Métriques par valeur d'une dimension (par défaut : la version d'agent),
 * la plus récente (première apparition) d'abord.
 */
export async function agentVersions(
  db: Db, projectId: string, agent: string, dimension: Dimension = 'agent',
): Promise<VersionStats[]> {
  const c = col(dimension);
  const rows = await db.query<Record<string, unknown>>(
    `with v as (
       select ${c} as value,
              min(started_at) as first_seen,
              max(started_at) as last_seen,
              count(*)::int as runs,
              (count(*) filter (where status = 'error'))::float8 / count(*) as error_rate,
              percentile_cont(0.5) within group (order by duration_ms)::float8 as p50,
              avg(cost_usd)::float8 as avg_cost,
              avg(step_count)::float8 as avg_steps,
              avg(redundant_tool_calls)::float8 as avg_redundant
         from trajectories
        where project_id = $1 and agent_name = $2
        group by ${c}
     ),
     p as (
       select distinct on (${c}) ${c} as value, path_signature, count(*)::int as c
         from trajectories
        where project_id = $1 and agent_name = $2
        group by ${c}, path_signature
        order by ${c}, count(*) desc, path_signature
     )
     select v.*, p.path_signature as top_path, p.c as top_path_runs
       from v left join p on p.value is not distinct from v.value
      order by v.first_seen desc`,
    [projectId, agent],
  );
  return rows.map((r) => ({
    version: (r.value as string | null) ?? null,
    firstSeen: iso(r.first_seen as Date),
    lastSeen: iso(r.last_seen as Date),
    runs: Number(r.runs),
    errorRate: Number(r.error_rate),
    p50DurationMs: n(r.p50),
    avgCostUsd: n(r.avg_cost),
    avgSteps: Number(r.avg_steps),
    avgRedundantToolCalls: Number(r.avg_redundant),
    topPath: (r.top_path as string | null) ?? null,
    topPathShare: r.top_path_runs != null ? Number(r.top_path_runs) / Number(r.runs) : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Statistiques d'une population de runs (entrée de compareWindows)     */
/* ------------------------------------------------------------------ */

interface Population {
  from?: Date;
  to?: Date;
  /** undefined = toutes valeurs ; null = runs sans valeur. */
  version?: string | null;
  /** Dimension à laquelle s'applique `version` (défaut : agent). */
  dimension?: Dimension;
}

function populationFilter(p: Population, params: unknown[]): string {
  const parts: string[] = [];
  if (p.from) {
    params.push(p.from.toISOString());
    parts.push(`started_at >= $${params.length}::timestamptz`);
  }
  if (p.to) {
    params.push(p.to.toISOString());
    parts.push(`started_at < $${params.length}::timestamptz`);
  }
  if (p.version !== undefined) {
    params.push(p.version);
    parts.push(`${col(p.dimension ?? 'agent')} is not distinct from $${params.length}`);
  }
  return parts.length ? 'and ' + parts.join(' and ') : '';
}

const momentCols = (expr: string, alias: string) => `
  count(${expr})::int as ${alias}_n,
  coalesce(avg(${expr}), 0)::float8 as ${alias}_mean,
  coalesce(stddev_samp(${expr}), 0)::float8 as ${alias}_sd,
  percentile_cont(0.5) within group (order by ${expr})::float8 as ${alias}_p50,
  percentile_cont(0.95) within group (order by ${expr})::float8 as ${alias}_p95`;

export async function windowStats(
  db: Db,
  projectId: string,
  agent: string,
  pop: Population,
): Promise<WindowStats> {
  const params: unknown[] = [projectId, agent];
  const filter = populationFilter(pop, params);
  const [r] = await db.query<Record<string, unknown>>(
    `select count(*)::int as runs,
            (count(*) filter (where status = 'error'))::int as error_runs,
            coalesce(sum(tool_call_count), 0)::int as tool_calls,
            coalesce(sum(tool_error_count), 0)::int as tool_errors,
            ${momentCols('duration_ms', 'd')},
            ${momentCols('cost_usd', 'c')},
            ${momentCols('step_count', 's')},
            ${momentCols('(input_tokens + output_tokens)', 'k')},
            ${momentCols('redundant_tool_calls', 'r')}
       from trajectories
      where project_id = $1 and agent_name = $2 ${filter}`,
    params,
  );
  const paths = await db.query<{ path_signature: string; c: number }>(
    `select path_signature, count(*)::int as c
       from trajectories
      where project_id = $1 and agent_name = $2 ${filter}
      group by path_signature`,
    params,
  );
  const mom = (a: string): Moments => ({
    n: Number(r[`${a}_n`]),
    mean: Number(r[`${a}_mean`]),
    stddev: Number(r[`${a}_sd`]),
    p50: n(r[`${a}_p50`]) ?? undefined,
    p95: n(r[`${a}_p95`]) ?? undefined,
  });
  return {
    runs: Number(r.runs),
    errorRuns: Number(r.error_runs),
    toolCalls: Number(r.tool_calls),
    toolErrors: Number(r.tool_errors),
    durationMs: mom('d'),
    costUsd: mom('c'),
    stepCount: mom('s'),
    totalTokens: mom('k'),
    redundantToolCalls: mom('r'),
    paths: Object.fromEntries(paths.map((p) => [p.path_signature, Number(p.c)])),
  };
}

/* ------------------------------------------------------------------ */
/* Comparaisons prêtes à l'emploi                                        */
/* ------------------------------------------------------------------ */

export interface WindowCompareOptions {
  now?: Date;
  /** Fenêtre récente (défaut 24 h). */
  currentHours?: number;
  /** Fenêtre de référence, juste avant la récente (défaut 7 jours). */
  baselineDays?: number;
  minRuns?: number;
}

/** Les dernières 24 h comparées aux 7 jours qui précèdent. */
export async function compareRecentWindow(
  db: Db, projectId: string, agent: string, o: WindowCompareOptions = {},
): Promise<ComparisonResult> {
  const now = o.now ?? new Date();
  const currentHours = o.currentHours ?? 24;
  const baselineDays = o.baselineDays ?? 7;
  const split = new Date(now.getTime() - currentHours * 3600 * 1000);
  const start = new Date(split.getTime() - baselineDays * DAY);
  const [baseline, current] = await Promise.all([
    windowStats(db, projectId, agent, { from: start, to: split }),
    windowStats(db, projectId, agent, { from: split, to: now }),
  ]);
  return {
    mode: 'window',
    baselineLabel: `previous ${baselineDays} days`,
    currentLabel: `last ${currentHours} h`,
    baselineRuns: baseline.runs,
    currentRuns: current.runs,
    comparisons: compareWindows(baseline, current, { minRuns: o.minRuns }),
  };
}

/**
 * La dernière valeur d'une dimension (par première apparition) comparée à
 * la précédente — par défaut la version d'agent. null s'il n'y a pas
 * deux valeurs à comparer.
 */
export async function compareLatestVersions(
  db: Db, projectId: string, agent: string, o: { minRuns?: number; dimension?: Dimension } = {},
): Promise<ComparisonResult | null> {
  const dimension = o.dimension ?? 'agent';
  const versions = (await agentVersions(db, projectId, agent, dimension)).filter((v) => v.version !== null);
  if (versions.length < 2) return null;
  const [cur, prev] = versions; // tri : première apparition décroissante
  const [baseline, current] = await Promise.all([
    windowStats(db, projectId, agent, { version: prev.version, dimension }),
    windowStats(db, projectId, agent, { version: cur.version, dimension }),
  ]);
  return {
    mode: 'version',
    dimension,
    baselineLabel: prev.version!,
    currentLabel: cur.version!,
    baselineRuns: baseline.runs,
    currentRuns: current.runs,
    comparisons: compareWindows(baseline, current, { minRuns: o.minRuns }),
  };
}

/**
 * Deux valeurs choisies d'une même dimension : A (référence) contre B.
 * Ex. app 3.1.0 vs 3.2.0, prompt v7 vs v8, gpt-4o vs claude-sonnet-4-5.
 * Optionnellement restreint à une fenêtre de temps.
 */
export async function compareValues(
  db: Db, projectId: string, agent: string, dimension: Dimension, a: string, b: string,
  o: { minRuns?: number; from?: Date; to?: Date } = {},
): Promise<ComparisonResult> {
  const [baseline, current] = await Promise.all([
    windowStats(db, projectId, agent, { version: a, dimension, from: o.from, to: o.to }),
    windowStats(db, projectId, agent, { version: b, dimension, from: o.from, to: o.to }),
  ]);
  return {
    mode: 'ab',
    dimension,
    baselineLabel: a,
    currentLabel: b,
    baselineRuns: baseline.runs,
    currentRuns: current.runs,
    comparisons: compareWindows(baseline, current, { minRuns: o.minRuns }),
  };
}

/* ------------------------------------------------------------------ */
/* Runs                                                                 */
/* ------------------------------------------------------------------ */

export interface ListRunsOptions {
  agent?: string;
  /** Version d'agent. */
  version?: string;
  appVersion?: string;
  promptVersion?: string;
  model?: string;
  status?: 'ok' | 'error';
  /** Ne garder que les runs qui bouclent (appels d'outil répétés). */
  loopsOnly?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: { startedAt: string; id: string };
}

const SUMMARY_COLS = `id, trace_id, agent_name, app_version, agent_version, prompt_version, status, started_at, duration_ms,
  step_count, tool_call_count, tool_error_count, redundant_tool_calls, retry_count,
  cost_usd::float8 as cost_usd, cost_estimated, primary_model, path_signature, source_format`;

function toSummary(r: Record<string, unknown>): RunSummary {
  return {
    id: String(r.id),
    traceId: (r.trace_id as string | null) ?? null,
    agentName: String(r.agent_name),
    appVersion: (r.app_version as string | null) ?? null,
    agentVersion: (r.agent_version as string | null) ?? null,
    promptVersion: (r.prompt_version as string | null) ?? null,
    status: r.status as 'ok' | 'error',
    startedAt: iso(r.started_at as Date),
    durationMs: n(r.duration_ms),
    stepCount: Number(r.step_count),
    toolCallCount: Number(r.tool_call_count),
    toolErrorCount: Number(r.tool_error_count),
    redundantToolCalls: Number(r.redundant_tool_calls),
    retryCount: Number(r.retry_count),
    costUsd: n(r.cost_usd),
    costEstimated: Boolean(r.cost_estimated),
    primaryModel: (r.primary_model as string | null) ?? null,
    pathSignature: String(r.path_signature),
    sourceFormat: (r.source_format as string | null) ?? null,
  };
}

export async function listRuns(
  db: Db, projectId: string, o: ListRunsOptions = {},
): Promise<{ items: RunSummary[]; nextCursor: { startedAt: string; id: string } | null }> {
  const limit = Math.min(Math.max(o.limit ?? 50, 1), 200);
  const params: unknown[] = [projectId];
  const where = ['project_id = $1'];
  const add = (clause: (i: number) => string, value: unknown) => {
    params.push(value);
    where.push(clause(params.length));
  };
  if (o.agent) add((i) => `agent_name = $${i}`, o.agent);
  if (o.version) add((i) => `agent_version = $${i}`, o.version);
  if (o.appVersion) add((i) => `app_version = $${i}`, o.appVersion);
  if (o.promptVersion) add((i) => `prompt_version = $${i}`, o.promptVersion);
  if (o.model) add((i) => `primary_model = $${i}`, o.model);
  if (o.status) add((i) => `status = $${i}`, o.status);
  if (o.loopsOnly) where.push('redundant_tool_calls > 0');
  if (o.from) add((i) => `started_at >= $${i}::timestamptz`, o.from.toISOString());
  if (o.to) add((i) => `started_at < $${i}::timestamptz`, o.to.toISOString());
  if (o.cursor) {
    params.push(o.cursor.startedAt, o.cursor.id);
    const a = params.length - 1;
    where.push(`(started_at, id) < ($${a}::timestamptz, $${a + 1}::uuid)`);
  }
  params.push(limit + 1);
  const rows = await db.query<Record<string, unknown>>(
    `select ${SUMMARY_COLS} from trajectories
      where ${where.join(' and ')}
      order by started_at desc, id desc
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, limit).map(toSummary);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rows.length > limit && last ? { startedAt: last.startedAt, id: last.id } : null,
  };
}

export interface RunDetail {
  summary: RunSummary;
  trajectory: Trajectory;
}

export async function getRun(db: Db, projectId: string, id: string): Promise<RunDetail | null> {
  // Un id mal formé ferait échouer le cast uuid : on le traite comme introuvable.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.query<Record<string, unknown>>(
    `select ${SUMMARY_COLS}, schema_version, source, steps, metadata, created_at
       from trajectories where project_id = $1 and id = $2::uuid`,
    [projectId, id],
  );
  if (!r) return null;
  return {
    summary: toSummary(r),
    trajectory: {
      schemaVersion: Number(r.schema_version) as 1,
      id: String(r.id),
      source: r.source as Trajectory['source'],
      steps: asJson(r.steps as Trajectory['steps']),
      metadata: asJson(r.metadata as Trajectory['metadata']),
      createdAt: iso(r.created_at as Date),
    },
  };
}

/** Run précédent du même agent (pour comparer un run à son prédécesseur). */
export async function previousRunId(db: Db, projectId: string, run: RunSummary): Promise<string | null> {
  const [r] = await db.query<{ id: string }>(
    `select id from trajectories
      where project_id = $1 and agent_name = $2 and (started_at, id) < ($3::timestamptz, $4::uuid)
      order by started_at desc, id desc limit 1`,
    [projectId, run.agentName, run.startedAt, run.id],
  );
  return r?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Agrégats globaux (compatibilité GET /api/stats)                       */
/* ------------------------------------------------------------------ */

export async function projectStats(db: Db, projectId: string, since: Date | null) {
  const params: unknown[] = [projectId];
  let filter = '';
  if (since) {
    params.push(since.toISOString());
    filter = 'and started_at >= $2::timestamptz';
  }
  const [s] = await db.query<Record<string, unknown>>(
    `select count(*)::int as runs,
            coalesce(sum(cost_usd), 0)::float8 as cost,
            coalesce(sum(tool_call_count), 0)::int as tools,
            coalesce(avg(duration_ms), 0)::float8 as avg_duration
       from trajectories where project_id = $1 ${filter}`,
    params,
  );
  const trend = await db.query<{ day: string; cost: number }>(
    `select to_char(date_trunc('day', started_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
            coalesce(sum(cost_usd), 0)::float8 as cost
       from trajectories where project_id = $1 ${filter}
      group by 1 order by 1`,
    params,
  );
  return {
    totalRuns: Number(s.runs),
    totalCostUsd: Number(s.cost),
    totalToolCalls: Number(s.tools),
    avgDurationMs: Math.round(Number(s.avg_duration)),
    costOverTime: trend.map((t) => ({ date: t.day, costUsd: Number(t.cost) })),
  };
}

/* ------------------------------------------------------------------ */
/* Chemins d'outils les plus fréquents                                  */
/* ------------------------------------------------------------------ */

export async function topPaths(
  db: Db, projectId: string, agent: string, version: string | null | undefined, limit = 5,
  dimension: Dimension = 'agent',
): Promise<{ total: number; paths: Array<{ path: string; runs: number; share: number }> }> {
  const params: unknown[] = [projectId, agent];
  const filter = populationFilter({ version, dimension }, params);
  params.push(limit);
  const rows = await db.query<{ path_signature: string; c: number; total: number }>(
    `select path_signature, count(*)::int as c, (sum(count(*)) over ())::int as total
       from trajectories
      where project_id = $1 and agent_name = $2 ${filter}
      group by path_signature
      order by c desc, path_signature
      limit $${params.length}`,
    params,
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    total,
    paths: rows.map((r) => ({ path: r.path_signature, runs: Number(r.c), share: total ? Number(r.c) / total : 0 })),
  };
}
