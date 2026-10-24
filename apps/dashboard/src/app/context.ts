import { getDb } from '../server/db';
import { getDefaultProject } from '../server/auth';

/** Base + projet courant pour les pages serveur. */
export async function pageContext() {
  const db = getDb();
  return { db, project: await getDefaultProject(db) };
}
