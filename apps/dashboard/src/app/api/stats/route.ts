import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../lib/route';
import { apiError } from '../../../lib/errors';
import { projectStats } from '../../../server/queries';

const RANGES: Record<string, number | null> = { '24h': 1, '7d': 7, '30d': 30, all: null };

/** GET /api/stats?range=24h|7d|30d|all — agrégats du projet (phase 1, conservé). */
export const GET = dashboardRoute(async ({ req, db, project, now }) => {
  const range = req.nextUrl.searchParams.get('range') ?? '7d';
  if (!(range in RANGES)) return apiError('VALIDATION_ERROR', 'range must be 24h, 7d, 30d or all.');
  const days = RANGES[range];
  const since = days === null ? null : new Date(now.getTime() - days * 86400_000);
  return NextResponse.json(await projectStats(db, project.id, since));
});
