import { NextResponse } from 'next/server';
import { dashboardRoute, decodeCursor, encodeCursor, parseDate } from '../../../lib/route';
import { apiError } from '../../../lib/errors';
import { listRuns } from '../../../server/queries';

/**
 * GET /api/runs?agent&version&appVersion&promptVersion&model&status=ok|error&loops=1&from&to&limit&cursor
 * Liste légère (jamais les steps), pagination par curseur (started_at, id).
 */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const p = req.nextUrl.searchParams;
  const status = p.get('status');
  if (status && status !== 'ok' && status !== 'error') return apiError('VALIDATION_ERROR', 'status must be ok or error.');
  const from = parseDate(p.get('from'));
  const to = parseDate(p.get('to'));
  if (from === null || to === null) return apiError('VALIDATION_ERROR', 'Invalid from/to (ISO 8601 expected).');
  let cursor;
  if (p.get('cursor')) {
    cursor = decodeCursor(p.get('cursor')!);
    if (!cursor) return apiError('VALIDATION_ERROR', 'Invalid cursor.');
  }
  const page = await listRuns(db, project.id, {
    agent: p.get('agent') ?? undefined,
    version: p.get('version') ?? undefined,
    appVersion: p.get('appVersion') ?? undefined,
    promptVersion: p.get('promptVersion') ?? undefined,
    model: p.get('model') ?? undefined,
    status: (status as 'ok' | 'error' | null) ?? undefined,
    loopsOnly: p.get('loops') === '1',
    from, to, cursor,
    limit: Number(p.get('limit') ?? 50),
  });
  return NextResponse.json({ items: page.items, nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null });
});
