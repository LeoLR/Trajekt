// pnpm migrate — applique migrations/*.sql (idempotent).
import 'dotenv/config';
import path from 'node:path';
import { getDb } from '../src/server/db';
import { migrate } from '../src/server/migrate';

const applied = await migrate(getDb(), path.join(import.meta.dirname, '..', 'migrations'));
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
process.exit(0);
