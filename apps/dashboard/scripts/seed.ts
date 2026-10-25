// pnpm seed — remplit la base avec deux semaines de trafic simulé (démo).
// sentry-triage passe en v1.5.0 il y a deux jours et régresse ; support-bot reste stable.
import 'dotenv/config';
import { getDb } from '../src/server/db';
import { createProject, getDefaultProject } from '../src/server/auth';
import { ingestPayload } from '../src/server/ingest';
import { demoPayloads } from '../src/server/simulate';
import { checkRegressions } from '../src/server/alerts';

const db = getDb();
let project = await getDefaultProject(db);
if (!project) {
  const created = await createProject(db, 'demo');
  project = created.project;
  console.log(`Created project "demo" — API key: ${created.apiKey}`);
}
const payloads = demoPayloads(Date.now());
let n = 0;
for (const p of payloads) {
  await ingestPayload(db, project.id, p.payload);
  if (++n % 200 === 0) process.stdout.write(`\r${n}/${payloads.length} payloads`);
}
const check = await checkRegressions(db, project.id);
console.log(`\rIngested ${payloads.length} payloads. ${check.alertsCreated.length} regression alert(s) created.`);
process.exit(0);
