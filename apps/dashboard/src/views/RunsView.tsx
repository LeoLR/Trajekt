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
        {data.versions.length > 0 && (
          <select name="version" defaultValue={f.version ?? ''} aria-label="Version">
            <option value="">All versions</option>
            {data.versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
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
