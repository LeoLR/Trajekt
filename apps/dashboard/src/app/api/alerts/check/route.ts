/**
 * POST /api/alerts/check — lance la détection de régression et notifie
 * Slack (SLACK_WEBHOOK_URL) pour les nouvelles alertes.
 *
 * Fait pour un cron (Vercel Cron, GitHub Actions, crontab + curl) :
 *   Authorization: Bearer $CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'node:crypto';
import { getDb } from '../../../../server/db';
import { getDefaultProject } from '../../../../server/auth';
import { checkRegressions, slackNotifier } from '../../../../server/alerts';
import { apiError } from '../../../../lib/errors';

export const runtime = 'nodejs';

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const a = createHash('sha256').update(header.slice(7)).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) return apiError('NOT_CONFIGURED', 'Set CRON_SECRET to enable regression checks.');
  if (!authorized(req.headers.get('authorization'))) return apiError('UNAUTHORIZED', 'Invalid cron secret.');
  const db = getDb();
  const project = await getDefaultProject(db);
  if (!project) return apiError('NOT_CONFIGURED', 'No project yet.');
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const result = await checkRegressions(db, project.id, {
    notify: webhook ? slackNotifier(webhook, process.env.TRAJEKT_PUBLIC_URL) : undefined,
  });
  return NextResponse.json({
    agentsChecked: result.agentsChecked,
    regressions: result.regressions,
    alertsCreated: result.alertsCreated.length,
    suppressedByCooldown: result.suppressedByCooldown,
    notified: Boolean(webhook) && result.alertsCreated.length > 0,
  });
}

export const POST = handle;
// Vercel Cron appelle en GET.
export const GET = handle;
