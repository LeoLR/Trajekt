import type { AgentPageData } from '../server/pages';
import { DIMENSIONS, type Dimension } from '../server/queries';
import { Kpi, RunStatus, Shell, VerdictChip } from '../components/ui';
import { LineChart } from '../components/charts';
import {
  formatCost, formatDelta, formatScore, formatDuration, formatMetric, formatNumber, formatPercent, shortId,
} from '../lib/format';
import { coreText, dimPlural, dimShort, metricName, relativeTime as formatRelativeTime, tr } from '../lib/i18n';

/** Paramètre de /runs qui filtre sur une dimension. */
const RUN_FILTER: Record<Dimension, string> = { app: 'appVersion', agent: 'version', prompt: 'promptVersion', model: 'model' };

export function AgentView({ data }: { data: AgentPageData }) {
  const now = new Date(data.now);
  const o = data.overview;
  const enc = encodeURIComponent(data.name);
  const xLabels = data.timeseries.map((p) => new Date(p.t).toISOString().slice(5, 10));
  const ts = data.timeseries;
  const c = data.comparison;
  const regressions = c?.comparisons.filter((x) => x.verdict === 'regression') ?? [];
  const dim = data.dimension;
  const values = data.dimensionValues[dim];
  const scoreNames = [...new Set(data.versions.flatMap((v) => Object.keys(v.scores)))].sort();
  const sideLabel = (side: 'A' | 'B', v: string) => (c && c.mode !== 'window' ? `${side} · ${v}` : coreText(v)!);
  const DIM_SHORT = { app: dimShort('app'), agent: dimShort('agent'), prompt: dimShort('prompt'), model: dimShort('model') };

  return (
    <Shell active="agents">
      <div className="crumbs"><a href="/">Agents</a> / <span className="mono">{data.name}</span></div>
      <div className="page-head">
        <div>
          <h1 className="mono" style={{ letterSpacing: '-0.02em' }}>{data.name}</h1>
          <div className="row dim" style={{ marginTop: 6 }}>
            {o?.latestVersion && <span className="chip">{o.latestVersion}</span>}
            {o && <span className="faint">{tr('last run', 'dernier run')} {formatRelativeTime(o.lastSeen, now)}</span>}
          </div>
        </div>
        <div className="row">
          <a className="btn btn-ghost" href={`/runs?agent=${enc}`}>{tr('All runs', 'Tous les runs')}</a>
          <a className="btn btn-ghost" href={`/runs?agent=${enc}&status=error`}>{tr('Failed runs', 'Runs en échec')}</a>
          {data.evals && <a className="btn btn-ghost" href={`/agents/${enc}/evals`}>{tr('Eval suite', 'Suite d’évaluation')} ({data.evals.scenarios} {tr('scenarios', 'scénarios')})</a>}
        </div>
      </div>

      {o && (
        <div className="kpis">
          <Kpi label="Runs · 24 h" value={o.runs24h} sub={tr(`${o.runs7d} over 7 days`, `${o.runs7d} sur 7 jours`)} />
          <Kpi label={tr('Failed · 24 h', 'En échec · 24 h')} value={formatPercent(o.errorRate24h)} />
          <Kpi label={tr('p50 duration · 24 h', 'Durée p50 · 24 h')} value={formatDuration(o.p50DurationMs24h)} />
          <Kpi label={tr('Mean cost · 24 h', 'Coût moyen · 24 h')} value={formatCost(o.avgCostUsd24h)} />
        </div>
      )}

      {/* ---------------- Comparaison ---------------- */}
      <section className="section">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{tr('Is it getting worse?', 'Est-ce que ça se dégrade ?')}</h2>
          <span className="spacer" />
          <nav className="seg" aria-label={tr('Comparison', 'Comparaison')}>
            {data.canCompareVersions && (
              <a href={`/agents/${enc}?dim=${dim}&compare=version`} aria-current={data.mode === 'version' ? 'true' : undefined}>{tr(`Latest ${DIM_SHORT[dim].toLowerCase()} vs previous`, `Dernière ${DIM_SHORT[dim].toLowerCase()} vs précédente`)}</a>
            )}
            {values.length >= 2 && (
              <a href={`/agents/${enc}?dim=${dim}&compare=ab`} aria-current={data.mode === 'ab' ? 'true' : undefined}>{tr('Pick two', 'Choisir deux')}</a>
            )}
            <a href={`/agents/${enc}?dim=${dim}&compare=window`} aria-current={data.mode === 'window' ? 'true' : undefined}>{tr('Last 24 h vs previous 7 days', 'Dernières 24 h vs 7 jours précédents')}</a>
          </nav>
        </div>

        <div className="compare-controls">
          <nav className="row" aria-label={tr('Compare by', 'Comparer par')}>
            <span className="faint" style={{ fontSize: 13 }}>{tr('Compare by', 'Comparer par')}</span>
            {(Object.keys(DIMENSIONS) as Dimension[]).map((d) => {
              const n = data.dimensionValues[d].length;
              const label = `${DIM_SHORT[d]} (${n})`;
              return n >= 2 ? (
                <a key={d} className={d === dim ? 'chip chip-amber dim-chip' : 'chip dim-chip'} aria-current={d === dim ? 'true' : undefined}
                  href={`/agents/${enc}?dim=${d}&compare=${data.mode === 'window' ? 'version' : data.mode}`}>{label}</a>
              ) : (
                <span key={d} className="chip dim-chip is-disabled" title={tr('Needs at least two values', 'Il faut au moins deux valeurs')}>{label}</span>
              );
            })}
          </nav>
          {data.mode === 'ab' && values.length >= 2 && (
            <form className="filters ab-form" method="get" action={`/agents/${enc}`}>
              <input type="hidden" name="dim" value={dim} />
              <input type="hidden" name="compare" value="ab" />
              <label>A <select name="a" defaultValue={data.selected.a ?? ''} aria-label={`${DIM_SHORT[dim]} A (${tr('baseline', 'référence')})`}>
                {values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select></label>
              <span className="faint">vs</span>
              <label>B <select name="b" defaultValue={data.selected.b ?? ''} aria-label={`${DIM_SHORT[dim]} B`}>
                {values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select></label>
              <button className="btn btn-ghost" type="submit">{tr('Compare', 'Comparer')}</button>
            </form>
          )}
        </div>

        {c ? (
          <div className="panel">
            <div className="panel-pad row" style={{ borderBottom: '1px solid var(--border)' }}>
              {c.mode !== 'window' && <span className="faint">{DIM_SHORT[c.dimension ?? 'agent']}</span>}
              <span className="mono">{coreText(c.currentLabel)}</span>
              <span className="faint">({c.currentRuns} runs)</span>
              <span className="faint">vs</span>
              <span className="mono">{coreText(c.baselineLabel)}</span>
              <span className="faint">({c.baselineRuns} runs)</span>
              <span className="spacer" />
              {regressions.length > 0
                ? <span className="chip chip-amber">{regressions.length} {tr('regression', 'régression')}{regressions.length > 1 ? 's' : ''}</span>
                : <span className="chip chip-ok">{tr('no regression', 'aucune régression')}</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{tr('Metric', 'Métrique')}</th><th className="num">{sideLabel('A', c.baselineLabel)}</th><th className="num">{sideLabel('B', c.currentLabel)}</th><th className="num">{tr('Change', 'Écart')}</th><th>Verdict</th></tr>
                </thead>
                <tbody>
                  {c.comparisons.map((x) => (
                    <tr key={x.metric} className={x.verdict === 'regression' ? 'is-regression' : undefined}>
                      <td>
                        {metricName(x.metric)}
                        {x.detail && x.verdict === 'regression' && <div className="faint mono" style={{ fontSize: 11.5, marginTop: 2 }}>{coreText(x.detail)}</div>}
                      </td>
                      <td className="num">{formatMetric(x.metric, x.baseline)}</td>
                      <td className="num">{formatMetric(x.metric, x.current)}</td>
                      <td className="num">{formatDelta(x.metric, x.delta, x.relDelta)}</td>
                      <td><VerdictChip c={x} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-pad faint" style={{ fontSize: 12, borderTop: '1px solid var(--border)' }}>
              {tr(
                'A metric is flagged only when the change is both statistically significant (one-sided test, p < 0.01, Holm-corrected for the number of metrics) and large enough to matter (+15% on a mean, +3 pts on a rate, −0.05 on a score), with at least 20 runs on each side.',
                'Une métrique n’est signalée que si l’écart est à la fois statistiquement significatif (test unilatéral, p < 0,01, corrigé par Holm pour le nombre de métriques) et assez grand pour compter (+15 % sur une moyenne, +3 pts sur un taux, −0,05 sur un score), avec au moins 20 runs de chaque côté.',
              )}
            </div>
          </div>
        ) : <div className="panel empty">{tr('No data to compare yet.', 'Pas encore de données à comparer.')}</div>}
      </section>

      {/* ---------------- Tendances ---------------- */}
      <section className="section">
        <h2>{tr(`Last ${ts.length} days`, `${ts.length} derniers jours`)} {data.markers.length > 0 && <span className="faint" style={{ fontWeight: 400 }}>· {tr('dashed lines mark the first run of each version', 'les pointillés marquent le premier run de chaque version')}</span>}</h2>
        <div className="grid">
          <LineChart title={tr('Failed runs', 'Runs en échec')} series={[{ label: tr('failed runs', 'runs en échec'), color: '#FF6B6B', values: ts.map((p) => p.errorRate) }]} xLabels={xLabels} markers={data.markers} format={(v) => formatPercent(v, 0)} minMax={0.1} />
          <LineChart title={tr('Mean cost per run', 'Coût moyen par run')} series={[{ label: tr('cost', 'coût'), color: '#FFB224', values: ts.map((p) => p.avgCostUsd) }]} xLabels={xLabels} markers={data.markers} format={(v) => formatCost(v)} />
          <LineChart title={tr('Steps and repeated tool calls per run', 'Steps et appels d’outils répétés par run')} subtitle={tr('mean per run', 'moyenne par run')}
            series={[
              { label: 'steps', color: '#7AA2F7', values: ts.map((p) => p.avgSteps) },
              { label: tr('repeated tool calls', 'appels d’outils répétés'), color: '#FFB224', values: ts.map((p) => p.avgRedundantToolCalls) },
            ]}
            xLabels={xLabels} markers={data.markers} format={(v) => formatNumber(v, 1)} />
          <LineChart title={tr('Duration', 'Durée')} subtitle="p50 / p95"
            series={[
              { label: 'p50', color: '#C9CDD3', values: ts.map((p) => p.p50DurationMs) },
              { label: 'p95', color: '#8B929C', values: ts.map((p) => p.p95DurationMs), dashed: true },
            ]}
            xLabels={xLabels} markers={data.markers} format={(v) => formatDuration(v)} />
        </div>
      </section>

      {/* ---------------- Chemins d'outils ---------------- */}
      <section className="section">
        <h2>{tr('Tool paths', 'Chemins d’outils')}</h2>
        <div className="grid">
          {data.paths.map((p) => (
            <div className="panel" key={p.version ?? 'all'}>
              <div className="panel-pad row" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="mono">{p.version ? `${DIM_SHORT[dim]} ${p.version}` : tr('all runs', 'tous les runs')}</span>
                <span className="faint">· {p.total} runs</span>
              </div>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {p.paths.map((x) => (
                      <tr key={x.path}>
                        <td><span className="path" title={x.path}>{x.path}</span></td>
                        <td className="num" style={{ width: 70 }}>{formatPercent(x.share, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Versions ---------------- */}
      <section className="section">
        <h2>{dimPlural(dim)}</h2>
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr><th>{DIM_SHORT[dim]}</th><th>{tr('First run', 'Premier run')}</th><th className="num">Runs</th><th className="num">{tr('Failed', 'En échec')}</th><th className="num">{tr('p50 duration', 'Durée p50')}</th><th className="num">{tr('Mean cost', 'Coût moyen')}</th><th className="num">Steps</th><th className="num">{tr('Repeats', 'Répétitions')}</th>{scoreNames.map((k) => <th key={k} className="num">Score · {k}</th>)}</tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.version ?? 'none'}>
                  <td className="mono"><a href={`/runs?agent=${enc}${v.version ? `&${RUN_FILTER[dim]}=${encodeURIComponent(v.version)}` : ''}`}>{v.version ?? tr('(none)', '(aucune)')}</a></td>
                  <td className="faint">{formatRelativeTime(v.firstSeen, now)}</td>
                  <td className="num">{v.runs}</td>
                  <td className="num">{formatPercent(v.errorRate)}</td>
                  <td className="num">{formatDuration(v.p50DurationMs)}</td>
                  <td className="num">{formatCost(v.avgCostUsd)}</td>
                  <td className="num">{formatNumber(v.avgSteps, 1)}</td>
                  <td className="num">{formatNumber(v.avgRedundantToolCalls, 2)}</td>
                  {scoreNames.map((k) => <td key={k} className="num">{formatScore(v.scores[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Runs récents ---------------- */}
      <section className="section">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{tr('Recent runs', 'Runs récents')}</h2>
          <span className="spacer" />
          <a className="faint" href={`/runs?agent=${enc}&loops=1`}>{tr('Runs with repeated tool calls →', 'Runs avec appels d’outils répétés →')}</a>
        </div>
        <RunsTable runs={data.recentRuns} now={now} showAgent={false} />
      </section>
    </Shell>
  );
}

export function RunsTable({ runs, now, showAgent = true }: { runs: AgentPageData['recentRuns']; now: Date; showAgent?: boolean }) {
  if (runs.length === 0) return <div className="panel empty">{tr('No runs match these filters.', 'Aucun run ne correspond à ces filtres.')}</div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>{showAgent && <th>Agent</th>}<th>Version</th><th>{tr('Status', 'Statut')}</th><th>{tr('Started', 'Début')}</th>
            <th className="num">{tr('Duration', 'Durée')}</th><th className="num">Steps</th><th className="num">{tr('Cost', 'Coût')}</th><th>{tr('Flags', 'Signaux')}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="mono"><a href={`/runs/${r.id}`}>run_{shortId(r.id)}</a></td>
              {showAgent && (
                <td className="mono">
                  {r.agentName}
                  {r.scenario && <div className="faint" style={{ fontSize: 11 }}>eval · {r.scenario}</div>}
                </td>
              )}
              <td className="mono">
                {r.agentVersion ?? '—'}
                {(r.appVersion && r.appVersion !== r.agentVersion) || r.promptVersion ? (
                  <div className="faint" style={{ fontSize: 11 }}>
                    {[r.appVersion && r.appVersion !== r.agentVersion ? `app ${r.appVersion}` : null, r.promptVersion ? `prompt ${r.promptVersion}` : null].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </td>
              <td><RunStatus status={r.status} /></td>
              <td className="faint">{formatRelativeTime(r.startedAt, now)}</td>
              <td className="num">{formatDuration(r.durationMs)}</td>
              <td className="num">{r.stepCount}</td>
              <td className="num">{formatCost(r.costUsd, r.costEstimated)}</td>
              <td>
                <span className="row" style={{ gap: 4 }}>
                  {r.redundantToolCalls > 0 && <span className="chip chip-amber">{tr('repeat', 'répété')} ×{r.redundantToolCalls}</span>}
                  {r.retryCount > 0 && <span className="chip chip-amber">{tr('retry', 'relance')} ×{r.retryCount}</span>}
                  {r.toolErrorCount > 0 && <span className="chip chip-err">{r.toolErrorCount} {tr(`tool error${r.toolErrorCount > 1 ? 's' : ''}`, `erreur${r.toolErrorCount > 1 ? 's' : ''} d’outil`)}</span>}
                  {Object.entries(r.scores ?? {}).filter(([, v]) => v < 1).map(([k, v]) => (
                    <span key={k} className={v < 0.5 ? 'chip chip-err' : 'chip chip-amber'} title={`score ${k}`}>{k} {formatScore(v)}</span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
