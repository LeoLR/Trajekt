import { notFound } from 'next/navigation';
import { pageContext } from '../../context';
import { loadRunPage } from '../../../server/pages';
import { RunView } from '../../../views/RunView';
import { SetupView } from '../../../views/SetupView';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, project } = await pageContext();
  if (!project) return <SetupView />;
  const data = await loadRunPage(db, project.id, id);
  if (!data) notFound();
  return <RunView data={data} />;
}
