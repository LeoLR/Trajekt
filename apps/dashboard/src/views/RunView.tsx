import type { RunPageData } from '../server/pages';
import { Kpi, RunStatus, Shell } from '../components/ui';
import { RunTimeline } from '../components/RunTimeline';
import { formatCost, formatDuration, shortId } from '../lib/format';

export function RunView({ data }: { data: RunPageData }) {
  const s = data.summary;
  const enc = encodeURIComponent(s.agentName);
  const repeats = data.annotations.filter((a) => a.repeatOf !== undefined);
  const retries = data.annotations.filter((a) => a.attempt !== undefined).length;
  const failures = data.annotations.filter((a) => a.error);

  const summary: string[] = [];
  if (repeats.length) {
    summary.push(`Step${repeats.length > 1 ? 's' : ''} ${repeats.map((r) => `#${r.index + 1}`).join(', ')} repeat${repeats.length > 1 ? '' : 's'} an earlier call with identical arguments.`);
  }
  if (retries) summary.push(`${retries} retr${retries > 1 ? 'ies' : 'y'} after a failure.`);
  if (failures.length) summary.push(`${failures.length} step${failures.length > 1 ? 's' : ''} failed (${failures.slice(0, 3).map((f) => `#${f.index + 1}`).join(', ')}${failures.length > 3 ? '…' : ''}).`);

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
            <span className="faint mono" style={{ fontSize: 12 }}>{new Date(s.startedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
          </div>
        </div>
        <div className="row">
          {data.previousId && <a className="btn btn-ghost" href={`/runs/${data.previousId}`}>← Previous run</a>}
          {data.previousId && <a className="btn btn-ghost" href={`/runs/${s.id}/compare`}>Compare</a>}
          <a className="btn btn-ghost" href={`/api/runs/${s.id}`}>JSON</a>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Duration" value={formatDuration(s.durationMs)} />
        <Kpi label="Cost" value={formatCost(s.costUsd, s.costEstimated)} sub={s.costEstimated ? 'estimated from tokens' : undefined} />
        <Kpi label="Steps" value={s.stepCount} sub={`${s.toolCallCount} tool calls`} />
        <Kpi label="Repeated tool calls" value={s.redundantToolCalls} />
        <Kpi label="Retries" value={s.retryCount} />
      </div>

      {summary.length > 0 && (
        <p className="dim" style={{ marginTop: 16 }}>{summary.join(' ')}</p>
      )}

      <div className="section">
        <RunTimeline
          trajectory={data.trajectory}
          annotations={data.annotations}
          header={{ left: `run_${shortId(s.id)} · ${s.agentName}`, right: `${formatDuration(s.durationMs)} · ${formatCost(s.costUsd, s.costEstimated)}` }}
        />
      </div>

      <p className="faint mono" style={{ fontSize: 12, marginTop: 16 }}>tool path: {s.pathSignature}</p>
    </Shell>
  );
}
