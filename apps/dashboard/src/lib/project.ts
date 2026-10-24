import { db } from '../db/index.js';
import { projects } from '../db/schema.js';

/**
 * Phase 1 : un seul compte = un seul projet, donc pas de vraie
 * résolution "quel projet pour cette session". Isolé ici pour qu'un
 * seul fichier change le jour où il faut résoudre le projet depuis la
 * session plutôt que prendre le premier de la table.
 */
export async function getDefaultProject() {
  const [project] = await db.select().from(projects).limit(1);
  if (!project) {
    throw new Error('Aucun projet configuré — voir scripts/create-project.ts');
  }
  return project;
}
