import type { RunsPageData } from '../server/pages';
import { Shell } from '../components/ui';
import { RunsTable } from './AgentView';
import { tr } from '../lib/i18n';

export function RunsView({ data, now, nextHref }: { data: RunsPageData; now: string; nextHref: string | null }) {
  const f = data.filters;
  return (
    <Shell active="runs">
      <div className="page-head">
        <div>
          <div className="eyebrow">{tr('All agents', 'Tous les agents')}</div>
          <h1>Runs</h1>
          {f.scenario && (
            <div className="row" style={{ marginTop: 6 }}>
              <span className="chip chip-amber">{tr('scenario', 'scénario')} · {f.scenario}</span>
              <a className="faint" style={{ fontSize: 12.5 }} href={f.agent ? `/runs?agent=${encodeURIComponent(f.agent)}` : '/runs'}>{tr('clear', 'effacer')}</a>
            </div>
          )}
        </div>
      </div>
      {/* Formulaire GET : les filtres vivent dans l'URL, partageables tels quels. */}
      <form className="filters" method="get" action="/runs">
        <label>
          <span className="sr-only">Agent</span>
          <select name="agent" defaultValue={f.agent ?? ''} aria-label="Agent">
            <option value="">{tr('All agents', 'Tous les agents')}</option>
            {data.agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {data.appVersions.length > 0 && (
          <select name="appVersion" defaultValue={f.appVersion ?? ''} aria-label={tr('App version', 'Version d’app')}>
            <option value="">{tr('All app versions', 'Toutes les versions d’app')}</option>
            {data.appVersions.map((v) => <option key={v} value={v}>app {v}</option>)}
          </select>
        )}
        {data.versions.length > 0 && (
          <select name="version" defaultValue={f.version ?? ''} aria-label={tr('Agent version', 'Version d’agent')}>
            <option value="">{tr('All agent versions', 'Toutes les versions d’agent')}</option>
            {data.versions.map((v) => <option key={v} value={v}>agent {v}</option>)}
          </select>
        )}
        {data.promptVersions.length > 0 && (
          <select name="promptVersion" defaultValue={f.promptVersion ?? ''} aria-label={tr('Prompt version', 'Version de prompt')}>
            <option value="">{tr('All prompt versions', 'Toutes les versions de prompt')}</option>
            {data.promptVersions.map((v) => <option key={v} value={v}>prompt {v}</option>)}
          </select>
        )}
        {data.models.length > 0 && (
          <select name="model" defaultValue={f.model ?? ''} aria-label={tr('Model', 'Modèle')}>
            <option value="">{tr('All models', 'Tous les modèles')}</option>
            {data.models.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <select name="kind" defaultValue={f.kind ?? ''} aria-label={tr('Production or eval runs', 'Runs de production ou d’évaluation')}>
          <option value="">{tr('Production + evals', 'Production + évaluations')}</option>
          <option value="live">{tr('Production only', 'Production uniquement')}</option>
          <option value="eval">{tr('Eval runs only', 'Évaluations uniquement')}</option>
        </select>
        {f.scenario && <input type="hidden" name="scenario" value={f.scenario} />}
        <select name="status" defaultValue={f.status ?? ''} aria-label={tr('Status', 'Statut')}>
          <option value="">{tr('Any status', 'Tous les statuts')}</option>
          <option value="error">{tr('Failed', 'En échec')}</option>
          <option value="ok">{tr('Succeeded', 'Réussis')}</option>
        </select>
        <label><input type="checkbox" name="loops" value="1" defaultChecked={f.loopsOnly} /> {tr('Repeated tool calls only', 'Appels d’outils répétés uniquement')}</label>
        <button className="btn btn-ghost" type="submit">{tr('Apply', 'Appliquer')}</button>
      </form>
      <RunsTable runs={data.runs} now={new Date(now)} />
      {nextHref && (
        <div style={{ marginTop: 16 }}>
          <a className="btn btn-ghost" href={nextHref}>{tr('Older runs →', 'Runs plus anciens →')}</a>
        </div>
      )}
    </Shell>
  );
}
