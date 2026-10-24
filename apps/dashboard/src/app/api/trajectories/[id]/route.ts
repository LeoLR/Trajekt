import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../lib/route';
import { apiError } from '../../../../lib/errors';
import { getRun } from '../../../../server/queries';

/** Phase 1 (rétrocompatible) : renvoie la Trajectory seule, telle que normalize() la produit. */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const id = req.nextUrl.pathname.split('/').pop() ?? '';
  const run = await getRun(db, project.id, id);
  if (!run) return apiError('NOT_FOUND', `No trajectory with id ${id}.`);
  return NextResponse.json(run.trajectory);
});
