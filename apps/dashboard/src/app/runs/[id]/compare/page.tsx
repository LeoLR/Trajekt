import { notFound } from 'next/navigation';
import { pageContext } from '../../../context';
import { loadComparePage } from '../../../../server/pages';
import { CompareView } from '../../../../views/CompareView';
import { SetupView } from '../../../../views/SetupView';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { db, project } = await pageContext();
  if (!project) return <SetupView />;
  const data = await loadComparePage(db, project.id, id, sp.with);
  if (!data) notFound();
  return <CompareView data={data} />;
}
