/**
 * Étape de build sur Vercel, avant `next build` :
 *   - applique les migrations (toujours) ;
 *   - en mode démo (TRAJEKT_DEMO=1), remplace les données par deux
 *     semaines de trafic simulé qui se terminent maintenant.
 * Sans DATABASE_URL (prévisualisation sans base), ne fait rien.
 */

import path from 'node:path';
import { getDb } from '../src/server/db';
import { migrate } from '../src/server/migrate';
import { createProject, getDefaultProject } from '../src/server/auth';
import { ingestPayload } from '../src/server/ingest';
import { simulateTraffic } from '../src/server/simulate';
import { checkRegressions } from '../src/server/alerts';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('[trajekt] DATABASE_URL not set — skipping migrations and demo seed.');
    return;
  }
  const db = getDb();
  const applied = await migrate(db, path.join(import.meta.dirname, '..', 'migrations'));
  console.log(`[trajekt] migrations: ${applied.length ? applied.join(', ') : 'up to date'}`);

  if (process.env.TRAJEKT_DEMO !== '1') return;

  const started = Date.now();
  const project = (await getDefaultProject(db)) ?? (await createProject(db, 'demo')).project;
  await db.query('delete from alerts where project_id = $1', [project.id]);
  await db.query('delete from trajectories where project_id = $1', [project.id]);

  // Les lots d'une même trace se suivent dans la liste : on les garde dans
  // l'ordre, et on traite plusieurs traces en parallèle.
  const payloads = simulateTraffic(Date.now(), { days: 14, runsPerDay: 40, deployDaysAgo: 2 });
  const groups: unknown[][] = [];
  let lastAt = NaN;
  for (const p of payloads) {
    if (p.at !== lastAt) groups.push([]);
    groups[groups.length - 1].push(p.payload);
    lastAt = p.at;
  }
  let next = 0;
  const worker = async () => {
    while (next < groups.length) {
      const group = groups[next++];
      for (const payload of group) await ingestPayload(db, project.id, payload);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const alerts = await checkRegressions(db, project.id);
  console.log(
    `[trajekt] demo seeded: ${payloads.length} payloads, ${alerts.alertsCreated.length} alerts, ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
