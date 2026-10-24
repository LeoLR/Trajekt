/**
 * Accès base : une interface minuscule (requête paramétrée + transaction)
 * plutôt qu'un ORM. Toutes les requêtes de l'app sont du SQL explicite
 * (src/server/queries.ts, ingest.ts) : les agrégats de suivi (percentiles,
 * séries temporelles) s'écrivent de toute façon en SQL, et les tests les
 * exécutent tels quels contre un vrai Postgres.
 *
 * Conventions pour que les types soient stables quel que soit le driver :
 *   - compter avec ::int, moyenner avec ::float8 ;
 *   - passer les dates en ISO et caster (::timestamptz) ;
 *   - passer le JSON en chaîne et caster (::jsonb).
 */

import postgres from 'postgres';

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

function serialize(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function wrap(sql: postgres.Sql | postgres.TransactionSql, inTx = false): Db {
  return {
    query: <T>(text: string, params: unknown[] = []) =>
      sql.unsafe(text, params.map(serialize) as postgres.ParameterOrJSON<never>[]) as unknown as Promise<T[]>,
    transaction: <T>(fn: (tx: Db) => Promise<T>) =>
      inTx
        ? fn(wrap(sql, true))
        : ((sql as postgres.Sql).begin((tx) => fn(wrap(tx, true))) as Promise<T>),
  };
}

let instance: Db | null = null;

/** Connexion partagée, créée au premier usage depuis DATABASE_URL. */
export function getDb(): Db {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant — voir .env.example');
  instance = wrap(postgres(url, { max: 10, onnotice: () => {} }));
  return instance;
}
