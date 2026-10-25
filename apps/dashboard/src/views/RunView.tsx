import type { RunPageData } from '../server/pages';
import { Kpi, RunStatus, Shell } from '../components/ui';
import { RunTimeline } from '../components/RunTimeline';
import { formatCost, formatScore, formatDuration, shortId } from '../lib/format';
import { getLang, tr } from '../lib/i18n';

export function RunView({ data }: { data: RunPageData }) {
  const s = data.summary;
  const enc = encodeURIComponent(s.agentName);
  const repeats = data.annotations.filter((a) => a.repeatOf !== undefined);
  const retries = data.annotations.filter((a) => a.attempt !== undefined).length;
  const failures = data.annotations.filter((a) => a.error);

  const summary: string[] = [];
  const fr = getLang() === 'fr';
  const ids = (xs: Array<{ index: number }>) => xs.map((r) => `#${r.index + 1}`).join(', ');
  if (fr) {
    if (repeats.length) summary.push(`${repeats.length > 1 ? 'Les steps' : 'Le step'} ${ids(repeats)} ${repeats.length > 1 ? 'répètent' : 'répète'} un appel précédent avec les mêmes arguments.`);
    if (retries) summary.push(`${retries} relance${retries > 1 ? 's' : ''} après un échec.`);
    if (failures.length) summary.push(`${failures.length} step${failures.length > 1 ? 's' : ''} en échec (${ids(failures.slice(0, 3))}${failures.length > 3 ? '…' : ''}).`);
  } else if (repeats.length) {
    summary.push(`Step${repeats.length > 1 ? 's' : ''} ${repeats.map((r) => `#${r.index + 1}`).join(', ')} repeat${repeats.length > 1 ? '' : 's'} an earlier call with identical arguments.`);
  }
  if (!fr && retries) summary.push(`${retries} retr${retries > 1 ? 'ies' : 'y'} after a failure.`);
  if (!fr && failures.length) summary.push(`${failures.length} step${failures.length > 1 ? 's' : ''} failed (${failures.slice(0, 3).map((f) => `#${f.index + 1}`).join(', ')}${failures.length > 3 ? '…' : ''}).`);

  return (
    <Shell active="runs">
      <div className="crumbs">
        <a href="/">Agents</a> / <a className="mono" href={`/agents/${enc}`}>{s.agentName}</a> / <span className="mono">run_{shortId(s.id)}</span>
      </div>
      <div className="page-head">
        <div>
          <h1 className="mono" style={{ letterSpacing: '-0.02em' }}>run_{shortId(s.id)}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <RunStatus status={s.status} />
            {s.appVersion && s.appVersion !== s.agentVersion && <span className="chip">app {s.appVersion}</span>}
            {s.agentVersion && <span className="chip">agent {s.agentVersion}</span>}
            {s.promptVersion && <span className="chip">prompt {s.promptVersion}</span>}
            {s.primaryModel && <span className="chip">{s.primaryModel}</span>}
            {s.sourceFormat && <span className="chip">{s.sourceFormat}</span>}
            {s.scenario && <a className="chip chip-amber" href={`/runs?agent=${encodeURIComponent(s.agentName)}&scenario=${encodeURIComponent(s.scenario)}`}>eval · {s.scenario}</a>}
            <span className="faint mono" style={{ fontSize: 12 }}>{new Date(s.startedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
          </div>
        </div>
        <div className="row">
          {data.previousId && <a className="btn btn-ghost" href={`/runs/${data.previousId}`}>{tr('← Previous run', '← Run précédent')}</a>}
          {data.previousId && <a className="btn btn-ghost" href={`/runs/${s.id}/compare`}>{tr('Compare', 'Comparer')}</a>}
          <a className="btn btn-ghost" href={`/api/runs/${s.id}`}>JSON</a>
        </div>
      </div>

      <div className="kpis">
        <Kpi label={tr('Duration', 'Durée')} value={formatDuration(s.durationMs)} />
        <Kpi label={tr('Cost', 'Coût')} value={formatCost(s.costUsd, s.costEstimated)} sub={s.costEstimated ? tr('estimated from tokens', 'estimé à partir des tokens') : undefined} />
        <Kpi label="Steps" value={s.stepCount} sub={tr(`${s.toolCallCount} tool calls`, `${s.toolCallCount} appels d’outils`)} />
        <Kpi label={tr('Repeated tool calls', 'Appels d’outils répétés')} value={s.redundantToolCalls} />
        <Kpi label={tr('Retries', 'Relances')} value={s.retryCount} />
        {Object.entries(s.scores).map(([name, v]) => (
          <Kpi key={name} label={`Score · ${name}`} value={<span style={{ color: v < 0.5 ? 'var(--err-text)' : undefined }}>{formatScore(v)}</span>} />
        ))}
      </div>

      {summary.length > 0 && (
        <p className="dim" style={{ marginTop: 16 }}>{summary.join(' ')}</p>
      )}

      <div className="section">
        <RunTimeline
          trajectory={data.trajectory}
          annotations={data.annotations}
          lang={getLang()}
          header={{ left: `run_${shortId(s.id)} · ${s.agentName}`, right: `${formatDuration(s.durationMs)} · ${formatCost(s.costUsd, s.costEstimated)}` }}
        />
      </div>

      <p className="faint mono" style={{ fontSize: 12, marginTop: 16 }}>{tr('tool path:', 'chemin d’outils :')} {s.pathSignature}</p>
    </Shell>
  );
}
