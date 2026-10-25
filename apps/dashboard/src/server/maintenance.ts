/**
 * Tâches périodiques : détection de régression sur tous les projets, et
 * purge des vieux runs (TRAJEKT_RETENTION_DAYS). Lancées par le cron
 * (POST /api/alerts/check) ou par `pnpm check-regressions`.
 */

import type { Db } from './db';
import { listProjects } from './auth';
import { checkRegressions, slackNotifier } from './alerts';

export interface MaintenanceResult {
  projects: number;
  agentsChecked: number;
  regressions: number;
  alertsCreated: number;
  suppressedByCooldown: number;
  notified: boolean;
  purgedRuns: number;
  newAlerts: Array<{ project: string; agent: string; metric: string; severity: string }>;
}

/** Nombre de jours de rétention, ou null (rien n'est supprimé). */
export function retentionDays(env = process.env): number | null {
  const v = Number(env.TRAJEKT_RETENTION_DAYS);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Supprime les runs (et leurs scores) plus vieux que la rétention, et les alertes de plus de 90 jours. */
export async function purgeOldRuns(db: Db, now = new Date(), days = retentionDays()): Promise<number> {
  if (days === null) return 0;
  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString();
  const [{ n }] = await db.query<{ n: number }>(
    `with d as (delete from trajectories where started_at < $1::timestamptz returning 1) select count(*)::int as n from d`,
    [cutoff],
  );
  await db.query(`delete from alerts where created_at < $1::timestamptz`, [new Date(now.getTime() - Math.max(days, 90) * 86400_000).toISOString()]);
  return Number(n);
}

export async function runMaintenance(db: Db, o: { now?: Date; webhook?: string; publicUrl?: string } = {}): Promise<MaintenanceResult> {
  const out: MaintenanceResult = {
    projects: 0, agentsChecked: 0, regressions: 0, alertsCreated: 0, suppressedByCooldown: 0,
    notified: false, purgedRuns: 0, newAlerts: [],
  };
  for (const p of await listProjects(db)) {
    out.projects++;
    const r = await checkRegressions(db, p.id, {
      now: o.now,
      notify: o.webhook ? slackNotifier(o.webhook, o.publicUrl) : undefined,
    });
    out.agentsChecked += r.agentsChecked;
    out.regressions += r.regressions;
    out.alertsCreated += r.alertsCreated.length;
    out.suppressedByCooldown += r.suppressedByCooldown;
    out.notified ||= Boolean(o.webhook) && r.alertsCreated.length > 0;
    for (const a of r.alertsCreated) out.newAlerts.push({ project: p.name, agent: a.agentName, metric: a.comparison.label, severity: a.comparison.severity ?? 'warning' });
  }
  out.purgedRuns = await purgeOldRuns(db, o.now);
  return out;
}
