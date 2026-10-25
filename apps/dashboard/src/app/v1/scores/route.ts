/**
 * POST /v1/scores — attache des scores de qualité à des runs déjà reçus.
 * Clé d'ingestion (tk_live_…). Corps : un score, une liste, ou { scores: [...] }.
 *   { "traceId": "a1b2…", "name": "helpful", "value": 1, "comment": "thumbs up" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../server/db';
import { verifyProjectApiKey } from '../../../server/auth';
import { addScores, parseScore, type ScoreInput } from '../../../server/scores';
import { apiError } from '../../../lib/errors';
import { isDemo } from '../../../lib/demo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (isDemo()) return apiError('FORBIDDEN', 'This is a read-only demo instance: scoring is disabled.');
  const db = getDb();
  const project = await verifyProjectApiKey(db, req.headers.get('authorization'));
  if (!project) return apiError('UNAUTHORIZED', 'Missing or invalid project API key.');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('VALIDATION_ERROR', 'Request body is not valid JSON.');
  }
  const list = Array.isArray(body) ? body : body && typeof body === 'object' && Array.isArray((body as { scores?: unknown }).scores) ? (body as { scores: unknown[] }).scores : [body];
  if (list.length === 0 || list.length > 500) return apiError('VALIDATION_ERROR', 'Send between 1 and 500 scores.');
  const parsed: ScoreInput[] = [];
  for (const [i, v] of list.entries()) {
    const r = parseScore(v);
    if (typeof r === 'string') return apiError('VALIDATION_ERROR', list.length > 1 ? `scores[${i}]: ${r}` : r);
    parsed.push(r);
  }
  try {
    const results = await addScores(db, project.id, parsed);
    const allMissing = results.every((r) => !r.ok);
    return NextResponse.json({ scores: results }, { status: allMissing ? 404 : 201 });
  } catch (e) {
    console.error(e);
    return apiError('INTERNAL_ERROR', 'Could not store the scores.');
  }
}
