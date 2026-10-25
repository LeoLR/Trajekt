import { NextResponse } from 'next/server';
import { dashboardRoute, parseDate } from '../../../../../lib/route';
import { apiError } from '../../../../../lib/errors';
import { agentTimeseries, isDimension, type Bucket } from '../../../../../server/queries';

const MAX_POINTS = 24 * 31;

/**
 * GET /api/agents/:name/timeseries?from&to&bucket=hour|day&dimension=app|agent|prompt|model&version
 * Défaut : 14 derniers jours, par jour.
 */
export const GET = dashboardRoute(async ({ req, db, project, now }) => {
  const name = decodeURIComponent(req.nextUrl.pathname.split('/')[3] ?? '');
  const p = req.nextUrl.searchParams;
  const bucket = (p.get('bucket') ?? 'day') as Bucket;
  if (bucket !== 'hour' && bucket !== 'day') return apiError('VALIDATION_ERROR', 'bucket must be hour or day.');
  const to = parseDate(p.get('to')) ?? now;
  const from = parseDate(p.get('from')) ?? new Date(to.getTime() - 14 * 86400_000);
  if (from === null || to === null || from >= to) return apiError('VALIDATION_ERROR', 'Invalid from/to.');
  const step = bucket === 'hour' ? 3600_000 : 86400_000;
  if ((to.getTime() - from.getTime()) / step > MAX_POINTS) {
    return apiError('VALIDATION_ERROR', `Range too large for bucket=${bucket} (max ${MAX_POINTS} points).`);
  }
  const version = p.has('version') ? p.get('version')! : undefined;
  const dimension = p.get('dimension') ?? 'agent';
  if (!isDimension(dimension)) return apiError('VALIDATION_ERROR', 'dimension must be app, agent, prompt or model.');
  return NextResponse.json({
    agent: name, bucket, from: from.toISOString(), to: to.toISOString(),
    points: await agentTimeseries(db, project.id, name, { from, to, bucket, version, dimension }),
  });
});
