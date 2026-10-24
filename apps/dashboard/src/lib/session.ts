import { NextRequest } from 'next/server';

/**
 * Phase 1 : un seul compte, pas de vrai système d'auth. Le cookie de
 * session est juste comparé à un secret d'environnement.
 *
 * À REMPLACER dès qu'il y a plus d'un utilisateur — NextAuth ou Clerk
 * gèrent ça correctement (rotation, expiration, multi-compte). Ne pas
 * faire grossir ce fichier à la main, le jeter plutôt.
 */
export function isAuthenticatedDashboardRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get('trajekt_session')?.value;
  const expected = process.env.DASHBOARD_SESSION_SECRET;
  if (!expected) {
    throw new Error('DASHBOARD_SESSION_SECRET manquant — voir .env.example');
  }
  return cookie === expected;
}
