import { notFound } from 'next/navigation';
import { pageContext } from '../../context';
import { loadAgentPage } from '../../../server/pages';
import { AgentView } from '../../../views/AgentView';
import { SetupView } from '../../../views/SetupView';
import { isDimension } from '../../../server/queries';

export const dynamic = 'force-dynamic';

export default async function AgentPage({
  params, searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ compare?: string; dim?: string; a?: string; b?: string }>;
}) {
  const { name } = await params;
  const { compare, dim, a, b } = await searchParams;
  const { db, project } = await pageContext();
  if (!project) return <SetupView />;
  const mode = compare === 'window' || compare === 'version' || compare === 'ab' ? compare : undefined;
  const dimension = isDimension(dim) ? dim : undefined;
  const data = await loadAgentPage(db, project.id, decodeURIComponent(name), { mode, dimension, a, b });
  if (!data) notFound();
  return <AgentView data={data} />;
}
