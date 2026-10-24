export interface TrajectorySummary {
  id: string;
  source: 'live' | 'replay' | 'simulation';
  sourceFormat: string | null;
  stepCount: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  createdAt: string; // ISO 8601
}

export interface ListTrajectoriesResponse {
  items: TrajectorySummary[];
  nextCursor: string | null;
}

export interface IngestResponse {
  trajectories: Array<{
    id: string;
    sourceFormat: string | null;
    stepCount: number;
    createdAt: string;
  }>;
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
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
