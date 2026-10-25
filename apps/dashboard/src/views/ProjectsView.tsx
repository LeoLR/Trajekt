import type { ProjectSummary } from '../server/auth';
import { Shell } from '../components/ui';
import { isDemo } from '../lib/demo';
import { formatRelativeTime } from '../lib/format';
import { NewProjectForm } from '../components/NewProjectForm';

export function ProjectsView({ projects, currentId, now }: { projects: ProjectSummary[]; currentId: string | null; now: string }) {
  const t = new Date(now);
  return (
    <Shell active="projects">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Projects</h1>
          <p className="dim" style={{ margin: '6px 0 0', maxWidth: 640 }}>
            Each project has its own runs and its own API keys. The dashboard shows one project at a time.
          </p>
        </div>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Project</th><th className="num">Agents</th><th className="num">Runs</th><th>Last run</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.id === currentId && <span className="chip chip-amber" style={{ marginLeft: 8 }}>current</span>}
                  <div className="faint mono" style={{ fontSize: 11 }}>{p.id}</div>
                </td>
                <td className="num">{p.agents}</td>
                <td className="num">{p.runs}</td>
                <td className="faint">{p.lastRun ? formatRelativeTime(p.lastRun, t) : '—'}</td>
                <td className="faint">{formatRelativeTime(p.createdAt, t)}</td>
                <td>
                  {p.id !== currentId && (
                    <form method="post" action="/api/projects/current">
                      <input type="hidden" name="projectId" value={p.id} />
                      <button className="btn btn-ghost" type="submit">Open</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isDemo() && (
        <section className="section">
          <h2>New project</h2>
          <NewProjectForm />
        </section>
      )}
    </Shell>
  );
}
