import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { trajectories } from '../../../../db/schema.js';
import { isAuthenticatedDashboardRequest } from '../../../../lib/session.js';
import { getDefaultProject } from '../../../../lib/project.js';
import { apiError } from '../../../../lib/errors.js';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticatedDashboardRequest(req)) {
    return apiError('UNAUTHORIZED', 'Session invalide ou expirée.');
  }

  const project = await getDefaultProject();

  const [row] = await db
    .select()
    .from(trajectories)
    .where(and(eq(trajectories.id, params.id), eq(trajectories.projectId, project.id)))
    .limit(1);

  if (!row) {
    return apiError('NOT_FOUND', `Aucune trajectoire avec l'id ${params.id}.`);
  }

  // Reconstruit exactement la forme Trajectory de @trajekt/core —
  // le visualiseur n'a besoin d'aucune transformation supplémentaire.
  return NextResponse.json({
    schemaVersion: row.schemaVersion,
    id: row.id,
    source: row.source,
    steps: row.steps,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  });
}
