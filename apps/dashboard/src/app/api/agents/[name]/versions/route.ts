import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../../lib/route';
import { apiError } from '../../../../../lib/errors';
import { agentVersions, isDimension } from '../../../../../server/queries';

/**
 * GET /api/agents/:name/versions?dimension=app|agent|prompt|model
 * Métriques par valeur de la dimension (défaut : agent), la plus récente d'abord.
 */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  const dimension = req.nextUrl.searchParams.get('dimension') ?? 'agent';
  if (!isDimension(dimension)) return apiError('VALIDATION_ERROR', 'dimension must be app, agent, prompt or model.');
  return NextResponse.json({ agent: name, dimension, versions: await agentVersions(db, project.id, name, dimension) });
});
