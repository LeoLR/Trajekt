/**
 * Scores ajoutés après coup : jugement d'un LLM, retour utilisateur,
 * PR mergée, assertions d'une suite de tests. Rattachés au run par son
 * traceId (ce que l'appli connaît) ou par son id Trajekt.
 */

import type { Db } from './db';

export interface ScoreInput {
  traceId?: string;
  runId?: string;
  name: string;
  value: number;
  comment?: string;
}

export interface ScoreResult {
  name: string;
  runId: string | null;
  ok: boolean;
  error?: string;
}

const NAME = /^[A-Za-z0-9_.\-]{1,100}$/;

/** Valide une entrée brute ; renvoie un message d'erreur ou l'entrée typée. */
export function parseScore(v: unknown): ScoreInput | string {
  if (!v || typeof v !== 'object') return 'Each score must be an object.';
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || !NAME.test(o.name)) return '"name" must be 1–100 characters: letters, digits, _ . -';
  const value = typeof o.value === 'boolean' ? Number(o.value) : o.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return '"value" must be a number (or a boolean).';
  if (o.traceId === undefined && o.runId === undefined) return 'Give "traceId" (from your trace) or "runId" (Trajekt run id).';
  if (o.traceId !== undefined && typeof o.traceId !== 'string') return '"traceId" must be a string.';
  if (o.runId !== undefined && (typeof o.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.runId))) return '"runId" must be a run id (uuid).';
  if (o.comment !== undefined && typeof o.comment !== 'string') return '"comment" must be a string.';
  return {
    name: o.name, value,
    traceId: o.traceId as string | undefined, runId: o.runId as string | undefined,
    comment: (o.comment as string | undefined)?.slice(0, 2000),
  };
}

export async function addScores(db: Db, projectId: string, items: ScoreInput[]): Promise<ScoreResult[]> {
  const out: ScoreResult[] = [];
  for (const s of items) {
    const [run] = s.runId
      ? await db.query<{ id: string }>('select id from trajectories where project_id = $1 and id = $2::uuid', [projectId, s.runId])
      : await db.query<{ id: string }>('select id from trajectories where project_id = $1 and trace_id = $2', [projectId, s.traceId]);
    if (!run) {
      out.push({ name: s.name, runId: null, ok: false, error: `No run found for ${s.runId ? `runId ${s.runId}` : `traceId ${s.traceId}`}. Send the trace first.` });
      continue;
    }
    await db.query(
      `insert into run_scores (trajectory_id, project_id, name, value, source, comment)
       values ($1::uuid, $2::uuid, $3, $4, 'api', $5)
       on conflict (trajectory_id, name) do update
         set value = excluded.value, source = 'api', comment = excluded.comment, created_at = now()`,
      [run.id, projectId, s.name, s.value, s.comment ?? null],
    );
    out.push({ name: s.name, runId: run.id, ok: true });
  }
  return out;
}
