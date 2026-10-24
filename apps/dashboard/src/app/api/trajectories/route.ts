import { NextRequest, NextResponse } from 'next/server';
import { and, desc, asc, eq, gte, lte, lt, gt, or } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { trajectories } from '../../../db/schema.js';
import { isAuthenticatedDashboardRequest } from '../../../lib/session.js';
import { getDefaultProject } from '../../../lib/project.js';
import { apiError } from '../../../lib/errors.js';
import type { ListTrajectoriesResponse, TrajectorySummary } from '../../../lib/api-types.js';

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthenticatedDashboardRequest(req)) {
    return apiError('UNAUTHORIZED', 'Session invalide ou expirée.');
  }

  const params = req.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 20), 100);
  const sortDir = params.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const sortByParam = params.get('sortBy');
  const sortBy =
    sortByParam === 'totalCostUsd' || sortByParam === 'totalDurationMs' ? sortByParam : 'createdAt';
  const source = params.get('source');
  const format = params.get('format');
  const from = params.get('from');
  const to = params.get('to');
  const cursorParam = params.get('cursor');

  const project = await getDefaultProject();
  const conditions = [eq(trajectories.projectId, project.id)];
  if (source) conditions.push(eq(trajectories.source, source));
  if (format) conditions.push(eq(trajectories.sourceFormat, format));
  if (from) conditions.push(gte(trajectories.createdAt, new Date(from)));
  if (to) conditions.push(lte(trajectories.createdAt, new Date(to)));

  if (cursorParam) {
    const cursor = decodeCursor(cursorParam);
    if (!cursor) return apiError('VALIDATION_ERROR', 'Curseur de pagination invalide.');
    // Pagination stable : (createdAt, id) comme clé composite, pour
    // départager les lignes à timestamp identique.
    const cmp = sortDir === 'desc' ? lt : gt;
    conditions.push(
      or(
        cmp(trajectories.createdAt, new Date(cursor.createdAt)),
        and(eq(trajectories.createdAt, new Date(cursor.createdAt)), cmp(trajectories.id, cursor.id)),
      )!,
    );
  }

  const orderCol = sortBy === 'createdAt' ? trajectories.createdAt
    : sortBy === 'totalCostUsd' ? trajectories.totalCostUsd
    : trajectories.totalDurationMs;
  const orderFn = sortDir === 'desc' ? desc : asc;

  const rows = await db
    .select({
      id: trajectories.id,
      source: trajectories.source,
      sourceFormat: trajectories.sourceFormat,
      stepCount: trajectories.stepCount,
      totalCostUsd: trajectories.totalCostUsd,
      totalDurationMs: trajectories.totalDurationMs,
      createdAt: trajectories.createdAt,
    })
    .from(trajectories)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(orderFn(orderCol), orderFn(trajectories.id))
    .limit(limit + 1); // +1 pour savoir s'il reste une page

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: TrajectorySummary[] = page.map((r) => ({
    id: r.id,
    source: r.source as TrajectorySummary['source'],
    sourceFormat: r.sourceFormat,
    stepCount: r.stepCount,
    totalCostUsd: r.totalCostUsd != null ? Number(r.totalCostUsd) : null,
    totalDurationMs: r.totalDurationMs,
    createdAt: r.createdAt.toISOString(),
  }));

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  const body: ListTrajectoriesResponse = { items, nextCursor };
  return NextResponse.json(body);
}
