import { NextRequest, NextResponse } from 'next/server';
import { normalizeAll, totalCostUsd, UnknownFormatError } from '@trajekt/core';
import { db } from '../../../db/index.js';
import { trajectories } from '../../../db/schema.js';
import { verifyProjectApiKey } from '../../../lib/auth.js';
import { apiError } from '../../../lib/errors.js';

export async function POST(req: NextRequest) {
  const project = await verifyProjectApiKey(req.headers.get('authorization'));
  if (!project) return apiError('UNAUTHORIZED', 'Clé API de projet absente ou invalide.');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }

  let results;
  try {
    // normalizeAll(), pas normalize() : un payload OTLP peut multiplexer
    // plusieurs traces dans un seul envoi (comportement par défaut du
    // batching des exporters OTel) — voir la note dans packages/core.
    results = normalizeAll(raw);
  } catch (e) {
    if (e instanceof UnknownFormatError) return apiError('UNKNOWN_FORMAT', e.message);
    return apiError('VALIDATION_ERROR', e instanceof Error ? e.message : 'Payload invalide.');
  }

  if (results.length === 0) {
    return apiError('VALIDATION_ERROR', 'Aucune trace exploitable dans ce payload.');
  }

  const inserted = await db
    .insert(trajectories)
    .values(
      results.map((t) => {
        const cost = totalCostUsd(t);
        return {
          projectId: project.id,
          schemaVersion: t.schemaVersion,
          source: t.source,
          sourceFormat: (t.metadata.sourceFormat as string) ?? null,
          steps: t.steps,
          metadata: t.metadata,
          totalCostUsd: cost > 0 ? cost.toFixed(6) : null,
          totalDurationMs: (t.metadata.totalDurationMs as number) ?? null,
          stepCount: t.steps.length,
        };
      }),
    )
    .returning({
      id: trajectories.id,
      sourceFormat: trajectories.sourceFormat,
      stepCount: trajectories.stepCount,
      createdAt: trajectories.createdAt,
    });

  return NextResponse.json({ trajectories: inserted }, { status: 201 });
}
