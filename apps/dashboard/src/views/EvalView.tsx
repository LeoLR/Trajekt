import type { ScenarioChange } from '@trajekt/core';
import type { SuitePageData } from '../server/suites';
import { DIMENSIONS, type Dimension } from '../server/queries';
import { Shell, VerdictChip } from '../components/ui';
import { formatDelta, formatMetric, formatRelativeTime } from '../lib/format';

const DIM_SHORT: Record<Dimension, string> = { app: 'App version', agent: 'Agent version', prompt: 'Prompt version', model: 'Model' };

function changeText(c: ScenarioChange): string {
  if (c.metric === 'errorRate' || c.metric === 'newPathShare') return c.detail ? `${c.label} · ${c.detail}` : c.label;
  if (c.relDelta !== null) return `${c.label} ${c.relDelta > 0 ? '+' : '−'}${Math.round(Math.abs(c.relDelta) * 100)}%`;
  return `${c.label} ${formatMetric(c.metric, c.baseline)} → ${formatMetric(c.metric, c.current)}`;
}

function ChangeChip({ c }: { c: ScenarioChange }) {
  const cls = c.direction === 'worse' ? (c.metric === 'errorRate' ? 'chip chip-err' : 'chip chip-amber') : c.direction === 'better' ? 'chip chip-ok' : 'chip';
  return <span className={`${cls} scenario-change`} title={c.metric === 'newPathShare' ? c.detail : undefined}>{c.metric === 'newPathShare' ? c.label : changeText(c)}</span>;
}

const VERDICT_CHIP = {
  regression: <span className="chip chip-amber">worse</span>,
  improvement: <span className="chip chip-ok">better</span>,
  changed: <span className="chip">changed</span>,
  stable: <span className="chip">same</span>,
};

export function EvalView({ data, now: nowIso }: { data: SuitePageData; now: string }) {
  const now = new Date(nowIso);
  const enc = encodeURIComponent(data.agent);
  const dims = (Object.keys(DIMENSIONS) as Dimension[]);
  const c = data.comparison;
  const runsHref = (scenario: string) => `/runs?agent=${enc}&scenario=${encodeURIComponent(scenario)}`;

  return (
    <Shell active="agents">
      <div className="crumbs"><a href="/">Agents</a> / <a className="mono" href={`/agents/${enc}`}>{data.agent}</a> / eval suite</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Eval suite · mocked scenarios</div>
          <h1 className="mono" style={{ letterSpacing: '-0.02em' }}>{data.agent}</h1>
          <p className="dim" style={{ margin: '6px 0 0', maxWidth: 680 }}>
            Runs tagged with a <code className="mono">trajekt.scenario</code>. Each scenario is compared with itself across two versions, so a handful of scenarios is enough to catch a regression before it ships.
          </p>
        </div>
      </div>

      <div className="compare-controls">
        <nav className="row" aria-label="Compare by">
          <span className="faint" style={{ fontSize: 13 }}>Compare by</span>
          {dims.map((d) => (
            <a key={d} className={d === data.dimension ? 'chip chip-amber dim-chip' : 'chip dim-chip'} aria-current={d === data.dimension ? 'true' : undefined}
              href={`/agents/${enc}/evals?dim=${d}`}>{DIM_SHORT[d]}</a>
          ))}
        </nav>
        {data.values.length >= 2 && (
          <form className="filters ab-form" method="get" action={`/agents/${enc}/evals`}>
            <input type="hidden" name="dim" value={data.dimension} />
            <label>A <select name="a" defaultValue={data.a ?? ''} aria-label={`${DIM_SHORT[data.dimension]} A (baseline)`}>
              {data.values.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
            </select></label>
            <span className="faint">vs</span>
            <label>B <select name="b" defaultValue={data.b ?? ''} aria-label={`${DIM_SHORT[data.dimension]} B`}>
              {data.values.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
            </select></label>
            <button className="btn btn-ghost" type="submit">Compare</button>
          </form>
        )}
      </div>

      {!c ? (
        <div className="panel empty">
          {data.values.length < 2
            ? `Only one ${DIM_SHORT[data.dimension].toLowerCase()} has been evaluated so far. Run the suite on another one to compare.`
            : 'Pick two different values to compare.'}
        </div>
      ) : (
        <>
          <div className={c.result === 'fail' ? 'suite-result is-fail' : 'suite-result is-pass'} role="status">
            <div className="row">
              <strong>{c.result === 'fail' ? 'FAIL' : 'PASS'}</strong>
              <span className="mono">{data.b}</span><span className="faint">vs</span><span className="mono">{data.a}</span>
              <span className="faint">· {c.paired} scenarios compared</span>
            </div>
            {c.reasons.length > 0 && (
              <ul>{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            )}
          </div>

          <section className="section">
            <h2>Across the suite</h2>
            <div className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Metric</th><th className="num">A · {data.a}</th><th className="num">B · {data.b}</th><th className="num">Change</th><th>Verdict</th></tr>
                  </thead>
                  <tbody>
                    {c.metrics.map((x) => (
                      <tr key={x.metric} className={x.verdict === 'regression' ? 'is-regression' : undefined}>
                        <td>
                          {x.label}
                          {x.metric === 'newPathShare' && x.detail && <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{x.detail} — shown, never blocking</div>}
                        </td>
                        <td className="num">{x.metric === 'newPathShare' ? '—' : formatMetric(x.metric, x.baseline)}</td>
                        <td className="num">{formatMetric(x.metric, x.current)}</td>
                        <td className="num">{x.metric === 'newPathShare' ? '' : formatDelta(x.metric, x.delta, x.relDelta)}</td>
                        <td><VerdictChip c={x} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel-pad faint" style={{ fontSize: 12, borderTop: '1px solid var(--border)' }}>
                Values are means of the per-scenario averages. Each scenario is paired with itself (Wilcoxon signed-rank test, one-sided, p &lt; 0.05); duration, cost, steps and tokens are compared as ratios, so a large scenario does not outweigh a small one. A metric is flagged only if the typical change is also large enough (+15%, or +5 pts on a rate), with at least 5 scenarios.
              </div>
            </div>
          </section>

          <section className="section">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Scenario by scenario</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12.5 }}>
                {c.scenarios.filter((s) => s.verdict === 'regression').length} worse ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'improvement').length} better ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'changed').length} changed ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'stable').length} same
              </span>
            </div>
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr><th>Scenario</th><th></th><th>What changed</th><th className="num">Runs A / B</th><th></th></tr>
                </thead>
                <tbody>
                  {c.scenarios.map((s) => {
                    const sample = data.sampleRuns[s.scenario] ?? {};
                    return (
                      <tr key={s.scenario} className={s.verdict === 'regression' ? 'is-regression' : undefined}>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}><a href={runsHref(s.scenario)}>{s.scenario}</a></td>
                        <td>{VERDICT_CHIP[s.verdict]}</td>
                        <td>
                          {s.changes.length
                            ? <div className="row" style={{ gap: 6 }}>{s.changes.map((ch) => <ChangeChip key={ch.metric + ch.label} c={ch} />)}</div>
                            : <span className="faint">—</span>}
                        </td>
                        <td className="num mono">{s.baseline.runs} / {s.current.runs}</td>
                        <td>
                          {sample.a && sample.b && (
                            <a className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }} href={`/runs/${sample.b}/compare?with=${sample.a}`}>diff →</a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(c.onlyBaseline.length > 0 || c.onlyCurrent.length > 0) && (
              <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
                {c.onlyBaseline.length > 0 && <>Only in A (not compared): <span className="mono">{c.onlyBaseline.join(', ')}</span>. </>}
                {c.onlyCurrent.length > 0 && <>Only in B (not compared): <span className="mono">{c.onlyCurrent.join(', ')}</span>.</>}
              </p>
            )}
            <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              A scenario is flagged when its failure rate rises by 50 points or more (e.g. 0/3 → 2/3), when duration, cost, steps or tokens grow by 50% or more, when it repeats a tool call it did not repeat before, or when it takes a tool path never seen in A.
            </p>
          </section>
        </>
      )}

      <section className="section">
        <h2>{DIM_SHORT[data.dimension]}s evaluated</h2>
        {data.values.length ? (
          <div className="panel table-wrap">
            <table>
              <thead><tr><th>{DIM_SHORT[data.dimension]}</th><th className="num">Scenarios</th><th className="num">Runs</th><th className="num">Failed</th><th>Last run</th></tr></thead>
              <tbody>
                {data.values.map((v) => (
                  <tr key={v.value}>
                    <td className="mono">{v.value}</td>
                    <td className="num">{v.scenarios}</td>
                    <td className="num">{v.runs}</td>
                    <td className="num">{v.failedRuns}</td>
                    <td className="faint">{formatRelativeTime(v.lastRun, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="panel empty">No eval run carries a {DIM_SHORT[data.dimension].toLowerCase()}.</div>}
      </section>
    </Shell>
  );
}
