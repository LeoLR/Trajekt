// pnpm create-read-key "claude-desktop" — clé de lecture (API, serveur MCP), affichée une seule fois.
import 'dotenv/config';
import { getDb } from '../src/server/db';
import { createApiKey, getDefaultProject } from '../src/server/auth';

const name = process.argv[2] ?? 'read';
const db = getDb();
const project = await getDefaultProject(db);
if (!project) throw new Error('No project yet — run pnpm create-project first.');
const key = await createApiKey(db, project.id, 'read', name);
console.log(`Read key "${name}" for project ${project.name} — copy it now, it will not be shown again:\n`);
console.log(`  ${key}\n`);
console.log('Use it as Authorization: Bearer <key> on /api/* and /api/mcp.');
process.exit(0);
