/**
 * Applique les fichiers migrations/*.sql dans l'ordre, une seule fois
 * chacun (table schema_migrations). Volontairement simple : pas de
 * "down", on avance.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from './db';

export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
