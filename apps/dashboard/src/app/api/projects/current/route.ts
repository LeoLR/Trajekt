/** POST /api/projects/current — change le projet affiché (formulaire ou JSON { projectId }). */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../server/db';
import { resolveProject } from '../../../../server/auth';
import { apiError } from '../../../../lib/errors';
import { PROJECT_COOKIE, SESSION_COOKIE, isValidSessionToken } from '../../../../lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!(await isValidSessionToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => false))) {
    return apiError('UNAUTHORIZED', 'Sign in to the dashboard first.');
  }
  const isForm = (req.headers.get('content-type') ?? '').includes('form');
  const id = isForm ? String((await req.formData()).get('projectId') ?? '') : String((await req.json().catch(() => ({}))).projectId ?? '');
  const project = await resolveProject(getDb(), id);
  if (!project || project.id !== id) return apiError('NOT_FOUND', 'Unknown project.');
  const res = isForm ? NextResponse.redirect(new URL('/', req.url), 303) : NextResponse.json({ project });
  res.cookies.set(PROJECT_COOKIE, project.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 24 * 3600 });
  return res;
}
