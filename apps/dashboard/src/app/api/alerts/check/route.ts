/**
 * POST /api/alerts/check — lance la détection de régression sur tous les
 * projets, notifie Slack (SLACK_WEBHOOK_URL) pour les nouvelles alertes,
 * et purge les runs plus vieux que TRAJEKT_RETENTION_DAYS.
 *
 * Fait pour un cron (Vercel Cron, GitHub Actions, crontab + curl) :
 *   Authorization: Bearer $CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'node:crypto';
import { getDb } from '../../../../server/db';
import { runMaintenance } from '../../../../server/maintenance';
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
  const { newAlerts, ...summary } = await runMaintenance(getDb(), {
    webhook: process.env.SLACK_WEBHOOK_URL,
    publicUrl: process.env.TRAJEKT_PUBLIC_URL,
  });
  return NextResponse.json({ ...summary, newAlerts });
}

export const POST = handle;
// Vercel Cron appelle en GET.
export const GET = handle;
