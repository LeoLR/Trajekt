import type { RunsPageData } from '../server/pages';
import { Shell } from '../components/ui';
import { RunsTable } from './AgentView';

export function RunsView({ data, now, nextHref }: { data: RunsPageData; now: string; nextHref: string | null }) {
  const f = data.filters;
  return (
    <Shell active="runs">
      <div className="page-head">
        <div>
          <div className="eyebrow">All agents</div>
          <h1>Runs</h1>
          {f.scenario && (
            <div className="row" style={{ marginTop: 6 }}>
              <span className="chip chip-amber">scenario · {f.scenario}</span>
              <a className="faint" style={{ fontSize: 12.5 }} href={f.agent ? `/runs?agent=${encodeURIComponent(f.agent)}` : '/runs'}>clear</a>
            </div>
          )}
        </div>
      </div>
      {/* Formulaire GET : les filtres vivent dans l'URL, partageables tels quels. */}
      <form className="filters" method="get" action="/runs">
        <label>
          <span className="sr-only">Agent</span>
          <select name="agent" defaultValue={f.agent ?? ''} aria-label="Agent">
            <option value="">All agents</option>
            {data.agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {data.appVersions.length > 0 && (
          <select name="appVersion" defaultValue={f.appVersion ?? ''} aria-label="App version">
            <option value="">All app versions</option>
            {data.appVersions.map((v) => <option key={v} value={v}>app {v}</option>)}
          </select>
        )}
        {data.versions.length > 0 && (
          <select name="version" defaultValue={f.version ?? ''} aria-label="Agent version">
            <option value="">All agent versions</option>
            {data.versions.map((v) => <option key={v} value={v}>agent {v}</option>)}
          </select>
        )}
        {data.promptVersions.length > 0 && (
          <select name="promptVersion" defaultValue={f.promptVersion ?? ''} aria-label="Prompt version">
            <option value="">All prompt versions</option>
            {data.promptVersions.map((v) => <option key={v} value={v}>prompt {v}</option>)}
          </select>
        )}
        {data.models.length > 0 && (
          <select name="model" defaultValue={f.model ?? ''} aria-label="Model">
            <option value="">All models</option>
            {data.models.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <select name="kind" defaultValue={f.kind ?? ''} aria-label="Production or eval runs">
          <option value="">Production + evals</option>
          <option value="live">Production only</option>
          <option value="eval">Eval runs only</option>
        </select>
        {f.scenario && <input type="hidden" name="scenario" value={f.scenario} />}
        <select name="status" defaultValue={f.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="error">Failed</option>
          <option value="ok">Succeeded</option>
        </select>
        <label><input type="checkbox" name="loops" value="1" defaultChecked={f.loopsOnly} /> Repeated tool calls only</label>
        <button className="btn btn-ghost" type="submit">Apply</button>
      </form>
      <RunsTable runs={data.runs} now={new Date(now)} />
      {nextHref && (
        <div style={{ marginTop: 16 }}>
          <a className="btn btn-ghost" href={nextHref}>Older runs →</a>
        </div>
      )}
    </Shell>
  );
}
