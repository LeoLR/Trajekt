import { pageContext } from './context';
import { loadAgentsPage } from '../server/pages';
import { AgentsView } from '../views/AgentsView';
import { SetupView } from '../views/SetupView';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { db, project, now } = await pageContext();
  if (!project) return <SetupView />;
  return <AgentsView data={await loadAgentsPage(db, project.id, now)} />;
}
