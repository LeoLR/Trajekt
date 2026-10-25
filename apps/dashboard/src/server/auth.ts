/**
 * Authentification.
 *   - Clés d'API par projet, avec un périmètre :
 *       ingest (tk_live_…) : POST /v1/traces uniquement ;
 *       read   (tk_read_…) : lecture (API /api/*, serveur MCP).
 *     Seul le hash SHA-256 est stocké.
 *   - Dashboard : un mot de passe unique (DASHBOARD_PASSWORD) qui ouvre
 *     une session signée HMAC. Suffisant tant qu'il n'y a qu'un compte.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';

export interface Project {
  id: string;
  name: string;
}

export type KeyScope = 'ingest' | 'read';

const PREFIX: Record<KeyScope, string> = { ingest: 'tk_live_', read: 'tk_read_' };

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Clé en clair (à montrer une seule fois) + son hash (ce qu'on stocke). */
export function generateApiKey(scope: KeyScope = 'ingest'): { plaintext: string; hash: string } {
  const plaintext = PREFIX[scope] + randomBytes(24).toString('hex');
  return { plaintext, hash: hashKey(plaintext) };
}

export async function createProject(db: Db, name: string): Promise<{ project: Project; apiKey: string }> {
  const { plaintext, hash } = generateApiKey('ingest');
  const [project] = await db.query<Project>(
    'insert into projects (name, api_key_hash) values ($1, $2) returning id, name',
    [name, hash],
  );
  return { project, apiKey: plaintext };
}

/** Nouvelle clé pour un projet existant (affichée une seule fois). */
export async function createApiKey(db: Db, projectId: string, scope: KeyScope, name: string): Promise<string> {
  const { plaintext, hash } = generateApiKey(scope);
  await db.query('insert into api_keys (project_id, name, scope, key_hash) values ($1, $2, $3, $4)', [
    projectId, name, scope, hash,
  ]);
  return plaintext;
}

function bearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  return key || null;
}

/** Projet de la clé, si elle existe ET a le périmètre demandé. */
export async function verifyProjectApiKey(
  db: Db, authHeader: string | null, scope: KeyScope = 'ingest',
): Promise<Project | null> {
  const key = bearer(authHeader);
  if (!key) return null;
  const hash = hashKey(key);
  const [scoped] = await db.query<Project & { key_id: string }>(
    `select p.id, p.name, k.id as key_id from api_keys k join projects p on p.id = k.project_id
      where k.key_hash = $1 and k.scope = $2 limit 1`,
    [hash, scope],
  );
  if (scoped) {
    // Best effort : ne bloque pas la requête si la mise à jour échoue.
    db.query('update api_keys set last_used_at = now() where id = $1', [scoped.key_id]).catch(() => {});
    return { id: scoped.id, name: scoped.name };
  }
  if (scope !== 'ingest') return null;
  const [project] = await db.query<Project>(
    'select id, name from projects where api_key_hash = $1 limit 1',
    [hash],
  );
  return project ?? null;
}

/** Un seul compte = un seul projet affiché : le premier créé. */
export async function getDefaultProject(db: Db): Promise<Project | null> {
  const [project] = await db.query<Project>('select id, name from projects order by created_at limit 1');
  return project ?? null;
}

export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
