/**
 * Détection de régression en continu + notification.
 *
 * À appeler périodiquement (POST /api/alerts/check depuis un cron, ou
 * `pnpm check-regressions`). Pour chaque agent actif :
 *   - fenêtre récente (24 h) contre les 7 jours précédents ;
 *   - dernière version contre la précédente, si elle a été déployée
 *     dans les 7 derniers jours.
 * Une même alerte (agent + métrique + mode) n'est réémise qu'après le
 * délai de cooldown, pour que Slack ne devienne pas du bruit.
 */

import { metricLabel, type Comparison, type AnyMetricKey } from '@trajekt-ai/core';
import type { Db } from './db';
import { asJson } from './ingest';
import { agentVersions, compareLatestVersions, compareRecentWindow, type ComparisonResult } from './queries';
import { formatDelta, formatMetric } from '../lib/format';

export interface NewAlert {
  agentName: string;
  mode: 'window' | 'version';
  baselineLabel: string;
  currentLabel: string;
  comparison: Comparison;
}

export type Notifier = (alerts: NewAlert[]) => Promise<void>;

export interface CheckOptions {
  now?: Date;
  cooldownHours?: number;
  minRuns?: number;
  notify?: Notifier;
}

export interface CheckResult {
  agentsChecked: number;
  regressions: number;
  alertsCreated: NewAlert[];
  suppressedByCooldown: number;
}

const DAY = 24 * 3600 * 1000;

export async function checkRegressions(db: Db, projectId: string, o: CheckOptions = {}): Promise<CheckResult> {
  const now = o.now ?? new Date();
  const cooldownMs = (o.cooldownHours ?? 24) * 3600 * 1000;

  const agents = await db.query<{ agent_name: string }>(
    `select distinct agent_name from trajectories
      where project_id = $1 and scenario is null and started_at >= $2::timestamptz and started_at < $3::timestamptz`,
    [projectId, new Date(now.getTime() - DAY).toISOString(), now.toISOString()],
  );

  const candidates: NewAlert[] = [];
  for (const { agent_name: agent } of agents) {
    const results: ComparisonResult[] = [
      await compareRecentWindow(db, projectId, agent, { now, minRuns: o.minRuns }),
    ];
    // Une nouvelle valeur (agent, prompt ou appli) de moins de 7 jours est
    // comparée à la précédente : un changement de prompt sans nouvelle
    // version d'agent doit aussi pouvoir déclencher une alerte.
    for (const dimension of ['agent', 'prompt', 'app'] as const) {
      const versions = await agentVersions(db, projectId, agent, dimension);
      const latest = versions.find((v) => v.version !== null);
      if (!latest || now.getTime() - new Date(latest.firstSeen).getTime() > 7 * DAY) continue;
      const byVersion = await compareLatestVersions(db, projectId, agent, { minRuns: o.minRuns, dimension });
      if (!byVersion) continue;
      if (dimension !== 'agent') {
        byVersion.baselineLabel = `${dimension} ${byVersion.baselineLabel}`;
        byVersion.currentLabel = `${dimension} ${byVersion.currentLabel}`;
      }
      results.push(byVersion);
    }
    // Une seule alerte par métrique et par mode : la première trouvée
    // (fenêtre, puis agent, prompt, appli) suffit à signaler le problème.
    const seen = new Set<string>();
    for (const r of results) {
      const mode = r.mode === 'window' ? 'window' : 'version';
      for (const c of r.comparisons) {
        if (c.verdict !== 'regression' || seen.has(`${mode}:${c.metric}`)) continue;
        seen.add(`${mode}:${c.metric}`);
        candidates.push({ agentName: agent, mode, baselineLabel: r.baselineLabel, currentLabel: r.currentLabel, comparison: c });
      }
    }
  }

  const created: NewAlert[] = [];
  let suppressed = 0;
  for (const a of candidates) {
    const [recent] = await db.query<{ id: string }>(
      `select id from alerts
        where project_id = $1 and agent_name = $2 and metric = $3 and mode = $4
          and created_at > $5::timestamptz
        limit 1`,
      [projectId, a.agentName, a.comparison.metric, a.mode, new Date(now.getTime() - cooldownMs).toISOString()],
    );
    if (recent) {
      suppressed++;
      continue;
    }
    await db.query(
      `insert into alerts (project_id, agent_name, mode, metric, severity, baseline, current, rel_delta, detail, context, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11::timestamptz)`,
      [
        projectId, a.agentName, a.mode, a.comparison.metric, a.comparison.severity ?? 'warning',
        a.comparison.baseline, a.comparison.current, a.comparison.relDelta, a.comparison.detail ?? null,
        JSON.stringify({ baseline: a.baselineLabel, current: a.currentLabel, pValue: a.comparison.pValue }),
        now.toISOString(),
      ],
    );
    created.push(a);
  }

  if (created.length && o.notify) {
    await o.notify(created);
    await db.query(
      `update alerts set notified_at = $3::timestamptz
        where project_id = $1 and notified_at is null and created_at = $2::timestamptz`,
      [projectId, now.toISOString(), new Date().toISOString()],
    );
  }

  return {
    agentsChecked: agents.length,
    regressions: candidates.length,
    alertsCreated: created,
    suppressedByCooldown: suppressed,
  };
}

export interface AlertRow {
  id: string;
  agentName: string;
  mode: 'window' | 'version';
  metric: AnyMetricKey;
  severity: 'warning' | 'critical';
  baseline: number | null;
  current: number | null;
  relDelta: number | null;
  detail: string | null;
  baselineLabel: string | null;
  currentLabel: string | null;
  createdAt: string;
}

export async function recentAlerts(db: Db, projectId: string, opts: { agent?: string; limit?: number } = {}): Promise<AlertRow[]> {
  const params: unknown[] = [projectId, opts.limit ?? 20];
  let filter = '';
  if (opts.agent) {
    params.push(opts.agent);
    filter = 'and agent_name = $3';
  }
  const rows = await db.query<Record<string, unknown>>(
    `select id, agent_name, mode, metric, severity, baseline, current, rel_delta, detail, context, created_at
       from alerts where project_id = $1 ${filter}
      order by created_at desc limit $2`,
    params,
  );
  return rows.map((r) => {
    const ctx = (asJson(r.context as Record<string, unknown> | string) ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      agentName: String(r.agent_name),
      mode: r.mode as AlertRow['mode'],
      metric: r.metric as AlertRow['metric'],
      severity: r.severity as AlertRow['severity'],
      baseline: r.baseline == null ? null : Number(r.baseline),
      current: r.current == null ? null : Number(r.current),
      relDelta: r.rel_delta == null ? null : Number(r.rel_delta),
      detail: (r.detail as string | null) ?? null,
      baselineLabel: (ctx.baseline as string | undefined) ?? null,
      currentLabel: (ctx.current as string | undefined) ?? null,
      createdAt: (r.created_at as Date).toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Slack                                                                 */
/* ------------------------------------------------------------------ */

export function slackMessage(alerts: NewAlert[], dashboardUrl?: string) {
  const lines = alerts.map((a) => {
    const c = a.comparison;
    const icon = c.severity === 'critical' ? ':red_circle:' : ':large_orange_circle:';
    const scope = `${a.currentLabel} vs ${a.baselineLabel}`;
    const link = dashboardUrl ? ` <${dashboardUrl}/agents/${encodeURIComponent(a.agentName)}|open>` : '';
    return `${icon} *${a.agentName}* — ${metricLabel(c.metric)}: ${formatMetric(c.metric, c.baseline)} → ${formatMetric(c.metric, c.current)} (${formatDelta(c.metric, c.delta, c.relDelta)}) · ${scope}${link}`;
  });
  return {
    text: `Trajekt: ${alerts.length} regression${alerts.length > 1 ? 's' : ''} detected`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Trajekt — ${alerts.length} regression${alerts.length > 1 ? 's' : ''} detected*` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  };
}

export function slackNotifier(webhookUrl: string, dashboardUrl?: string): Notifier {
  return async (alerts) => {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(slackMessage(alerts, dashboardUrl)),
    });
    if (!res.ok) throw new Error(`Slack webhook answered ${res.status}`);
  };
}
