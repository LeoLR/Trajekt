import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../../lib/route';
import { apiError } from '../../../../../lib/errors';
import { compareLatestVersions, compareRecentWindow } from '../../../../../server/queries';

/**
 * GET /api/agents/:name/compare?mode=window|version
 *   window  : dernières 24 h vs 7 jours précédents (currentHours, baselineDays ajustables)
 *   version : dernière version vs la précédente
 */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  const p = req.nextUrl.searchParams;
  const mode = p.get('mode') ?? 'window';
  if (mode === 'version') {
    const result = await compareLatestVersions(db, project.id, name);
    if (!result) return apiError('NOT_FOUND', 'This agent has fewer than two versions to compare.');
    return NextResponse.json(result);
  }
  if (mode !== 'window') return apiError('VALIDATION_ERROR', 'mode must be window or version.');
  const currentHours = Number(p.get('currentHours') ?? 24);
  const baselineDays = Number(p.get('baselineDays') ?? 7);
  if (!(currentHours > 0 && currentHours <= 24 * 7 && baselineDays > 0 && baselineDays <= 60)) {
    return apiError('VALIDATION_ERROR', 'currentHours must be in (0, 168], baselineDays in (0, 60].');
  }
  return NextResponse.json(await compareRecentWindow(db, project.id, name, { currentHours, baselineDays }));
});
