import type { Db } from './db';
import { isDemo } from '../lib/demo';

/**
 * L'instant de référence des pages et de l'API. En démo, 10 minutes
 * après le dernier run enregistré ; sinon, maintenant.
 */
export async function referenceNow(db: Db, projectId: string): Promise<Date> {
  if (!isDemo()) return new Date();
  const [r] = await db.query<{ last: Date | null }>(
    'select max(started_at) as last from trajectories where project_id = $1',
    [projectId],
  );
  return r?.last ? new Date(new Date(r.last).getTime() + 10 * 60_000) : new Date();
}
