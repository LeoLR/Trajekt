import type { DiffRow, TrajectoryStep } from '@trajekt/core';
import type { ComparePageData } from '../server/pages';
import { RunStatus, Shell } from '../components/ui';
import { stepTitle } from '../components/RunTimeline';
import { formatCost, formatDuration, shortId } from '../lib/format';

const MARK_STYLE: Record<DiffRow['mark'], { color: string; label: string }> = {
  '=': { color: 'var(--text-4)', label: 'same' },
  '≠': { color: 'var(--amber)', label: 'changed' },
  '+': { color: 'var(--amber)', label: 'only in B' },
  '−': { color: 'var(--err-text)', label: 'only in A' },
};

function StepCell({ s }: { s?: TrajectoryStep }) {
  if (!s) return <td className="faint">—</td>;
  const err = 'error' in s && s.error ? s.error : undefined;
  return (
    <td>
      <span className="mono" style={{ fontSize: 12.5 }}>
        <span className="faint">#{s.index + 1}</span> {stepTitle(s)}
      </span>
      {err && <span className="chip chip-err" style={{ marginLeft: 8 }}>{err.length > 24 ? err.slice(0, 23) + '…' : err}</span>}
    </td>
  );
}

function pct(a: number | null | undefined, b: number | null | undefined): string {
  if (a == null || b == null || a === 0) return '—';
  const r = (b - a) / a;
  return `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(0)}%`;
}

export function CompareView({ data }: { data: ComparePageData }) {
  const { a, b, diff } = data;
  const A = a.summary;
  const B = b.summary;
  const config: Array<[string, string | null, string | null]> = [
    ['Agent version', A.agentVersion, B.agentVersion],
    ['Prompt version', (a.trajectory.metadata.promptVersion as string | undefined) ?? null, (b.trajectory.metadata.promptVersion as string | undefined) ?? null],
    ['Model', A.primaryModel, B.primaryModel],
  ];
  const changedConfig = config.filter(([, x, y]) => (x ?? '') !== (y ?? ''));
  const reason = {
    explicit: null,
    'previous-version': 'B is compared with the latest successful run of the previous version.',
    'previous-run': 'B is compared with the previous run of the same agent.',
  }[data.baselineReason];

  return (
    <Shell active="runs">
      <div className="crumbs">
        <a href="/">Agents</a> / <a className="mono" href={`/agents/${encodeURIComponent(B.agentName)}`}>{B.agentName}</a> / <a className="mono" href={`/runs/${B.id}`}>run_{shortId(B.id)}</a> / compare
      </div>
      <div className="page-head">
        <div>
          <h1>Compare runs</h1>
          {reason && <p className="dim" style={{ margin: '6px 0 0' }}>{reason}</p>}
        </div>
      </div>

      <div className="grid">
        {([['A', a], ['B', b]] as const).map(([label, r]) => (
          <div className="panel panel-pad" key={label}>
            <div className="row">
              <span className="chip chip-amber">{label}</span>
              <a className="mono" href={`/runs/${r.summary.id}`}>run_{shortId(r.summary.id)}</a>
              <RunStatus status={r.summary.status} />
              {r.summary.agentVersion && <span className="chip">{r.summary.agentVersion}</span>}
            </div>
            <div className="mono dim" style={{ marginTop: 10, fontSize: 13 }}>
              {r.summary.stepCount} steps · {formatDuration(r.summary.durationMs)} · {formatCost(r.summary.costUsd, r.summary.costEstimated)}
            </div>
          </div>
        ))}
      </div>

      <p className="mono" style={{ marginTop: 16, fontSize: 13 }}>
        steps {A.stepCount} → {B.stepCount} · cost {pct(A.costUsd, B.costUsd)} · duration {pct(A.durationMs, B.durationMs)} · outcome {B.status === 'ok' ? 'succeeded' : 'failed'}
      </p>

      <section className="section">
        <h2>What changed between them</h2>
        {changedConfig.length === 0 ? (
          <p className="faint">Same agent version, prompt version and model.</p>
        ) : (
          <div className="panel table-wrap">
            <table>
              <tbody>
                {changedConfig.map(([k, x, y]) => (
                  <tr key={k}><td className="faint" style={{ width: 160 }}>{k}</td><td className="mono">{x ?? '—'}</td><td className="mono" style={{ color: 'var(--amber)' }}>{y ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Step by step</h2>
          <span className="spacer" />
          {(['=', '≠', '+', '−'] as const).map((m) => (
            <span key={m} className="faint mono" style={{ fontSize: 12 }}>
              <span style={{ color: MARK_STYLE[m].color }}>{m}</span> {MARK_STYLE[m].label} ({diff.counts[m]})
            </span>
          ))}
        </div>
        <div className="panel table-wrap">
          <table>
            <thead><tr><th style={{ width: 36 }} /><th>A · run_{shortId(A.id)}</th><th>B · run_{shortId(B.id)}</th></tr></thead>
            <tbody>
              {diff.rows.map((r, i) => (
                <tr key={i} className={r.mark === '=' ? undefined : 'is-regression'}>
                  <td className="mono" style={{ color: MARK_STYLE[r.mark].color, fontWeight: 600, textAlign: 'center' }} aria-label={MARK_STYLE[r.mark].label}>{r.mark}</td>
                  <StepCell s={r.a} />
                  <td>
                    {r.b ? <StepCell.Inner s={r.b} /> : <span className="faint">—</span>}
                    {r.changes && <span className="faint mono" style={{ fontSize: 11.5, marginLeft: 8 }}>{r.changes.join(', ')} changed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>System spans are left out; steps are aligned on the tool called (or LLM call), then compared on arguments and outcome.</p>
      </section>
    </Shell>
  );
}

// Variante sans <td>, pour la colonne B qui ajoute la mention des changements.
StepCell.Inner = function Inner({ s }: { s: TrajectoryStep }) {
  const err = 'error' in s && s.error ? s.error : undefined;
  return (
    <>
      <span className="mono" style={{ fontSize: 12.5 }}><span className="faint">#{s.index + 1}</span> {stepTitle(s)}</span>
      {err && <span className="chip chip-err" style={{ marginLeft: 8 }}>{err.length > 24 ? err.slice(0, 23) + '…' : err}</span>}
    </>
  );
};
