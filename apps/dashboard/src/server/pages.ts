/**
 * Chargement des données de chaque page. Séparé des composants Next
 * pour être testable (et rendu hors de Next pour les captures).
 */

import { annotateSteps, type Comparison, type StepAnnotation } from '@trajekt/core';
import type { Db } from './db';
import {
  agentTimeseries, agentVersions, compareLatestVersions, compareRecentWindow, getRun,
  listAgents, listRuns, previousRunId, topPaths,
  type AgentOverview, type ComparisonResult, type ListRunsOptions, type RunDetail,
  type RunSummary, type TimeseriesPoint, type VersionStats,
} from './queries';
import { recentAlerts, type AlertRow } from './alerts';

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
  return { agents: healths, alerts: await recentAlerts(db, projectId, { limit: 8 }), now: now.toISOString() };
}
export type AgentsPageData = Awaited<ReturnType<typeof loadAgentsPage>>;

export interface AgentPageData {
  name: string;
  now: string;
  mode: 'version' | 'window';
  overview: AgentOverview | null;
  timeseries: TimeseriesPoint[];
  markers: Array<{ at: number; label: string }>;
  versions: VersionStats[];
  comparison: ComparisonResult | null;
  /** Le mode version est-il disponible (au moins deux versions) ? */
  canCompareVersions: boolean;
  paths: Array<{ version: string | null; total: number; paths: Array<{ path: string; runs: number; share: number }> }>;
  recentRuns: RunSummary[];
  alerts: AlertRow[];
}

export async function loadAgentPage(
  db: Db, projectId: string, name: string, opts: { mode?: 'version' | 'window'; now?: Date; days?: number } = {},
): Promise<AgentPageData | null> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 14;
  const overview = (await listAgents(db, projectId, now)).find((a) => a.name === name) ?? null;
  const versions = await agentVersions(db, projectId, name);
  if (!overview && versions.length === 0) return null;

  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY);
  const timeseries = await agentTimeseries(db, projectId, name, { from, to: now, bucket: 'day' });
  const markers = versions
    .filter((v) => v.version !== null && new Date(v.firstSeen) > from)
    .map((v) => ({ at: (new Date(v.firstSeen).getTime() - from.getTime()) / DAY - 0.5, label: v.version! }));

  const byVersion = await compareLatestVersions(db, projectId, name);
  const mode = opts.mode ?? (byVersion ? 'version' : 'window');
  const comparison = mode === 'version' ? byVersion : await compareRecentWindow(db, projectId, name, { now });

  const named = versions.filter((v) => v.version !== null).slice(0, 2);
  const paths = [];
  for (const v of named.length ? named : [{ version: undefined as string | undefined }]) {
    paths.push({ version: v.version ?? null, ...(await topPaths(db, projectId, name, v.version, 5)) });
  }

  return {
    name,
    now: now.toISOString(),
    mode,
    overview,
    timeseries,
    markers,
    versions,
    comparison,
    canCompareVersions: Boolean(byVersion),
    paths,
    recentRuns: (await listRuns(db, projectId, { agent: name, limit: 12 })).items,
    alerts: await recentAlerts(db, projectId, { agent: name, limit: 5 }),
  };
}

export interface RunsPageData {
  filters: ListRunsOptions & { cursorParam?: string };
  runs: RunSummary[];
  nextCursor: { startedAt: string; id: string } | null;
  agents: string[];
  versions: string[];
}

export async function loadRunsPage(db: Db, projectId: string, filters: ListRunsOptions): Promise<RunsPageData> {
  const page = await listRuns(db, projectId, { ...filters, limit: 50 });
  const agents = (await db.query<{ agent_name: string }>(
    'select distinct agent_name from trajectories where project_id = $1 order by 1', [projectId],
  )).map((r) => r.agent_name);
  const versions = filters.agent
    ? (await agentVersions(db, projectId, filters.agent)).map((v) => v.version).filter((v): v is string => v !== null)
    : [];
  return { filters, runs: page.items, nextCursor: page.nextCursor, agents, versions };
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
