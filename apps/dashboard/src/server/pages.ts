/**
 * Chargement des données de chaque page. Séparé des composants Next
 * pour être testable (et rendu hors de Next pour les captures).
 */

import { annotateSteps, diffTrajectories, type Comparison, type StepAnnotation, type TrajectoryDiff } from '@trajekt-ai/core';
import type { Db } from './db';
import {
  DIMENSIONS, compareValues, type Dimension,
  agentTimeseries, agentVersions, compareLatestVersions, compareRecentWindow, getRun,
  listAgents, listRuns, previousRunId, topPaths,
  type AgentOverview, type ComparisonResult, type ListRunsOptions, type RunDetail,
  type RunSummary, type TimeseriesPoint, type VersionStats,
} from './queries';
import { recentAlerts, type AlertRow } from './alerts';
import { listEvalAgents, loadSuitePage, type EvalAgent } from './suites';

const DAY = 86400_000;

export type Health = 'regressed' | 'healthy' | 'insufficient' | 'idle';

export interface AgentHealth {
  agent: AgentOverview;
  health: Health;
  findings: Array<Comparison & { scope: string }>;
}

/** Même logique que le check d'alertes, sans rien persister. */
async function healthOf(db: Db, projectId: string, agent: AgentOverview, now: Date): Promise<AgentHealth> {
  if (agent.runs24h === 0) return { agent, health: 'idle', findings: [] };
  const results: ComparisonResult[] = [await compareRecentWindow(db, projectId, agent.name, { now })];
  const versions = await agentVersions(db, projectId, agent.name);
  const latest = versions.find((v) => v.version !== null);
  if (latest && now.getTime() - new Date(latest.firstSeen).getTime() <= 7 * DAY) {
    const v = await compareLatestVersions(db, projectId, agent.name);
    if (v) results.unshift(v);
  }
  const seen = new Set<string>();
  const findings: AgentHealth['findings'] = [];
  for (const r of results) {
    for (const c of r.comparisons) {
      if (c.verdict !== 'regression' || seen.has(c.metric)) continue;
      seen.add(c.metric);
      findings.push({ ...c, scope: `${r.currentLabel} vs ${r.baselineLabel}` });
    }
  }
  const allInsufficient = results.every((r) => r.comparisons.every((c) => c.verdict === 'insufficient'));
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  return { agent, health: findings.length ? 'regressed' : allInsufficient ? 'insufficient' : 'healthy', findings };
}

export async function loadAgentsPage(db: Db, projectId: string, now = new Date()) {
  const agents = await listAgents(db, projectId, now);
  const healths: AgentHealth[] = [];
  for (const a of agents) healths.push(await healthOf(db, projectId, a, now));
  const order: Record<Health, number> = { regressed: 0, healthy: 1, insufficient: 2, idle: 3 };
  healths.sort((a, b) => order[a.health] - order[b.health]);
  // Suites d'évaluation : la dernière version d'agent contre la précédente.
  const evals = [];
  for (const e of await listEvalAgents(db, projectId)) {
    const suite = await loadSuitePage(db, projectId, e.name, { dimension: 'agent' });
    const c = suite?.comparison ?? null;
    evals.push({
      ...e,
      a: suite?.a ?? null,
      b: suite?.b ?? null,
      result: c?.result ?? null,
      reasons: c?.reasons ?? [],
      worse: c?.scenarios.filter((x) => x.verdict === 'regression').length ?? 0,
      paired: c?.paired ?? 0,
    });
  }
  return { agents: healths, evals, alerts: await recentAlerts(db, projectId, { limit: 8 }), now: now.toISOString() };
}
export type AgentsPageData = Awaited<ReturnType<typeof loadAgentsPage>>;

export type CompareMode = 'version' | 'window' | 'ab';

export interface AgentPageData {
  name: string;
  now: string;
  mode: CompareMode;
  /** Dimension affichée (comparaison, tableau des valeurs, chemins). */
  dimension: Dimension;
  /** Valeurs connues de chaque dimension, la plus récente d'abord. */
  dimensionValues: Record<Dimension, string[]>;
  /** Valeurs comparées en mode ab. */
  selected: { a: string | null; b: string | null };
  overview: AgentOverview | null;
  timeseries: TimeseriesPoint[];
  markers: Array<{ at: number; label: string }>;
  /** Métriques par valeur de la dimension affichée. */
  versions: VersionStats[];
  comparison: ComparisonResult | null;
  /** Le mode version est-il disponible (au moins deux valeurs) ? */
  canCompareVersions: boolean;
  paths: Array<{ version: string | null; total: number; paths: Array<{ path: string; runs: number; share: number }> }>;
  recentRuns: RunSummary[];
  alerts: AlertRow[];
  /** Suites d'évaluation de l'agent, s'il en a. */
  evals: EvalAgent | null;
}

export interface AgentPageOptions {
  mode?: CompareMode;
  dimension?: Dimension;
  a?: string;
  b?: string;
  now?: Date;
  days?: number;
}

export async function loadAgentPage(
  db: Db, projectId: string, name: string, opts: AgentPageOptions = {},
): Promise<AgentPageData | null> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 14;
  const dimension = opts.dimension ?? 'agent';
  const overview = (await listAgents(db, projectId, now)).find((a) => a.name === name) ?? null;

  const dims = Object.keys(DIMENSIONS) as Dimension[];
  const statsByDim = Object.fromEntries(
    await Promise.all(dims.map(async (d) => [d, await agentVersions(db, projectId, name, d)] as const)),
  ) as Record<Dimension, VersionStats[]>;
  if (!overview && statsByDim.agent.length === 0) return null;
  const dimensionValues = Object.fromEntries(
    dims.map((d) => [d, statsByDim[d].map((v) => v.version).filter((v): v is string => v !== null)]),
  ) as Record<Dimension, string[]>;
  const versions = statsByDim[dimension];

  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY);
  const timeseries = await agentTimeseries(db, projectId, name, { from, to: now, bucket: 'day' });
  // Déploiements : première apparition de chaque valeur. Les modèles d'un
  // A/B tournent en parallèle, ce ne sont pas des déploiements : on montre
  // alors ceux de l'agent.
  const markerDim: Dimension = dimension === 'model' ? 'agent' : dimension;
  const markers = statsByDim[markerDim]
    .filter((v) => v.version !== null && new Date(v.firstSeen) > from)
    .map((v) => ({ at: (new Date(v.firstSeen).getTime() - from.getTime()) / DAY - 0.5, label: v.version! }));

  const values = dimensionValues[dimension];
  const latest = await compareLatestVersions(db, projectId, name, { dimension });
  let mode: CompareMode = opts.mode ?? (latest ? 'version' : 'window');
  let selected: AgentPageData['selected'] = { a: null, b: null };
  let comparison: ComparisonResult | null = null;
  if (mode === 'ab') {
    // Par défaut : B = la valeur la plus récente, A = la précédente. Pour les
    // modèles (souvent testés en parallèle), A = le modèle le plus utilisé,
    // B = le suivant — on compare le challenger au modèle en place.
    const ordered = dimension === 'model'
      ? [...versions].filter((v) => v.version !== null).sort((x, y) => y.runs - x.runs).map((v) => v.version!)
      : values;
    const [defA, defB] = dimension === 'model' ? [ordered[0], ordered[1]] : [ordered[1], ordered[0]];
    const a = opts.a && values.includes(opts.a) ? opts.a : defA;
    const b = opts.b && values.includes(opts.b) ? opts.b : defB;
    if (a && b) {
      selected = { a, b };
      comparison = await compareValues(db, projectId, name, dimension, a, b);
    } else {
      mode = 'window';
    }
  }
  if (mode === 'version') {
    comparison = latest;
    if (!comparison) mode = 'window';
  }
  if (mode === 'window') comparison = await compareRecentWindow(db, projectId, name, { now });

  // Chemins d'outils : les deux valeurs comparées (ou les deux plus récentes).
  const pathValues = mode === 'ab' && selected.a && selected.b ? [selected.b, selected.a] : values.slice(0, 2);
  const paths = [];
  for (const v of pathValues.length ? pathValues : [undefined]) {
    paths.push({ version: v ?? null, ...(await topPaths(db, projectId, name, v, 5, dimension)) });
  }

  return {
    name,
    now: now.toISOString(),
    mode,
    dimension,
    dimensionValues,
    selected,
    overview,
    timeseries,
    markers,
    versions,
    comparison,
    canCompareVersions: Boolean(latest),
    paths,
    recentRuns: (await listRuns(db, projectId, { agent: name, kind: 'live', limit: 12 })).items,
    alerts: await recentAlerts(db, projectId, { agent: name, limit: 5 }),
    evals: (await listEvalAgents(db, projectId)).find((e) => e.name === name) ?? null,
  };
}

export interface RunsPageData {
  filters: ListRunsOptions & { cursorParam?: string };
  runs: RunSummary[];
  nextCursor: { startedAt: string; id: string } | null;
  agents: string[];
  /** Valeurs des dimensions de l'agent filtré (vides sans agent). */
  versions: string[];
  appVersions: string[];
  promptVersions: string[];
  models: string[];
}

export async function loadRunsPage(db: Db, projectId: string, filters: ListRunsOptions): Promise<RunsPageData> {
  const page = await listRuns(db, projectId, { ...filters, limit: 50 });
  const agents = (await db.query<{ agent_name: string }>(
    'select distinct agent_name from trajectories where project_id = $1 order by 1', [projectId],
  )).map((r) => r.agent_name);
  const valuesOf = async (d: Dimension) =>
    filters.agent
      ? (await agentVersions(db, projectId, filters.agent, d)).map((v) => v.version).filter((v): v is string => v !== null)
      : [];
  return {
    filters, runs: page.items, nextCursor: page.nextCursor, agents,
    versions: await valuesOf('agent'),
    appVersions: await valuesOf('app'),
    promptVersions: await valuesOf('prompt'),
    models: await valuesOf('model'),
  };
}

export interface RunPageData extends RunDetail {
  annotations: StepAnnotation[];
  previousId: string | null;
}

export async function loadRunPage(db: Db, projectId: string, id: string): Promise<RunPageData | null> {
  const run = await getRun(db, projectId, id);
  if (!run) return null;
  return { ...run, annotations: annotateSteps(run.trajectory), previousId: await previousRunId(db, projectId, run.summary) };
}

export interface ComparePageData {
  a: RunDetail;
  b: RunDetail;
  diff: TrajectoryDiff;
  /** Comment A a été choisi quand l'URL ne le précise pas. */
  baselineReason: 'explicit' | 'previous-version' | 'previous-run';
}

/**
 * Compare le run `id` (B) à `withId` (A). Sans `withId` : le dernier run
 * réussi de la version précédente de l'agent, sinon le run précédent.
 */
export async function loadComparePage(db: Db, projectId: string, id: string, withId?: string): Promise<ComparePageData | null> {
  const b = await getRun(db, projectId, id);
  if (!b) return null;
  let a: RunDetail | null = null;
  let reason: ComparePageData['baselineReason'] = 'explicit';
  if (withId) {
    a = await getRun(db, projectId, withId);
  } else {
    // Run d'évaluation : la version précédente jouée sur le même scénario.
    const scenario = b.summary.scenario;
    const versions = scenario
      ? (await db.query<{ version: string }>(
          `select agent_version as version from trajectories
            where project_id = $1 and agent_name = $2 and scenario = $3 and agent_version is not null
            group by agent_version order by min(started_at) desc`,
          [projectId, b.summary.agentName, scenario],
        ))
      : (await agentVersions(db, projectId, b.summary.agentName)).filter((v) => v.version !== null);
    const idx = versions.findIndex((v) => v.version === b.summary.agentVersion);
    const prev = idx >= 0 ? versions[idx + 1] : undefined;
    if (prev) {
      const [row] = await db.query<{ id: string }>(
        `select id from trajectories
          where project_id = $1 and agent_name = $2 and agent_version = $3 and status = 'ok'
            and scenario is not distinct from $4
          order by started_at desc limit 1`,
        [projectId, b.summary.agentName, prev.version, scenario],
      );
      if (row) {
        a = await getRun(db, projectId, row.id);
        reason = 'previous-version';
      }
    }
    if (!a) {
      const prevId = await previousRunId(db, projectId, b.summary);
      if (prevId) {
        a = await getRun(db, projectId, prevId);
        reason = 'previous-run';
      }
    }
  }
  if (!a) return null;
  return { a, b, diff: diffTrajectories(a.trajectory, b.trajectory), baselineReason: reason };
}
