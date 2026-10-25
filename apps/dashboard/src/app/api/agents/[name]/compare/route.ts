import { NextResponse } from 'next/server';
import { dashboardRoute, parseDate } from '../../../../../lib/route';
import { apiError } from '../../../../../lib/errors';
import { compareLatestVersions, compareRecentWindow, compareValues, isDimension } from '../../../../../server/queries';

/**
 * GET /api/agents/:name/compare
 *   mode=window  (défaut) dernières currentHours (24) vs les baselineDays (7) jours précédents
 *   mode=version dernière valeur de `dimension` vs la précédente
 *   mode=ab      deux valeurs choisies : dimension=app|agent|prompt|model&a=<A>&b=<B>[&from&to]
 */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  const p = req.nextUrl.searchParams;
  const mode = p.get('mode') ?? 'window';
  const dimension = p.get('dimension') ?? 'agent';
  if (!isDimension(dimension)) return apiError('VALIDATION_ERROR', 'dimension must be app, agent, prompt or model.');

  if (mode === 'ab') {
    const a = p.get('a');
    const b = p.get('b');
    if (!a || !b) return apiError('VALIDATION_ERROR', 'mode=ab needs both a and b.');
    const from = parseDate(p.get('from'));
    const to = parseDate(p.get('to'));
    if (from === null || to === null) return apiError('VALIDATION_ERROR', 'Invalid from/to (ISO 8601 expected).');
    return NextResponse.json(await compareValues(db, project.id, name, dimension, a, b, { from, to }));
  }
  if (mode === 'version') {
    const result = await compareLatestVersions(db, project.id, name, { dimension });
    if (!result) return apiError('NOT_FOUND', `This agent has fewer than two values of ${dimension} to compare.`);
    return NextResponse.json(result);
  }
  if (mode !== 'window') return apiError('VALIDATION_ERROR', 'mode must be window, version or ab.');
  const currentHours = Number(p.get('currentHours') ?? 24);
  const baselineDays = Number(p.get('baselineDays') ?? 7);
  if (!(currentHours > 0 && currentHours <= 24 * 7 && baselineDays > 0 && baselineDays <= 60)) {
    return apiError('VALIDATION_ERROR', 'currentHours must be in (0, 168], baselineDays in (0, 60].');
  }
  return NextResponse.json(await compareRecentWindow(db, project.id, name, { currentHours, baselineDays }));
});
