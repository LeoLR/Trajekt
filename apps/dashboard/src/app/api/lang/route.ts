import { NextRequest, NextResponse } from 'next/server';
import { LANG_COOKIE, isLang } from '../../../lib/i18n';

/** Sélecteur de langue : GET /api/lang?to=fr — mémorise le choix et revient sur la page d'origine. */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to');
  // Retour sur la page d'origine si elle est sur ce site, sinon l'accueil.
  let back = '/';
  const ref = req.headers.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.host === req.nextUrl.host) back = u.pathname + u.search;
    } catch { /* referer invalide */ }
  }
  const res = NextResponse.redirect(new URL(back, req.url), 303);
  if (isLang(to)) res.cookies.set(LANG_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
