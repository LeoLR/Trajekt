import { pageContext } from '../context';
import { loadRunsPage } from '../../server/pages';
import { RunsView } from '../../views/RunsView';
import { SetupView } from '../../views/SetupView';
import { decodeCursor, encodeCursor } from '../../lib/route';

export const dynamic = 'force-dynamic';

type Search = {
  agent?: string; version?: string; appVersion?: string; promptVersion?: string; model?: string;
  status?: string; loops?: string; cursor?: string;
};

export default async function RunsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { db, project, now } = await pageContext();
  if (!project) return <SetupView />;
  const filters = {
    agent: sp.agent || undefined,
    // Les valeurs de dimension n'ont de sens qu'avec un agent choisi.
    version: sp.agent && sp.version ? sp.version : undefined,
    appVersion: sp.agent && sp.appVersion ? sp.appVersion : undefined,
    promptVersion: sp.agent && sp.promptVersion ? sp.promptVersion : undefined,
    model: sp.agent && sp.model ? sp.model : undefined,
    status: sp.status === 'ok' || sp.status === 'error' ? sp.status : undefined,
    loopsOnly: sp.loops === '1',
    cursor: sp.cursor ? decodeCursor(sp.cursor) ?? undefined : undefined,
  } as const;
  const data = await loadRunsPage(db, project.id, filters);
  let nextHref: string | null = null;
  if (data.nextCursor) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'cursor') q.set(k, v);
    q.set('cursor', encodeCursor(data.nextCursor));
    nextHref = `/runs?${q}`;
  }
  return <RunsView data={data} now={now.toISOString()} nextHref={nextHref} />;
}
