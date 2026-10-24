import { notFound } from 'next/navigation';
import { pageContext } from '../../context';
import { loadAgentPage } from '../../../server/pages';
import { AgentView } from '../../../views/AgentView';
import { SetupView } from '../../../views/SetupView';

export const dynamic = 'force-dynamic';

export default async function AgentPage({
  params, searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const { name } = await params;
  const { compare } = await searchParams;
  const { db, project } = await pageContext();
  if (!project) return <SetupView />;
  const mode = compare === 'window' || compare === 'version' ? compare : undefined;
  const data = await loadAgentPage(db, project.id, decodeURIComponent(name), { mode });
  if (!data) notFound();
  return <AgentView data={data} />;
}
