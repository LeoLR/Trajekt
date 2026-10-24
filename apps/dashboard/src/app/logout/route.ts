import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../lib/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
