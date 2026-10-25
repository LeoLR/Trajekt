/**
 * Formes des réponses de l'API — source unique, importée par les routes
 * et par quiconque consomme l'API. Les types de données viennent de
 * src/server (pas de duplication).
 */

export type { AgentOverview, TimeseriesPoint, VersionStats, ComparisonResult, RunSummary } from '../server/queries';
export type { AlertRow } from '../server/alerts';
export type { IngestedRun } from '../server/ingest';

export interface IngestResponse {
  trajectories: import('../server/ingest').IngestedRun[];
}

export interface ListRunsResponse {
  items: import('../server/queries').RunSummary[];
  nextCursor: string | null;
}

export interface StatsResponse {
  totalRuns: number;
  totalCostUsd: number;
  totalToolCalls: number;
  avgDurationMs: number;
  costOverTime: Array<{ date: string; costUsd: number }>;
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_FORMAT'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
