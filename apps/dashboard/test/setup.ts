/**
 * Base de test jetable : une base Postgres neuve par fichier de test,
 * migrée, supprimée à la fin. Nécessite un Postgres local (TEST_PG_*).
 */
import path from 'node:path';
import { PgWire } from './pgwire';
import { migrate } from '../src/server/migrate';

const host = process.env.TEST_PG_HOST ?? '127.0.0.1';
const port = Number(process.env.TEST_PG_PORT ?? 54329);
const user = process.env.TEST_PG_USER ?? 'postgres';

export async function freshDb() {
  const name = `trajekt_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = await PgWire.connect({ host, port, user, database: 'postgres' });
  await admin.query(`create database ${name}`);
  const db = await PgWire.connect({ host, port, user, database: name });
  await migrate(db, path.join(import.meta.dirname, '..', 'migrations'));
  return {
    db,
    async drop() {
      await db.close();
      await admin.query(`drop database ${name} with (force)`);
      await admin.close();
    },
  };
}
