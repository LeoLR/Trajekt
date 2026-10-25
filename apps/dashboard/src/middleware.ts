/**
 * Garde du dashboard : toute page exige une session valide, sauf la page
 * de connexion. Les routes /api/* vérifient elles-mêmes la session (et
 * répondent 401 en JSON) ; /v1/* s'authentifie par clé API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isValidSessionToken } from './lib/session';
import { isDemo } from './lib/demo';

export async function middleware(req: NextRequest) {
  if (isDemo()) return NextResponse.next();
  const ok = await isValidSessionToken(req.cookies.get(SESSION_COOKIE)?.value).catch(() => false);
  if (ok) return NextResponse.next();
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/|v1/|_next/|favicon|icon).*)'],
};
