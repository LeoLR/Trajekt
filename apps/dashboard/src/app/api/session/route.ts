/**
 * POST /api/session — connexion (mot de passe unique DASHBOARD_PASSWORD).
 * Accepte un formulaire HTML (redirige) ou du JSON (répond en JSON).
 * DELETE /api/session — déconnexion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { passwordMatches } from '../../../server/auth';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from '../../../lib/session';
import { apiError } from '../../../lib/errors';

export const runtime = 'nodejs';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function POST(req: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return apiError('NOT_CONFIGURED', 'Set DASHBOARD_PASSWORD to enable sign-in.');

  const isForm = (req.headers.get('content-type') ?? '').includes('form');
  let password = '';
  let next = '/';
  if (isForm) {
    const form = await req.formData();
    password = String(form.get('password') ?? '');
    const n = String(form.get('next') ?? '/');
    next = n.startsWith('/') && !n.startsWith('//') ? n : '/';
  } else {
    const body = await req.json().catch(() => ({}));
    password = typeof body.password === 'string' ? body.password : '';
  }

  if (!passwordMatches(password, expected)) {
    if (isForm) return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
    return apiError('UNAUTHORIZED', 'Wrong password.');
  }

  const res = isForm
    ? NextResponse.redirect(new URL(next, req.url), 303)
    : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), cookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return res;
}
