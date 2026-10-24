import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../lib/route';
import { recentAlerts } from '../../../server/alerts';

/** GET /api/alerts?agent&limit — alertes de régression émises, les plus récentes d'abord. */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const p = req.nextUrl.searchParams;
  return NextResponse.json({
    alerts: await recentAlerts(db, project.id, {
      agent: p.get('agent') ?? undefined,
      limit: Math.min(Number(p.get('limit') ?? 20), 100),
    }),
  });
});
