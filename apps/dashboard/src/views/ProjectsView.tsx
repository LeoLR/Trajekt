import type { ProjectSummary } from '../server/auth';
import { Shell } from '../components/ui';
import { isDemo } from '../lib/demo';
import { getLang, relativeTime as formatRelativeTime, tr } from '../lib/i18n';
import { NewProjectForm } from '../components/NewProjectForm';

export function ProjectsView({ projects, currentId, now }: { projects: ProjectSummary[]; currentId: string | null; now: string }) {
  const t = new Date(now);
  return (
    <Shell active="projects">
      <div className="page-head">
        <div>
          <div className="eyebrow">{tr('Settings', 'Réglages')}</div>
          <h1>{tr('Projects', 'Projets')}</h1>
          <p className="dim" style={{ margin: '6px 0 0', maxWidth: 640 }}>
            {tr('Each project has its own runs and its own API keys. The dashboard shows one project at a time.', 'Chaque projet a ses propres runs et ses propres clés d’API. Le dashboard affiche un projet à la fois.')}
          </p>
        </div>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>{tr('Project', 'Projet')}</th><th className="num">Agents</th><th className="num">Runs</th><th>{tr('Last run', 'Dernier run')}</th><th>{tr('Created', 'Créé')}</th><th></th></tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.id === currentId && <span className="chip chip-amber" style={{ marginLeft: 8 }}>{tr('current', 'actuel')}</span>}
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
                      <button className="btn btn-ghost" type="submit">{tr('Open', 'Ouvrir')}</button>
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
          <h2>{tr('New project', 'Nouveau projet')}</h2>
          <NewProjectForm lang={getLang()} />
        </section>
      )}
    </Shell>
  );
}
