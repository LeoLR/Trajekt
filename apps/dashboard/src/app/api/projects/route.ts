/**
 * GET  /api/projects — les projets (session du dashboard).
 * POST /api/projects { name } — crée un projet et renvoie ses clés
 * (ingestion et lecture), affichées une seule fois.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../server/db';
import { createApiKey, createProject, listProjects } from '../../../server/auth';
import { apiError } from '../../../lib/errors';
import { isDemo } from '../../../lib/demo';
import { PROJECT_COOKIE, SESSION_COOKIE, isValidSessionToken } from '../../../lib/session';

export const runtime = 'nodejs';

async function signedIn(req: NextRequest) {
  return isValidSessionToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => false);
}

export async function GET(req: NextRequest) {
  if (!isDemo() && !(await signedIn(req))) return apiError('UNAUTHORIZED', 'Sign in to the dashboard first.');
  return NextResponse.json({ projects: await listProjects(getDb()) });
}

export async function POST(req: NextRequest) {
  if (isDemo()) return apiError('FORBIDDEN', 'This is a read-only demo instance.');
  if (!(await signedIn(req))) return apiError('UNAUTHORIZED', 'Sign in to the dashboard first.');
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return apiError('VALIDATION_ERROR', 'Give the project a name (80 characters max).');
  const db = getDb();
  const { project, apiKey } = await createProject(db, name);
  const readKey = await createApiKey(db, project.id, 'read', 'dashboard');
  const res = NextResponse.json({ project, ingestKey: apiKey, readKey }, { status: 201 });
  res.cookies.set(PROJECT_COOKIE, project.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 24 * 3600 });
  return res;
}
