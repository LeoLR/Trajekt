import type { ScenarioChange } from '@trajekt-ai/core';
import type { SuitePageData } from '../server/suites';
import { DIMENSIONS, type Dimension } from '../server/queries';
import { Shell, VerdictChip } from '../components/ui';
import { formatDelta, formatMetric } from '../lib/format';
import { coreLabel, coreText, dimPlural, dimShort, getLang, relativeTime as formatRelativeTime, tr } from '../lib/i18n';


function changeText(c: ScenarioChange): string {
  const label = coreLabel(c.label);
  if (c.metric === 'errorRate' || c.metric === 'newPathShare') return c.detail ? `${label} · ${coreText(c.detail)}` : label;
  if (c.relDelta !== null) return `${label} ${c.relDelta > 0 ? '+' : '−'}${Math.round(Math.abs(c.relDelta) * 100)}%`;
  return `${label} ${formatMetric(c.metric, c.baseline)} → ${formatMetric(c.metric, c.current)}`;
}

function ChangeChip({ c }: { c: ScenarioChange }) {
  const cls = c.direction === 'worse' ? (c.metric === 'errorRate' || c.metric.startsWith('score:') ? 'chip chip-err' : 'chip chip-amber') : c.direction === 'better' ? 'chip chip-ok' : 'chip';
  return <span className={`${cls} scenario-change`} title={c.metric === 'newPathShare' ? coreText(c.detail) : undefined}>{c.metric === 'newPathShare' ? coreLabel(c.label) : changeText(c)}</span>;
}

const VERDICT_CHIP = () => ({
  regression: <span className="chip chip-amber">{tr('worse', 'pire')}</span>,
  improvement: <span className="chip chip-ok">{tr('better', 'mieux')}</span>,
  changed: <span className="chip">{tr('changed', 'modifié')}</span>,
  stable: <span className="chip">{tr('same', 'identique')}</span>,
});

export function EvalView({ data, now: nowIso }: { data: SuitePageData; now: string }) {
  const now = new Date(nowIso);
  const DIM_SHORT = { app: dimShort('app'), agent: dimShort('agent'), prompt: dimShort('prompt'), model: dimShort('model') };
  const VERDICTS = VERDICT_CHIP();
  const fr = getLang() === 'fr';
  const enc = encodeURIComponent(data.agent);
  const dims = (Object.keys(DIMENSIONS) as Dimension[]);
  const c = data.comparison;
  const runsHref = (scenario: string) => `/runs?agent=${enc}&scenario=${encodeURIComponent(scenario)}`;

  return (
    <Shell active="agents">
      <div className="crumbs"><a href="/">Agents</a> / <a className="mono" href={`/agents/${enc}`}>{data.agent}</a> / {tr('eval suite', 'suite d’évaluation')}</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{tr('Eval suite · mocked scenarios', 'Suite d’évaluation · scénarios mockés')}</div>
          <h1 className="mono" style={{ letterSpacing: '-0.02em' }}>{data.agent}</h1>
          <p className="dim" style={{ margin: '6px 0 0', maxWidth: 680 }}>
            {fr
              ? <>Runs marqués d’un <code className="mono">trajekt.scenario</code>. Chaque scénario est comparé à lui-même entre deux versions : quelques scénarios suffisent pour repérer une régression avant la mise en production.</>
              : <>Runs tagged with a <code className="mono">trajekt.scenario</code>. Each scenario is compared with itself across two versions, so a handful of scenarios is enough to catch a regression before it ships.</>}
          </p>
        </div>
      </div>

      <div className="compare-controls">
        <nav className="row" aria-label={tr('Compare by', 'Comparer par')}>
          <span className="faint" style={{ fontSize: 13 }}>{tr('Compare by', 'Comparer par')}</span>
          {dims.map((d) => (
            <a key={d} className={d === data.dimension ? 'chip chip-amber dim-chip' : 'chip dim-chip'} aria-current={d === data.dimension ? 'true' : undefined}
              href={`/agents/${enc}/evals?dim=${d}`}>{DIM_SHORT[d]}</a>
          ))}
        </nav>
        {data.values.length >= 2 && (
          <form className="filters ab-form" method="get" action={`/agents/${enc}/evals`}>
            <input type="hidden" name="dim" value={data.dimension} />
            <label>A <select name="a" defaultValue={data.a ?? ''} aria-label={`${DIM_SHORT[data.dimension]} A (${tr('baseline', 'référence')})`}>
              {data.values.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
            </select></label>
            <span className="faint">vs</span>
            <label>B <select name="b" defaultValue={data.b ?? ''} aria-label={`${DIM_SHORT[data.dimension]} B`}>
              {data.values.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
            </select></label>
            <button className="btn btn-ghost" type="submit">{tr('Compare', 'Comparer')}</button>
          </form>
        )}
      </div>

      {!c ? (
        <div className="panel empty">
          {data.values.length < 2
            ? tr(`Only one ${DIM_SHORT[data.dimension].toLowerCase()} has been evaluated so far. Run the suite on another one to compare.`, `Une seule ${DIM_SHORT[data.dimension].toLowerCase()} a été évaluée pour l’instant. Lancez la suite sur une autre pour comparer.`)
            : tr('Pick two different values to compare.', 'Choisissez deux valeurs différentes à comparer.')}
        </div>
      ) : (
        <>
          <div className={c.result === 'fail' ? 'suite-result is-fail' : 'suite-result is-pass'} role="status">
            <div className="row">
              <strong>{c.result === 'fail' ? 'FAIL' : 'PASS'}</strong>
              <span className="mono">{data.b}</span><span className="faint">vs</span><span className="mono">{data.a}</span>
              <span className="faint">· {c.paired} {tr('scenarios compared', 'scénarios comparés')}</span>
            </div>
            {c.reasons.length > 0 && (
              <ul>{c.reasons.map((r) => <li key={r}>{coreText(r)}</li>)}</ul>
            )}
          </div>

          <section className="section">
            <h2>{tr('Across the suite', 'Sur l’ensemble de la suite')}</h2>
            <div className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>{tr('Metric', 'Métrique')}</th><th className="num">A · {data.a}</th><th className="num">B · {data.b}</th><th className="num">{tr('Change', 'Écart')}</th><th>Verdict</th></tr>
                  </thead>
                  <tbody>
                    {c.metrics.map((x) => (
                      <tr key={x.metric} className={x.verdict === 'regression' ? 'is-regression' : undefined}>
                        <td>
                          {coreLabel(x.label)}
                          {x.metric === 'newPathShare' && x.detail && <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{coreText(x.detail)} — {tr('shown, never blocking', 'affiché, jamais bloquant')}</div>}
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
                {tr(
                  'Values are means of the per-scenario averages. Each scenario is paired with itself (Wilcoxon signed-rank test, one-sided, p < 0.05); duration, cost, steps and tokens are compared as ratios, so a large scenario does not outweigh a small one. Scores (higher is better) come first. A metric is flagged only if it stays significant after correcting for the number of metrics tested (Holm) and the typical change is large enough (+15%, +5 pts on a rate, −0.05 on a score), with at least 8 scenarios.',
                  'Les valeurs sont les moyennes des moyennes par scénario. Chaque scénario est apparié à lui-même (test de Wilcoxon signé, unilatéral, p < 0,05) ; durée, coût, steps et tokens sont comparés en ratios, pour qu’un gros scénario ne pèse pas plus qu’un petit. Les scores (plus c’est haut, mieux c’est) passent en premier. Une métrique n’est signalée que si elle reste significative après correction pour le nombre de métriques testées (Holm) et si l’écart typique est assez grand (+15 %, +5 pts sur un taux, −0,05 sur un score), avec au moins 8 scénarios.',
                )}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{tr('Scenario by scenario', 'Scénario par scénario')}</h2>
              <span className="spacer" />
              <span className="faint" style={{ fontSize: 12.5 }}>
                {c.scenarios.filter((s) => s.verdict === 'regression').length} {tr('worse', 'pires')} ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'improvement').length} {tr('better', 'meilleurs')} ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'changed').length} {tr('changed', 'modifiés')} ·{' '}
                {c.scenarios.filter((s) => s.verdict === 'stable').length} {tr('same', 'identiques')}
              </span>
            </div>
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr><th>{tr('Scenario', 'Scénario')}</th><th></th><th>{tr('What changed', 'Ce qui a changé')}</th><th className="num">Runs A / B</th><th></th></tr>
                </thead>
                <tbody>
                  {c.scenarios.map((s) => {
                    const sample = data.sampleRuns[s.scenario] ?? {};
                    return (
                      <tr key={s.scenario} className={s.verdict === 'regression' ? 'is-regression' : undefined}>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}><a href={runsHref(s.scenario)}>{s.scenario}</a></td>
                        <td>{VERDICTS[s.verdict]}</td>
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
                {c.onlyBaseline.length > 0 && <>{tr('Only in A (not compared):', 'Seulement dans A (non comparés) :')} <span className="mono">{c.onlyBaseline.join(', ')}</span>. </>}
                {c.onlyCurrent.length > 0 && <>{tr('Only in B (not compared):', 'Seulement dans B (non comparés) :')} <span className="mono">{c.onlyCurrent.join(', ')}</span>.</>}
              </p>
            )}
            <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {tr(
                'A scenario is flagged when its failure rate rises by 50 points or more (e.g. 0/3 → 2/3), when a score drops by 0.25 or more, when duration, cost, steps or tokens grow by 50% or more, when it repeats a tool call it did not repeat before, or when it takes a tool path never seen in A.',
                'Un scénario est signalé quand son taux d’échec monte de 50 points ou plus (par ex. 0/3 → 2/3), quand un score baisse de 0,25 ou plus, quand la durée, le coût, les steps ou les tokens augmentent de 50 % ou plus, quand il répète un appel d’outil qu’il ne répétait pas, ou quand il prend un chemin d’outils jamais vu dans A.',
              )}
            </p>
          </section>
        </>
      )}

      <section className="section">
        <h2>{tr(`${dimPlural(data.dimension)} evaluated`, `${dimPlural(data.dimension)} évalué${data.dimension === 'model' ? 's' : 'es'}`)}</h2>
        {data.values.length ? (
          <div className="panel table-wrap">
            <table>
              <thead><tr><th>{DIM_SHORT[data.dimension]}</th><th className="num">{tr('Scenarios', 'Scénarios')}</th><th className="num">Runs</th><th className="num">{tr('Failed', 'En échec')}</th><th>{tr('Last run', 'Dernier run')}</th></tr></thead>
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
        ) : <div className="panel empty">{tr(`No eval run carries a ${DIM_SHORT[data.dimension].toLowerCase()}.`, `Aucun run d’évaluation ne porte de ${DIM_SHORT[data.dimension].toLowerCase()}.`)}</div>}
      </section>
    </Shell>
  );
}
