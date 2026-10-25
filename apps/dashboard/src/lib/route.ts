/**
 * Enveloppe commune des routes de lecture (/api/*). Trois accès :
 *   - mode démo : ouvert, lecture seule ;
 *   - clé de lecture : Authorization: Bearer tk_read_… (agents, MCP, scripts) ;
 *   - session du dashboard (cookie).
 * Résout le projet, fixe l'instant de référence, et transforme les
 * exceptions en erreurs au format du contrat. L'ingestion a sa propre auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb, type Db } from '../server/db';
import { getDefaultProject, verifyProjectApiKey, type Project } from '../server/auth';
import { referenceNow } from '../server/clock';
import { apiError } from './errors';
import { isDemo } from './demo';
import { SESSION_COOKIE, isValidSessionToken } from './session';

export interface RouteContext {
  req: NextRequest;
  db: Db;
  project: Project;
  /** Instant de référence (maintenant, ou la fin des données en démo). */
  now: Date;
}

/** Projet accessible à cette requête, ou une réponse d'erreur. */
export async function authorizeRead(req: NextRequest, db: Db): Promise<Project | Response> {
  if (req.headers.get('authorization')) {
    const project = await verifyProjectApiKey(db, req.headers.get('authorization'), 'read');
    if (project) return project;
    if (!isDemo()) return apiError('UNAUTHORIZED', 'Invalid read API key (tk_read_…).');
  }
  if (!isDemo() && !(await isValidSessionToken(req.cookies.get(SESSION_COOKIE)?.value))) {
    return apiError('UNAUTHORIZED', 'Session missing or expired. Use a read API key for programmatic access.');
  }
  const project = await getDefaultProject(db);
  if (!project) return apiError('NOT_CONFIGURED', 'No project yet — run `pnpm create-project`.');
  return project;
}

export function dashboardRoute(handler: (ctx: RouteContext) => Promise<NextResponse | Response>) {
  return async (req: NextRequest) => {
    try {
      const db = getDb();
      const project = await authorizeRead(req, db);
      if (project instanceof Response) return project;
      return await handler({ req, db, project, now: await referenceNow(db, project.id) });
    } catch (e) {
      console.error(e);
      return apiError('INTERNAL_ERROR', 'Unexpected server error.');
    }
  };
}

export function parseDate(v: string | null): Date | undefined | null {
  if (v === null) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function encodeCursor(c: { startedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string): { startedAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return typeof p.startedAt === 'string' && typeof p.id === 'string' ? p : null;
  } catch {
    return null;
  }
}
