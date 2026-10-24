// Usage : pnpm create-project "sentry-jira-agent"
// Affiche la clé API en clair UNE SEULE FOIS — à copier dans
// l'Authorization: Bearer de l'exporteur OTLP côté agent.

import 'dotenv/config';
import { db } from '../src/db/index.js';
import { projects } from '../src/db/schema.js';
import { generateApiKey } from '../src/lib/auth.js';

async function main() {
  const name = process.argv[2] ?? 'default';
  const { plaintext, hash } = generateApiKey();

  const [project] = await db.insert(projects).values({ name, apiKeyHash: hash }).returning();

  console.log(`Projet créé : ${project.name} (${project.id})`);
  console.log('');
  console.log('Clé API — à copier maintenant, elle ne sera plus affichée :');
  console.log('');
  console.log(`  ${plaintext}`);
  console.log('');
  console.log('À utiliser dans otel-setup.ts :');
  console.log(`  headers: { Authorization: 'Bearer ${plaintext}' }`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
