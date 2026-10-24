import { NextResponse } from 'next/server';
import { dashboardRoute } from '../../../lib/route';
import { listAgents } from '../../../server/queries';

/** GET /api/agents — un résumé par agent (24 h / 7 j, 14 jours de tendance). */
export const GET = dashboardRoute(async ({ db, project }) =>
  NextResponse.json({ agents: await listAgents(db, project.id) }),
);
