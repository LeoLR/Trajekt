/**
 * Import depuis Langfuse : lit les traces d'un projet Langfuse par son API
 * publique et les enregistre dans Trajekt, scores compris. De quoi suivre
 * un agent déjà instrumenté avec Langfuse sans toucher à son code.
 *
 * Idempotent : un trace déjà importé est mis à jour (fusion par id), donc
 * on peut relancer l'import sur une fenêtre qui chevauche la précédente.
 */

import type { Db } from './db';
import { ingestPayload, type IdentityDefaults } from './ingest';

export interface LangfuseImportOptions {
  host: string;
  publicKey: string;
  secretKey: string;
  /** Traces à partir de cette date. */
  from: Date;
  to?: Date;
  /** Limiter à un nom de trace (= l'agent). */
  name?: string;
  /** Plafond de traces importées (défaut 5000). */
  max?: number;
  defaults?: IdentityDefaults;
  fetch?: typeof fetch;
  onProgress?: (done: number) => void;
}

export interface LangfuseImportResult {
  listed: number;
  imported: number;
  failed: Array<{ id: string; error: string }>;
}

export async function importFromLangfuse(db: Db, projectId: string, o: LangfuseImportOptions): Promise<LangfuseImportResult> {
  const f = o.fetch ?? fetch;
  const base = o.host.replace(/\/$/, '');
  const headers = { Authorization: `Basic ${Buffer.from(`${o.publicKey}:${o.secretKey}`).toString('base64')}` };
  const get = async (path: string) => {
    for (let attempt = 0; ; attempt++) {
      const res = await f(`${base}${path}`, { headers });
      if (res.status === 429 && attempt < 5) {
        await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 2) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Langfuse ${res.status} on ${path.split('?')[0]}${res.status === 401 ? ' — check LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY' : ''}`);
      return res.json() as Promise<any>;
    }
  };

  const max = o.max ?? 5000;
  const ids: string[] = [];
  for (let page = 1; ids.length < max; page++) {
    const q = new URLSearchParams({ page: String(page), limit: '100', fromTimestamp: o.from.toISOString() });
    if (o.to) q.set('toTimestamp', o.to.toISOString());
    if (o.name) q.set('name', o.name);
    const list = await get(`/api/public/traces?${q}`);
    const data: Array<{ id: string }> = list.data ?? [];
    ids.push(...data.map((t) => t.id));
    const totalPages = Number(list.meta?.totalPages ?? page);
    if (data.length === 0 || page >= totalPages) break;
  }

  const out: LangfuseImportResult = { listed: Math.min(ids.length, max), imported: 0, failed: [] };
  for (const id of ids.slice(0, max)) {
    try {
      // Le détail d'une trace contient ses observations et ses scores.
      const trace = await get(`/api/public/traces/${encodeURIComponent(id)}`);
      await ingestPayload(db, projectId, trace, o.defaults);
      out.imported++;
      o.onProgress?.(out.imported);
    } catch (e) {
      out.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** « 7d », « 24h », « 90m » ou une date ISO → Date. */
export function parseSince(v: string, now = new Date()): Date {
  const m = /^(\d+)\s*([dhm])$/.exec(v.trim());
  if (m) return new Date(now.getTime() - Number(m[1]) * { d: 86400_000, h: 3600_000, m: 60_000 }[m[2] as 'd' | 'h' | 'm']);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid --since "${v}" (use 7d, 24h, 90m or an ISO date)`);
  return d;
}
