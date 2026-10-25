import { getDb } from '../server/db';
import { getDefaultProject } from '../server/auth';
import { referenceNow } from '../server/clock';

/** Base, projet courant et instant de référence pour les pages serveur. */
export async function pageContext() {
  const db = getDb();
  const project = await getDefaultProject(db);
  return { db, project, now: project ? await referenceNow(db, project.id) : new Date() };
}
