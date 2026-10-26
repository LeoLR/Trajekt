import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../lib/route';
import { apiError } from '../../../../lib/errors';
import { getRun } from '../../../../server/queries';

/** GET /api/runs/:id — métriques du run + la Trajectory complète (@trajekt-ai/core). */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const id = req.nextUrl.pathname.split('/').pop() ?? '';
  const run = await getRun(db, project.id, id);
  if (!run) return apiError('NOT_FOUND', `No run with id ${id}.`);
  return NextResponse.json(run);
});
