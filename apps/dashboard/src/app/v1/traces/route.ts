/**
 * POST /v1/traces — ingestion (OTLP/HTTP JSON, export Langfuse,
 * résultat Vercel AI SDK, ou Trajectory native).
 *
 * Compatible avec un exporter OTel pointé sur la racine de Trajekt :
 * l'exporter ajoute lui-même /v1/traces. OTLP/HTTP en JSON ou en protobuf
 * (application/x-protobuf, le défaut de plusieurs SDK) ; gzip accepté.
 * gRPC n'est pas pris en charge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { UnknownFormatError, decodeOtlpProtobuf } from '@trajekt/core';
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
  const isProtobuf = contentType.includes('protobuf');

  let raw: unknown;
  let body: Buffer;
  try {
    body = Buffer.from(await req.arrayBuffer());
    if (req.headers.get('content-encoding') === 'gzip') body = gunzipSync(body);
  } catch {
    return apiError('VALIDATION_ERROR', 'Could not read the request body (bad gzip?).');
  }
  if (isProtobuf) {
    try {
      raw = decodeOtlpProtobuf(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    } catch (e) {
      return apiError('VALIDATION_ERROR', `Request body is not a valid OTLP protobuf ExportTraceServiceRequest: ${(e as Error).message}`);
    }
  } else {
    try {
      raw = JSON.parse(body.toString('utf8'));
    } catch {
      return apiError('VALIDATION_ERROR', 'Request body is not valid JSON. For OTLP protobuf, send Content-Type: application/x-protobuf.');
    }
  }

  try {
    const runs = await ingestPayload(db, project.id, raw, {
      agentName: req.headers.get('x-trajekt-agent') ?? undefined,
      appVersion: req.headers.get('x-trajekt-app-version') ?? undefined,
      agentVersion: req.headers.get('x-trajekt-agent-version') ?? undefined,
      promptVersion: req.headers.get('x-trajekt-prompt-version') ?? undefined,
      environment: req.headers.get('x-trajekt-environment') ?? undefined,
      scenario: req.headers.get('x-trajekt-scenario') ?? undefined,
    });
    if (runs.length === 0) return apiError('VALIDATION_ERROR', 'No usable trace in this payload.');
    // Un exporter protobuf attend un ExportTraceServiceResponse protobuf : vide = succès complet.
    if (isProtobuf) return new Response(new Uint8Array(0), { status: 200, headers: { 'content-type': 'application/x-protobuf' } });
    return NextResponse.json({ trajectories: runs }, { status: 201 });
  } catch (e) {
    if (e instanceof UnknownFormatError) return apiError('UNKNOWN_FORMAT', e.message);
    console.error(e);
    return apiError('INTERNAL_ERROR', 'Ingestion failed.');
  }
}
