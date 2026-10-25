import { cookies } from 'next/headers';
import { getDb } from '../server/db';
import { resolveProject } from '../server/auth';
import { referenceNow } from '../server/clock';
import { PROJECT_COOKIE } from '../lib/session';

/** Base, projet courant (choisi dans l'interface) et instant de référence pour les pages serveur. */
export async function pageContext() {
  const db = getDb();
  const selected = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = await resolveProject(db, selected);
  return { db, project, now: project ? await referenceNow(db, project.id) : new Date() };
}
