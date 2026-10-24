/**
 * Deux mécanismes d'auth distincts (voir docs/api-contract.md) :
 *   - ingestion : clé API de projet (Authorization: Bearer tk_live_...),
 *     seul le hash SHA-256 est stocké ;
 *   - dashboard : un mot de passe unique (DASHBOARD_PASSWORD) qui ouvre
 *     une session signée HMAC. Suffisant tant qu'il n'y a qu'un compte ;
 *     au-delà, remplacer par Auth.js/Clerk plutôt que d'étendre ceci.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';

export interface Project {
  id: string;
  name: string;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Clé en clair (à montrer une seule fois) + son hash (ce qu'on stocke). */
export function generateApiKey(): { plaintext: string; hash: string } {
  const plaintext = 'tk_live_' + randomBytes(24).toString('hex');
  return { plaintext, hash: hashKey(plaintext) };
}

export async function createProject(db: Db, name: string): Promise<{ project: Project; apiKey: string }> {
  const { plaintext, hash } = generateApiKey();
  const [project] = await db.query<Project>(
    'insert into projects (name, api_key_hash) values ($1, $2) returning id, name',
    [name, hash],
  );
  return { project, apiKey: plaintext };
}

export async function verifyProjectApiKey(db: Db, authHeader: string | null): Promise<Project | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  if (!key) return null;
  const [project] = await db.query<Project>(
    'select id, name from projects where api_key_hash = $1 limit 1',
    [hashKey(key)],
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
