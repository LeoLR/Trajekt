/**
 * POST /v1/traces — ingestion (OTLP/HTTP JSON, export Langfuse,
 * résultat Vercel AI SDK, ou Trajectory native).
 *
 * Compatible avec un exporter OTel pointé sur la racine de Trajekt :
 * l'exporter ajoute lui-même /v1/traces. Encodage JSON uniquement
 * (OTEL_EXPORTER_OTLP_PROTOCOL=http/json) ; gzip accepté.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { UnknownFormatError } from '@trajekt/core';
import { getDb } from '../../../server/db';
import { verifyProjectApiKey } from '../../../server/auth';
import { ingestPayload } from '../../../server/ingest';
import { apiError } from '../../../lib/errors';
import { isDemo } from '../../../lib/demo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (isDemo()) return apiError('FORBIDDEN', 'This is a read-only demo instance: ingestion is disabled.');
  const db = getDb();
  const project = await verifyProjectApiKey(db, req.headers.get('authorization'));
  if (!project) return apiError('UNAUTHORIZED', 'Missing or invalid project API key.');

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('protobuf')) {
    return apiError(
      'UNSUPPORTED_MEDIA_TYPE',
      'OTLP protobuf is not supported yet. Configure the exporter with OTEL_EXPORTER_OTLP_PROTOCOL=http/json.',
    );
  }

  let raw: unknown;
  try {
    let body = Buffer.from(await req.arrayBuffer());
    if (req.headers.get('content-encoding') === 'gzip') body = gunzipSync(body);
    raw = JSON.parse(body.toString('utf8'));
  } catch {
    return apiError('VALIDATION_ERROR', 'Request body is not valid JSON.');
  }

  try {
    const runs = await ingestPayload(db, project.id, raw, {
      agentName: req.headers.get('x-trajekt-agent') ?? undefined,
      appVersion: req.headers.get('x-trajekt-app-version') ?? undefined,
      agentVersion: req.headers.get('x-trajekt-agent-version') ?? undefined,
      promptVersion: req.headers.get('x-trajekt-prompt-version') ?? undefined,
      environment: req.headers.get('x-trajekt-environment') ?? undefined,
    });
    if (runs.length === 0) return apiError('VALIDATION_ERROR', 'No usable trace in this payload.');
    return NextResponse.json({ trajectories: runs }, { status: 201 });
  } catch (e) {
    if (e instanceof UnknownFormatError) return apiError('UNKNOWN_FORMAT', e.message);
    console.error(e);
    return apiError('INTERNAL_ERROR', 'Ingestion failed.');
  }
}
