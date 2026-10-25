import { pageContext } from '../context';
import { listProjects } from '../../server/auth';
import { ProjectsView } from '../../views/ProjectsView';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const { db, project, now } = await pageContext();
  return <ProjectsView projects={await listProjects(db)} currentId={project?.id ?? null} now={now.toISOString()} />;
}
