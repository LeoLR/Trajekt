import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { isAuthenticatedDashboardRequest } from '../../../lib/session.js';
import { getDefaultProject } from '../../../lib/project.js';
import { apiError } from '../../../lib/errors.js';
import type { StatsResponse } from '../../../lib/api-types.js';

// Whitelist fermée — jamais de valeur arbitraire passée à sql.raw().
const RANGE_TO_INTERVAL: Record<string, string | null> = {
  '24h': '1 day',
  '7d': '7 days',
  '30d': '30 days',
  all: null,
};

interface SummaryRow {
  total_runs: string;
  total_cost_usd: string | null;
  avg_duration_ms: string | null;
  total_tool_calls: string;
}

interface TrendRow {
  day: string;
  cost: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthenticatedDashboardRequest(req)) {
    return apiError('UNAUTHORIZED', 'Session invalide ou expirée.');
  }

  const range = req.nextUrl.searchParams.get('range') ?? '7d';
  if (!(range in RANGE_TO_INTERVAL)) {
    return apiError('VALIDATION_ERROR', `range invalide : ${range} (attendu 24h, 7d, 30d ou all)`);
  }
  const interval = RANGE_TO_INTERVAL[range];

  const project = await getDefaultProject();
  const dateFilter = interval
    ? sql`and created_at >= now() - interval '${sql.raw(interval)}'`
    : sql``;

  const summaryRows = await db.execute<SummaryRow>(sql`
    select
      count(*)::text as total_runs,
      coalesce(sum(total_cost_usd), 0)::text as total_cost_usd,
      coalesce(avg(total_duration_ms), 0)::text as avg_duration_ms,
      coalesce(sum(
        (select count(*) from jsonb_array_elements(steps) s where s->>'type' = 'tool_call')
      ), 0)::text as total_tool_calls
    from trajectories
    where project_id = ${project.id}
    ${dateFilter}
  `);
  const summary = summaryRows[0];

  const trendRows = await db.execute<TrendRow>(sql`
    select
      date_trunc('day', created_at)::date::text as day,
      coalesce(sum(total_cost_usd), 0)::text as cost
    from trajectories
    where project_id = ${project.id}
    ${dateFilter}
    group by 1
    order by 1 asc
  `);

  const body: StatsResponse = {
    totalRuns: Number(summary?.total_runs ?? 0),
    totalCostUsd: Number(summary?.total_cost_usd ?? 0),
    totalToolCalls: Number(summary?.total_tool_calls ?? 0),
    avgDurationMs: Math.round(Number(summary?.avg_duration_ms ?? 0)),
    costOverTime: trendRows.map((r) => ({ date: r.day, costUsd: Number(r.cost) })),
  };

  return NextResponse.json(body);
}
