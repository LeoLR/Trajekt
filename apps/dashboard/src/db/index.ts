import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// postgres-js plutôt que le driver HTTP serverless de Neon : ça marche
// aussi bien sur Neon (via connection string) qu'en self-host Docker
// avec un Postgres classique — pas de lock-in sur un hébergeur.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant — voir .env.example');
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
