import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../../lib/route';
import { apiError } from '../../../../../lib/errors';
import { isDimension } from '../../../../../server/queries';
import { loadSuitePage, suiteValues } from '../../../../../server/suites';

/**
 * GET /api/agents/:name/evals?dimension=agent&a=<A>&b=<B>
 * Compare deux versions sur la suite d'évaluation (runs avec un scénario),
 * scénario par scénario. Sans a/b : la plus récente contre la précédente.
 * `result` vaut pass ou fail — de quoi bloquer une CI.
 */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  const p = req.nextUrl.searchParams;
  const dimension = p.get('dimension') ?? 'agent';
  if (!isDimension(dimension)) return apiError('VALIDATION_ERROR', 'dimension must be app, agent, prompt or model.');
  const a = p.get('a') ?? undefined;
  const b = p.get('b') ?? undefined;
  if (Boolean(a) !== Boolean(b)) return apiError('VALIDATION_ERROR', 'Give both a and b, or neither.');
  if (a && b) {
    const known = new Set((await suiteValues(db, project.id, name, dimension)).map((v) => v.value));
    for (const v of [a, b]) if (!known.has(v)) return apiError('NOT_FOUND', `No eval run of ${name} with ${dimension} "${v}".`);
  }
  const page = await loadSuitePage(db, project.id, name, { dimension, a, b });
  if (!page) return apiError('NOT_FOUND', `${name} has no eval runs (runs tagged with trajekt.scenario).`);
  return NextResponse.json(page);
});
