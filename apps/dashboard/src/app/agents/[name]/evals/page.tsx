import { notFound } from 'next/navigation';
import { pageContext } from '../../../context';
import { loadSuitePage } from '../../../../server/suites';
import { isDimension } from '../../../../server/queries';
import { EvalView } from '../../../../views/EvalView';
import { SetupView } from '../../../../views/SetupView';

export const dynamic = 'force-dynamic';

export default async function EvalPage({
  params, searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ dim?: string; a?: string; b?: string }>;
}) {
  const { name } = await params;
  const { dim, a, b } = await searchParams;
  const { db, project, now } = await pageContext();
  if (!project) return <SetupView />;
  const data = await loadSuitePage(db, project.id, decodeURIComponent(name), {
    dimension: isDimension(dim) ? dim : undefined, a, b,
  });
  if (!data) notFound();
  return <EvalView data={data} now={now.toISOString()} />;
}
