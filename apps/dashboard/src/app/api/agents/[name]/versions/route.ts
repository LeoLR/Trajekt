import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../../../lib/route';
import { agentVersions } from '../../../../../server/queries';

/** GET /api/agents/:name/versions — métriques par version, la plus récente d'abord. */
export const GET = dashboardRoute(async ({ req, db, project }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  return NextResponse.json({ agent: name, versions: await agentVersions(db, project.id, name) });
});
