import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Génère une nouvelle clé API en clair (à montrer une seule fois à
 * l'utilisateur) + son hash (ce qu'on stocke). À utiliser dans le
 * script de création de projet, pas dans une route publique.
 */
export function generateApiKey(): { plaintext: string; hash: string } {
  const plaintext = 'tk_live_' + randomBytes(24).toString('hex');
  return { plaintext, hash: hashKey(plaintext) };
}

/**
 * Vérifie le header Authorization: Bearer <clé> d'une requête
 * d'ingestion. Renvoie le projet correspondant, ou null.
 */
export async function verifyProjectApiKey(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const key = authHeader.slice('Bearer '.length).trim();
  if (!key) return null;

  const hash = hashKey(key);
  const [project] = await db.select().from(projects).where(eq(projects.apiKeyHash, hash)).limit(1);
  return project ?? null;
}
