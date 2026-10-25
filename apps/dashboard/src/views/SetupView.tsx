import { Shell } from '../components/ui';
import { tr } from '../lib/i18n';

/** Affiché tant qu'aucun projet n'existe. */
export function SetupView() {
  return (
    <Shell>
      <div className="panel empty">
        <h2 style={{ marginBottom: 6 }}>{tr('No project yet', 'Aucun projet pour l’instant')}</h2>
        <p style={{ margin: 0 }}>{tr('Create one on the', 'Créez-en un sur la page')} <a href="/projects">{tr('Projects', 'Projets')}</a>{tr(' page, or from the command line:', ', ou en ligne de commande :')}</p>
        <pre className="code">pnpm --filter dashboard create-project my-project</pre>
      </div>
    </Shell>
  );
}
