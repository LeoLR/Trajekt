/**
 * Ingestion : payload brut → trajectoires normalisées → lignes en base.
 *
 * Le point délicat est la FUSION. Un exporter OTel envoie une trace en
 * plusieurs lots (les enfants d'abord, la racine à la fin). Chaque lot
 * qui porte un traceId déjà connu est fusionné dans la ligne existante,
 * et les métriques du run sont recalculées sur la trajectoire complète.
 * Un verrou transactionnel par (projet, traceId) évite que deux lots
 * concurrents de la même trace créent deux lignes.
 */

import {
  normalizeAll,
  mergeTrajectories,
  computeMetrics,
  SCHEMA_VERSION,
  type Trajectory,
  type TrajectorySource,
} from '@trajekt/core';
import type { Db } from './db';

/** Identité par défaut fournie par l'appelant (headers), utilisée si la trace n'en porte pas. */
export interface IdentityDefaults {
  agentName?: string;
  appVersion?: string;
  agentVersion?: string;
  promptVersion?: string;
  environment?: string;
}

export interface IngestedRun {
  id: string;
  traceId: string | null;
  agentName: string;
  agentVersion: string | null;
  appVersion: string | null;
  sourceFormat: string | null;
  status: 'ok' | 'error';
  stepCount: number;
  /** true si ce lot a complété un run déjà reçu. */
  merged: boolean;
  createdAt: string;
}

interface ExistingRow {
  id: string;
  schema_version: number;
  source: TrajectorySource;
  steps: Trajectory['steps'];
  metadata: Trajectory['metadata'];
  created_at: Date;
}

const UNKNOWN_AGENT = 'unknown';

/** JSONB relu : objet normalement, chaîne si une ancienne ligne a été doublement encodée. */
export function asJson<T>(v: T | string): T {
  return typeof v === 'string' ? (JSON.parse(v) as T) : v;
}

function applyDefaults(t: Trajectory, d: IdentityDefaults): Trajectory {
  const m = t.metadata;
  return {
    ...t,
    metadata: {
      ...m,
      agentName: m.agentName || d.agentName,
      appVersion: m.appVersion || d.appVersion,
      agentVersion: m.agentVersion || d.agentVersion,
      promptVersion: m.promptVersion || d.promptVersion,
      environment: m.environment || d.environment,
    },
  };
}

async function persist(db: Db, projectId: string, incoming: Trajectory): Promise<IngestedRun> {
  const traceId = incoming.metadata.traceId ?? null;

  return db.transaction(async (tx) => {
    let trajectory = incoming;
    let existing: ExistingRow | undefined;

    if (traceId) {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${projectId}:${traceId}`,
      ]);
      [existing] = await tx.query<ExistingRow>(
        `select id, schema_version, source, steps, metadata, created_at
           from trajectories
          where project_id = $1 and trace_id = $2
          for update`,
        [projectId, traceId],
      );
      if (existing) {
        trajectory = mergeTrajectories(
          {
            schemaVersion: SCHEMA_VERSION,
            id: existing.id,
            source: existing.source,
            steps: asJson(existing.steps),
            metadata: asJson(existing.metadata),
            createdAt: existing.created_at.toISOString(),
          },
          incoming,
        );
      }
    }

    const m = computeMetrics(trajectory);
    const meta = trajectory.metadata;
    const values = [
      projectId,
      traceId,
      meta.agentName || UNKNOWN_AGENT,
      // Sans version d'agent explicite, l'agent suit la version de l'appli.
      meta.agentVersion ?? meta.appVersion ?? null,
      meta.promptVersion ?? null,
      meta.environment ?? null,
      m.primaryModel ?? null,
      trajectory.schemaVersion,
      trajectory.source,
      meta.sourceFormat ?? null,
      m.status,
      m.startedAt ?? new Date().toISOString(),
      m.durationMs ?? null,
      m.stepCount,
      m.llmCallCount,
      m.toolCallCount,
      m.errorCount,
      m.toolErrorCount,
      m.inputTokens,
      m.outputTokens,
      m.costUsd,
      m.costEstimated,
      m.redundantToolCalls,
      m.retryCount,
      m.pathSignature,
      JSON.stringify(trajectory.steps),
      JSON.stringify(meta),
      meta.appVersion ?? null,
    ];

    const columns = `project_id, trace_id, agent_name, agent_version, prompt_version, environment,
      primary_model, schema_version, source, source_format, status, started_at, duration_ms,
      step_count, llm_call_count, tool_call_count, error_count, tool_error_count,
      input_tokens, output_tokens, cost_usd, cost_estimated, redundant_tool_calls,
      retry_count, path_signature, steps, metadata, app_version`;
    const placeholders = `$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::text::jsonb, $27::text::jsonb, $28`;

    const [row] = existing
      ? await tx.query<{ id: string; created_at: Date }>(
          `update trajectories set (${columns}, updated_at) = (${placeholders}, now())
            where id = $29 returning id, created_at`,
          [...values, existing.id],
        )
      : await tx.query<{ id: string; created_at: Date }>(
          `insert into trajectories (${columns}) values (${placeholders}) returning id, created_at`,
          values,
        );

    return {
      id: row.id,
      traceId,
      agentName: meta.agentName || UNKNOWN_AGENT,
      agentVersion: meta.agentVersion ?? meta.appVersion ?? null,
      appVersion: meta.appVersion ?? null,
      sourceFormat: meta.sourceFormat ?? null,
      status: m.status,
      stepCount: m.stepCount,
      merged: Boolean(existing),
      createdAt: row.created_at.toISOString(),
    };
  });
}

/**
 * Normalise et persiste un payload. Lève UnknownFormatError (de
 * @trajekt/core) si aucun format n'est reconnu.
 */
export async function ingestPayload(
  db: Db,
  projectId: string,
  raw: unknown,
  defaults: IdentityDefaults = {},
): Promise<IngestedRun[]> {
  const trajectories = normalizeAll(raw).map((t) => applyDefaults(t, defaults));
  const out: IngestedRun[] = [];
  // Séquentiel : un même payload peut contenir deux lots d'une même trace.
  for (const t of trajectories) out.push(await persist(db, projectId, t));
  return out;
}
