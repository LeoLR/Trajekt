/**
 * Client Postgres minimal (protocole "simple query"), réservé aux tests.
 *
 * Il permet d'exécuter les VRAIES requêtes SQL de src/server contre un
 * vrai Postgres sans dépendance npm. Il imite les conversions du driver
 * `postgres` utilisé en production (timestamptz → Date, jsonb → objet,
 * numeric/int8 → string), pour que les tests voient les mêmes types.
 *
 * Auth "trust" uniquement : c'est un outil de test local, pas un driver.
 */

import net from 'node:net';
import type { Db } from '../src/server/db';

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`nombre non fini : ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : JSON.stringify(v);
  return `'${s.replace(/'/g, "''")}'`;
}

export function interpolate(text: string, params: unknown[] = []): string {
  return text.replace(/\$(\d+)/g, (_, n) => {
    const i = Number(n) - 1;
    if (i >= params.length) throw new Error(`paramètre $${n} manquant`);
    return literal(params[i]);
  });
}

function parseValue(oid: number, raw: string): unknown {
  switch (oid) {
    case 16: return raw === 't';
    case 21: case 23: case 26: return Number(raw);
    case 700: case 701: return Number(raw);
    case 114: case 3802: return JSON.parse(raw);
    case 1082: return raw;
    case 1114: case 1184: return new Date(raw.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    default: return raw; // text, uuid, int8, numeric : string, comme postgres.js
  }
}

export class PgWire implements Db {
  private socket!: net.Socket;
  private buffer = Buffer.alloc(0);
  private waiter: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  static async connect(opts: { host: string; port: number; user: string; database: string }) {
    const c = new PgWire();
    await c.open(opts);
    return c;
  }

  private open(opts: { host: string; port: number; user: string; database: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.connect(opts.port, opts.host, async () => {
        const body = Buffer.concat([
          int32(196608),
          Buffer.from(`user\0${opts.user}\0database\0${opts.database}\0\0`),
        ]);
        this.socket.write(Buffer.concat([int32(body.length + 4), body]));
        try {
          await this.readUntilReady();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.socket.on('data', (d) => {
        this.buffer = Buffer.concat([this.buffer, d]);
        this.waiter?.();
      });
      this.socket.on('error', reject);
    });
  }

  private async nextMessage(): Promise<{ type: string; body: Buffer }> {
    while (this.buffer.length < 5 || this.buffer.length < 1 + this.buffer.readInt32BE(1)) {
      await new Promise<void>((r) => (this.waiter = r));
      this.waiter = null;
    }
    const type = String.fromCharCode(this.buffer[0]);
    const len = this.buffer.readInt32BE(1);
    const body = this.buffer.subarray(5, 1 + len);
    this.buffer = this.buffer.subarray(1 + len);
    return { type, body };
  }

  private async readUntilReady(): Promise<Record<string, unknown>[]> {
    let fields: { name: string; oid: number }[] = [];
    let rows: Record<string, unknown>[] = [];
    let error: Error | null = null;
    for (;;) {
      const { type, body } = await this.nextMessage();
      if (type === 'R') {
        if (body.readInt32BE(0) !== 0) throw new Error('auth non supportée (trust uniquement)');
      } else if (type === 'T') {
        fields = [];
        rows = [];
        let off = 2;
        for (let i = 0; i < body.readInt16BE(0); i++) {
          const end = body.indexOf(0, off);
          const name = body.toString('utf8', off, end);
          off = end + 1;
          const oid = body.readInt32BE(off + 6);
          off += 18;
          fields.push({ name, oid });
        }
      } else if (type === 'D') {
        const row: Record<string, unknown> = {};
        let off = 2;
        for (let i = 0; i < body.readInt16BE(0); i++) {
          const len = body.readInt32BE(off);
          off += 4;
          if (len === -1) row[fields[i].name] = null;
          else {
            row[fields[i].name] = parseValue(fields[i].oid, body.toString('utf8', off, off + len));
            off += len;
          }
        }
        rows.push(row);
      } else if (type === 'E') {
        const parts: Record<string, string> = {};
        let off = 0;
        while (body[off] !== 0) {
          const code = String.fromCharCode(body[off]);
          const end = body.indexOf(0, off + 1);
          parts[code] = body.toString('utf8', off + 1, end);
          off = end + 1;
        }
        error = Object.assign(new Error(parts.M), { code: parts.C, detail: parts.D });
      } else if (type === 'Z') {
        if (error) throw error;
        return rows;
      }
      // S, K, C, N, I : ignorés
    }
  }

  query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const run = async () => {
      const sql = interpolate(text, params);
      const body = Buffer.from(sql + '\0');
      this.socket.write(Buffer.concat([Buffer.from('Q'), int32(body.length + 4), body]));
      return (await this.readUntilReady()) as T[];
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    await this.query('begin');
    try {
      const out = await fn(this);
      await this.query('commit');
      return out;
    } catch (e) {
      await this.query('rollback');
      throw e;
    }
  }

  async close() {
    this.socket.end();
  }
}

function int32(n: number) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
}
