import { METRIC_LABELS } from '@trajekt/core';
import type { AgentPageData } from '../server/pages';
import { DIMENSIONS, type Dimension } from '../server/queries';
import { Kpi, RunStatus, Shell, VerdictChip } from '../components/ui';
import { LineChart } from '../components/charts';
import {
  formatCost, formatDelta, formatDuration, formatMetric, formatNumber, formatPercent, formatRelativeTime, shortId,
} from '../lib/format';

/** Paramètre de /runs qui filtre sur une dimension. */
const RUN_FILTER: Record<Dimension, string> = { app: 'appVersion', agent: 'version', prompt: 'promptVersion', model: 'model' };
const DIM_SHORT: Record<Dimension, string> = { app: 'App version', agent: 'Agent version', prompt: 'Prompt version', model: 'Model' };
const DIM_PLURAL: Record<Dimension, string> = { app: 'App versions', agent: 'Agent versions', prompt: 'Prompt versions', model: 'Models' };

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
  const sideLabel = (side: 'A' | 'B', v: string) => (c && c.mode !== 'window' ? `${side} · ${v}` : v);

  return (
    <Shell active="agents">
      <div className="crumbs"><a href="/">Agents</a> / <span className="mono">{data.name}</span></div>
      <div className="page-head">
        <div>
          <h1 className="mono" style={{ letterSpacing: '-0.02em' }}>{data.name}</h1>
          <div className="row dim" style={{ marginTop: 6 }}>
            {o?.latestVersion && <span className="chip">{o.latestVersion}</span>}
            {o && <span className="faint">last run {formatRelativeTime(o.lastSeen, now)}</span>}
          </div>
        </div>
        <div className="row">
          <a className="btn btn-ghost" href={`/runs?agent=${enc}`}>All runs</a>
          <a className="btn btn-ghost" href={`/runs?agent=${enc}&status=error`}>Failed runs</a>
          {data.evals && <a className="btn btn-ghost" href={`/agents/${enc}/evals`}>Eval suite ({data.evals.scenarios} scenarios)</a>}
        </div>
      </div>

      {o && (
        <div className="kpis">
          <Kpi label="Runs · 24 h" value={o.runs24h} sub={`${o.runs7d} over 7 days`} />
          <Kpi label="Failed · 24 h" value={formatPercent(o.errorRate24h)} />
          <Kpi label="p50 duration · 24 h" value={formatDuration(o.p50DurationMs24h)} />
          <Kpi label="Mean cost · 24 h" value={formatCost(o.avgCostUsd24h)} />
        </div>
      )}

      {/* ---------------- Comparaison ---------------- */}
      <section className="section">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Is it getting worse?</h2>
          <span className="spacer" />
          <nav className="seg" aria-label="Comparison">
            {data.canCompareVersions && (
              <a href={`/agents/${enc}?dim=${dim}&compare=version`} aria-current={data.mode === 'version' ? 'true' : undefined}>Latest {DIM_SHORT[dim].toLowerCase()} vs previous</a>
            )}
            {values.length >= 2 && (
              <a href={`/agents/${enc}?dim=${dim}&compare=ab`} aria-current={data.mode === 'ab' ? 'true' : undefined}>Pick two</a>
            )}
            <a href={`/agents/${enc}?dim=${dim}&compare=window`} aria-current={data.mode === 'window' ? 'true' : undefined}>Last 24 h vs previous 7 days</a>
          </nav>
        </div>

        <div className="compare-controls">
          <nav className="row" aria-label="Compare by">
            <span className="faint" style={{ fontSize: 13 }}>Compare by</span>
            {(Object.keys(DIMENSIONS) as Dimension[]).map((d) => {
              const n = data.dimensionValues[d].length;
              const label = `${DIM_SHORT[d]} (${n})`;
              return n >= 2 ? (
                <a key={d} className={d === dim ? 'chip chip-amber dim-chip' : 'chip dim-chip'} aria-current={d === dim ? 'true' : undefined}
                  href={`/agents/${enc}?dim=${d}&compare=${data.mode === 'window' ? 'version' : data.mode}`}>{label}</a>
              ) : (
                <span key={d} className="chip dim-chip is-disabled" title="Needs at least two values">{label}</span>
              );
            })}
          </nav>
          {data.mode === 'ab' && values.length >= 2 && (
            <form className="filters ab-form" method="get" action={`/agents/${enc}`}>
              <input type="hidden" name="dim" value={dim} />
              <input type="hidden" name="compare" value="ab" />
              <label>A <select name="a" defaultValue={data.selected.a ?? ''} aria-label={`${DIM_SHORT[dim]} A (baseline)`}>
                {values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select></label>
              <span className="faint">vs</span>
              <label>B <select name="b" defaultValue={data.selected.b ?? ''} aria-label={`${DIM_SHORT[dim]} B`}>
                {values.map((v) => <option key={v} value={v}>{v}</option>)}
              </select></label>
              <button className="btn btn-ghost" type="submit">Compare</button>
            </form>
          )}
        </div>

        {c ? (
          <div className="panel">
            <div className="panel-pad row" style={{ borderBottom: '1px solid var(--border)' }}>
              {c.mode !== 'window' && <span className="faint">{DIM_SHORT[c.dimension ?? 'agent']}</span>}
              <span className="mono">{c.currentLabel}</span>
              <span className="faint">({c.currentRuns} runs)</span>
              <span className="faint">vs</span>
              <span className="mono">{c.baselineLabel}</span>
              <span className="faint">({c.baselineRuns} runs)</span>
              <span className="spacer" />
              {regressions.length > 0
                ? <span className="chip chip-amber">{regressions.length} regression{regressions.length > 1 ? 's' : ''}</span>
                : <span className="chip chip-ok">no regression</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Metric</th><th className="num">{sideLabel('A', c.baselineLabel)}</th><th className="num">{sideLabel('B', c.currentLabel)}</th><th className="num">Change</th><th>Verdict</th></tr>
                </thead>
                <tbody>
                  {c.comparisons.map((x) => (
                    <tr key={x.metric} className={x.verdict === 'regression' ? 'is-regression' : undefined}>
                      <td>
                        {METRIC_LABELS[x.metric]}
                        {x.detail && x.verdict === 'regression' && <div className="faint mono" style={{ fontSize: 11.5, marginTop: 2 }}>{x.detail}</div>}
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
              A metric is flagged only when the change is both statistically significant (one-sided test, p &lt; 0.01) and large enough to matter (+15% on a mean, +3 pts on a rate), with at least 20 runs on each side.
            </div>
          </div>
        ) : <div className="panel empty">No data to compare yet.</div>}
      </section>

      {/* ---------------- Tendances ---------------- */}
      <section className="section">
        <h2>Last {ts.length} days {data.markers.length > 0 && <span className="faint" style={{ fontWeight: 400 }}>· dashed lines mark the first run of each version</span>}</h2>
        <div className="grid">
          <LineChart title="Failed runs" series={[{ label: 'failed runs', color: '#FF6B6B', values: ts.map((p) => p.errorRate) }]} xLabels={xLabels} markers={data.markers} format={(v) => formatPercent(v, 0)} minMax={0.1} />
          <LineChart title="Mean cost per run" series={[{ label: 'cost', color: '#FFB224', values: ts.map((p) => p.avgCostUsd) }]} xLabels={xLabels} markers={data.markers} format={(v) => formatCost(v)} />
          <LineChart title="Steps and repeated tool calls per run" subtitle="mean per run"
            series={[
              { label: 'steps', color: '#7AA2F7', values: ts.map((p) => p.avgSteps) },
              { label: 'repeated tool calls', color: '#FFB224', values: ts.map((p) => p.avgRedundantToolCalls) },
            ]}
            xLabels={xLabels} markers={data.markers} format={(v) => formatNumber(v, 1)} />
          <LineChart title="Duration" subtitle="p50 / p95"
            series={[
              { label: 'p50', color: '#C9CDD3', values: ts.map((p) => p.p50DurationMs) },
              { label: 'p95', color: '#8B929C', values: ts.map((p) => p.p95DurationMs), dashed: true },
            ]}
            xLabels={xLabels} markers={data.markers} format={(v) => formatDuration(v)} />
        </div>
      </section>

      {/* ---------------- Chemins d'outils ---------------- */}
      <section className="section">
        <h2>Tool paths</h2>
        <div className="grid">
          {data.paths.map((p) => (
            <div className="panel" key={p.version ?? 'all'}>
              <div className="panel-pad row" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="mono">{p.version ? `${DIM_SHORT[dim]} ${p.version}` : 'all runs'}</span>
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
        <h2>{DIM_PLURAL[dim]}</h2>
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr><th>{DIM_SHORT[dim]}</th><th>First run</th><th className="num">Runs</th><th className="num">Failed</th><th className="num">p50 duration</th><th className="num">Mean cost</th><th className="num">Steps</th><th className="num">Repeats</th></tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.version ?? 'none'}>
                  <td className="mono"><a href={`/runs?agent=${enc}${v.version ? `&${RUN_FILTER[dim]}=${encodeURIComponent(v.version)}` : ''}`}>{v.version ?? '(none)'}</a></td>
                  <td className="faint">{formatRelativeTime(v.firstSeen, now)}</td>
                  <td className="num">{v.runs}</td>
                  <td className="num">{formatPercent(v.errorRate)}</td>
                  <td className="num">{formatDuration(v.p50DurationMs)}</td>
                  <td className="num">{formatCost(v.avgCostUsd)}</td>
                  <td className="num">{formatNumber(v.avgSteps, 1)}</td>
                  <td className="num">{formatNumber(v.avgRedundantToolCalls, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Runs récents ---------------- */}
      <section className="section">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Recent runs</h2>
          <span className="spacer" />
          <a className="faint" href={`/runs?agent=${enc}&loops=1`}>Runs with repeated tool calls →</a>
        </div>
        <RunsTable runs={data.recentRuns} now={now} showAgent={false} />
      </section>
    </Shell>
  );
}

export function RunsTable({ runs, now, showAgent = true }: { runs: AgentPageData['recentRuns']; now: Date; showAgent?: boolean }) {
  if (runs.length === 0) return <div className="panel empty">No runs match these filters.</div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>{showAgent && <th>Agent</th>}<th>Version</th><th>Status</th><th>Started</th>
            <th className="num">Duration</th><th className="num">Steps</th><th className="num">Cost</th><th>Flags</th>
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
                  {r.redundantToolCalls > 0 && <span className="chip chip-amber">repeat ×{r.redundantToolCalls}</span>}
                  {r.retryCount > 0 && <span className="chip chip-amber">retry ×{r.retryCount}</span>}
                  {r.toolErrorCount > 0 && <span className="chip chip-err">{r.toolErrorCount} tool error{r.toolErrorCount > 1 ? 's' : ''}</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
