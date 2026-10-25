// pnpm import-langfuse [--since 7d] [--name sentry-triage] [--project <id>] [--max 5000]
// Lit les traces de Langfuse (API publique) et les enregistre dans Trajekt, scores compris.
// LANGFUSE_HOST (défaut https://cloud.langfuse.com), LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY.
// Relançable sans doublon : à mettre dans un cron pour suivre un agent déjà instrumenté avec Langfuse.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { getDb } from '../src/server/db';
import { resolveProject } from '../src/server/auth';
import { importFromLangfuse, parseSince } from '../src/server/langfuse-import';

const { values } = parseArgs({
  options: { since: { type: 'string', default: '7d' }, name: { type: 'string' }, project: { type: 'string' }, max: { type: 'string' } },
});
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;
if (!publicKey || !secretKey) throw new Error('Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.');
const db = getDb();
const project = await resolveProject(db, values.project);
if (!project) throw new Error('No project yet — run pnpm create-project first.');
const r = await importFromLangfuse(db, project.id, {
  host: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
  publicKey, secretKey,
  from: parseSince(values.since!),
  name: values.name,
  max: values.max ? Number(values.max) : undefined,
  onProgress: (n) => n % 50 === 0 && process.stdout.write(`\r${n} imported`),
});
console.log(`\r${r.imported}/${r.listed} trace(s) imported into "${project.name}"${r.failed.length ? `, ${r.failed.length} failed` : ''}.`);
for (const f of r.failed.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`);
process.exit(r.failed.length && !r.imported ? 1 : 0);
