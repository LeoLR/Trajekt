/**
 * Enveloppe commune des routes du dashboard (/api/*) : vérifie la
 * session, résout le projet, transforme les exceptions en erreurs au
 * format du contrat. L'ingestion (/v1/traces) a sa propre auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb, type Db } from '../server/db';
import { getDefaultProject, type Project } from '../server/auth';
import { apiError } from './errors';
import { SESSION_COOKIE, isValidSessionToken } from './session';

export interface RouteContext {
  req: NextRequest;
  db: Db;
  project: Project;
}

export function dashboardRoute(handler: (ctx: RouteContext) => Promise<NextResponse | Response>) {
  return async (req: NextRequest) => {
    try {
      if (!(await isValidSessionToken(req.cookies.get(SESSION_COOKIE)?.value))) {
        return apiError('UNAUTHORIZED', 'Session missing or expired.');
      }
      const db = getDb();
      const project = await getDefaultProject(db);
      if (!project) return apiError('NOT_CONFIGURED', 'No project yet — run `pnpm create-project`.');
      return await handler({ req, db, project });
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
