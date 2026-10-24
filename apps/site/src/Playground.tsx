import { useCallback, useMemo, useRef, useState } from 'react';
import {
  annotateSteps,
  computeMetrics,
  normalizeAll,
  type StepAnnotation,
  type Trajectory,
  type TrajectoryStep,
} from '@trajekt/core';
import otlpSample from '../../../docs/assets/samples/otlp-sentry-triage.json';
import langfuseSample from '../../../docs/assets/samples/langfuse-support-bot.json';
import aiSdkSample from '../../../docs/assets/samples/ai-sdk-trip-planner.json';

/**
 * "Try it" : la vraie bibliothèque @trajekt/core, dans le navigateur.
 * Un fichier déposé n'est jamais envoyé nulle part.
 */

const SAMPLES = [
  { id: 'otlp', label: 'OpenTelemetry', agent: 'sentry-triage', file: 'otlp-sentry-triage.json', data: otlpSample },
  { id: 'langfuse', label: 'Langfuse', agent: 'support-bot', file: 'langfuse-support-bot.json', data: langfuseSample },
  { id: 'ai-sdk', label: 'Vercel AI SDK', agent: 'trip-planner', file: 'ai-sdk-trip-planner.json', data: aiSdkSample },
] as const;

const MAX_BYTES = 5 * 1024 * 1024;

interface Loaded {
  source: string;
  runs: Trajectory[];
}

function load(raw: unknown, source: string, agent?: string): Loaded {
  // Un résultat AI SDK ne porte pas de nom d'agent : on affiche celui de l'exemple.
  const runs = normalizeAll(raw).map((r) =>
    agent && !r.metadata.agentName ? { ...r, metadata: { ...r.metadata, agentName: agent } } : r,
  );
  if (runs.length === 0) throw new Error('No trace found in this file.');
  return { source, runs };
}

/* ------------------------------------------------------------------ */
/* Mise en forme                                                        */
/* ------------------------------------------------------------------ */

function dur(ms: number | undefined | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

function cost(usd: number | null, estimated: boolean): string {
  if (usd == null) return '—';
  const v = usd < 0.001 ? `$${usd.toFixed(5)}` : usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  return estimated ? `≈${v}` : v;
}

function title(s: TrajectoryStep): string {
  switch (s.type) {
    case 'llm_call': return s.model ?? 'llm call';
    case 'tool_call': return s.name;
    case 'custom': return s.kind;
    case 'decision': return s.branch;
    default: return s.type.replace('_', ' ');
  }
}

const TYPE_COLOR: Record<TrajectoryStep['type'], string> = {
  llm_call: 'var(--t-llm)',
  tool_call: 'var(--t-tool)',
  custom: 'var(--t-system)',
  user_message: 'var(--text-3)',
  agent_message: 'var(--text-3)',
  decision: 'var(--text-3)',
};

const TYPE_LABEL: Record<TrajectoryStep['type'], string> = {
  llm_call: 'LLM call',
  tool_call: 'Tool call',
  custom: 'System',
  user_message: 'User message',
  agent_message: 'Agent message',
  decision: 'Decision',
};

function flags(a: StepAnnotation): Array<{ text: string; tone: 'amber' | 'red' }> {
  const out: Array<{ text: string; tone: 'amber' | 'red' }> = [];
  if (a.repeatOf !== undefined) out.push({ text: `REPEAT #${a.repeatOf + 1}`, tone: 'amber' });
  if (a.attempt !== undefined) out.push({ text: `ATTEMPT ${a.attempt}`, tone: 'amber' });
  if (a.error) out.push({ text: a.error.length > 26 ? a.error.slice(0, 25) + '…' : a.error, tone: 'red' });
  return out;
}

function pretty(v: unknown): string {
  if (v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  return s.length > 3000 ? s.slice(0, 3000) + '\n…' : s;
}

/* ------------------------------------------------------------------ */
/* Composant                                                            */
/* ------------------------------------------------------------------ */

export function Playground() {
  const [loaded, setLoaded] = useState<Loaded>(() => load(SAMPLES[0].data, SAMPLES[0].id, SAMPLES[0].agent));
  const [runIndex, setRunIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = loaded.runs[runIndex] ?? loaded.runs[0];
  const metrics = useMemo(() => computeMetrics(run), [run]);
  const annotations = useMemo(() => annotateSteps(run), [run]);

  // Placement temporel des steps (ou une case par step sans horodatage).
  const placed = useMemo(() => {
    const ts = run.steps.map((s) => (s.timestamp ? Date.parse(s.timestamp) : NaN));
    const timed = ts.some(Number.isFinite);
    if (!timed) return { timed, total: run.steps.length || 1, rows: run.steps.map((_, i) => ({ start: i, dur: 0.9 })) };
    const t0 = Math.min(...ts.filter(Number.isFinite));
    let end = t0;
    const rows = run.steps.map((s, i) => {
      const start = Number.isFinite(ts[i]) ? ts[i] - t0 : 0;
      end = Math.max(end, t0 + start + (s.durationMs ?? 0));
      return { start, dur: s.durationMs ?? 0 };
    });
    return { timed, total: Math.max(end - t0, 1), rows };
  }, [run]);

  // Par défaut : le premier step réellement en cause (pas le span racine).
  const defaultIndex = useMemo(() => {
    const flagged = annotations.findIndex((a, i) => run.steps[i].type !== 'custom' && flags(a).length > 0);
    return flagged >= 0 ? flagged : 0;
  }, [annotations, run]);
  const active = selected ?? defaultIndex;
  const step = run.steps[active];

  const show = useCallback((next: Loaded) => {
    setLoaded(next);
    setRunIndex(0);
    setSelected(null);
    setError(null);
  }, []);

  const readFile = useCallback((file: File) => {
    if (file.size > MAX_BYTES) {
      setError('This file is larger than 5 MB. Try a single trace.');
      return;
    }
    file.text().then((text) => {
      try {
        show(load(JSON.parse(text), file.name));
      } catch (e) {
        setError(e instanceof SyntaxError ? 'This file is not valid JSON.' : e instanceof Error ? e.message : 'Could not read this file.');
      }
    });
  }, [show]);

  const repeats = annotations.filter((a) => a.repeatOf !== undefined);
  const findings: string[] = [];
  if (repeats.length) findings.push(`${repeats.map((r) => `#${r.index + 1}`).join(' and ')} repeat${repeats.length > 1 ? '' : 's'} an earlier call with identical arguments.`);
  if (metrics.retryCount) findings.push(`${metrics.retryCount} retr${metrics.retryCount > 1 ? 'ies' : 'y'} after a failure.`);
  if (metrics.status === 'error') findings.push('The run failed.');
  if (!findings.length) findings.push('No repeated call, no retry, no failure in this run.');

  return (
    <div
      className={`playground${drag ? ' is-drag' : ''}`}
      onDragOver={(e: { preventDefault(): void }) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e: { preventDefault(): void; dataTransfer: DataTransfer }) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) readFile(f);
      }}
    >
      <div className="pg-toolbar">
        <div className="pg-samples" role="group" aria-label="Example traces">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className="pg-sample" aria-pressed={loaded.source === s.id}
              onClick={() => show(load(s.data, s.id, s.agent))}>
              <span className="mono">{s.label}</span>
              <span className="pg-sample-agent mono">{s.agent}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-outline pg-open" onClick={() => inputRef.current?.click()}>
          Open your trace…
        </button>
        <input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e: { target: HTMLInputElement }) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
      </div>
      <p className="pg-hint">
        Langfuse trace export, OTLP/JSON or a Vercel AI SDK result — drop it anywhere on this panel. It is read in your browser by <code className="mono">@trajekt/core</code>; nothing is uploaded.
      </p>

      {error && <div className="pg-error" role="alert">{error}</div>}

      {loaded.runs.length > 1 && (
        <div className="pg-runs">
          <span className="muted">{loaded.runs.length} traces in this file:</span>
          {loaded.runs.slice(0, 12).map((r, i) => (
            <button key={r.id + i} type="button" className="pg-run" aria-pressed={i === runIndex} onClick={() => { setRunIndex(i); setSelected(null); }}>
              {(r.metadata.traceId ?? r.id).slice(0, 8)}
            </button>
          ))}
        </div>
      )}

      <div className="pg-panel">
        <div className="recorder-bar">
          <span>AGENT FLIGHT RECORDER · REPLAY</span>
          <span className={`pg-status ${metrics.status === 'ok' ? 'is-ok' : 'is-err'}`}>{metrics.status === 'ok' ? 'OK' : 'FAILED'}</span>
        </div>
        <div className="pg-head mono">
          <span>{run.metadata.agentName ?? 'unknown agent'} · {run.metadata.sourceFormat}{run.metadata.agentVersion ? ` · ${run.metadata.agentVersion}` : ''}</span>
          <span>{dur(metrics.durationMs)} · {cost(metrics.costUsd, metrics.costEstimated)}</span>
        </div>
        <dl className="pg-metrics">
          <div><dt>Steps</dt><dd className="mono">{metrics.stepCount}</dd></div>
          <div><dt>Tool calls</dt><dd className="mono">{metrics.toolCallCount}</dd></div>
          <div><dt>Repeated calls</dt><dd className={`mono${metrics.redundantToolCalls ? ' t-amber' : ''}`}>{metrics.redundantToolCalls}</dd></div>
          <div><dt>Retries</dt><dd className={`mono${metrics.retryCount ? ' t-amber' : ''}`}>{metrics.retryCount}</dd></div>
          <div><dt>Tokens</dt><dd className="mono">{(metrics.inputTokens + metrics.outputTokens).toLocaleString('en-US')}</dd></div>
        </dl>
        <p className="pg-findings">{findings.join(' ')}</p>

        <div className="pg-grid">
          <ol className="pg-timeline" aria-label="Steps of the run">
            {run.steps.map((s, i) => {
              const p = placed.rows[i];
              const left = (p.start / placed.total) * 100;
              const width = Math.max((p.dur / placed.total) * 100, 0.8);
              const a = annotations[i] ?? { index: i };
              const f = flags(a);
              const color = a.error ? 'var(--err)' : a.repeatOf !== undefined || a.attempt !== undefined ? 'var(--amber)' : TYPE_COLOR[s.type];
              return (
                <li key={i}>
                  <button type="button" className="pg-row" aria-pressed={i === active} onClick={() => setSelected(i)}>
                    <span className="pg-n mono">#{i + 1}</span>
                    <span className="pg-name mono"><span className="pg-dot" style={{ background: TYPE_COLOR[s.type] }} aria-hidden="true" />{title(s)}</span>
                    <span className="pg-track" aria-hidden="true">
                      <span className="pg-bar" style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: s.type === 'custom' ? 0.45 : 1 }} />
                    </span>
                    <span className="pg-flags">
                      {f.map((x) => <span key={x.text} className={`cascade-flag flag-${x.tone}`}>{x.text}</span>)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {step && (
            <section className="pg-detail" aria-live="polite" aria-label={`Step #${active + 1}`}>
              <div className="pg-detail-head">
                <span className="mono"><span className="muted">#{active + 1}</span> {title(step)}</span>
                <span className="pg-type mono">{TYPE_LABEL[step.type]}</span>
              </div>
              <dl className="pg-kv">
                <div><dt>Duration</dt><dd className="mono">{dur(step.durationMs)}</dd></div>
                {placed.timed && <div><dt>Started at</dt><dd className="mono">+{dur(placed.rows[active].start)}</dd></div>}
                {step.type === 'llm_call' && <div><dt>Tokens in / out</dt><dd className="mono">{step.usage?.inputTokens ?? '—'} / {step.usage?.outputTokens ?? '—'}</dd></div>}
                {annotations[active]?.repeatOf !== undefined && <div><dt>Same call as</dt><dd className="mono t-amber">#{annotations[active].repeatOf! + 1}</dd></div>}
              </dl>
              {annotations[active]?.error && <div className="pg-error mono">{annotations[active].error}</div>}
              {step.type === 'tool_call' && step.args !== undefined && <><div className="pg-label mono">ARGUMENTS</div><pre className="pg-pre mono">{pretty(step.args)}</pre></>}
              {step.type === 'tool_call' && step.result !== undefined && <><div className="pg-label mono">RESULT</div><pre className="pg-pre mono">{pretty(step.result)}</pre></>}
              {step.type === 'llm_call' && step.input.length > 0 && <><div className="pg-label mono">PROMPT</div><pre className="pg-pre mono">{pretty(step.input.map((m) => `${m.role}: ${m.content}`).join('\n\n'))}</pre></>}
              {step.type === 'llm_call' && step.output && <><div className="pg-label mono">OUTPUT</div><pre className="pg-pre mono">{pretty(step.output.content)}</pre></>}
              {step.type === 'custom' && <><div className="pg-label mono">ATTRIBUTES</div><pre className="pg-pre mono">{pretty(step.data)}</pre></>}
            </section>
          )}
        </div>
        <p className="pg-path mono">tool path: {metrics.pathSignature}</p>
      </div>
      <p className="pg-downloads">
        Example files:{' '}
        {SAMPLES.map((s, i) => (
          <span key={s.id}>{i > 0 && ' · '}<a className="mono" href={`/samples/${s.file}`} download>{s.file}</a></span>
        ))}
      </p>
    </div>
  );
}
