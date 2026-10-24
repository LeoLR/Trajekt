'use client';

/**
 * "Open a trace" : déposer un export (Langfuse, OTLP, AI SDK, Trajekt)
 * et le voir tout de suite, sans rien envoyer au serveur. Le même
 * normalize() que l'ingestion tourne dans le navigateur.
 */

import { useCallback, useState } from 'react';
import { annotateSteps, computeMetrics, normalizeAll, type Trajectory } from '@trajekt/core';
import { Shell } from '../components/ui';
import { RunTimeline } from '../components/RunTimeline';
import { formatCost, formatDuration } from '../lib/format';

export function ExploreView() {
  const [runs, setRuns] = useState<Trajectory[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const load = useCallback((file: File) => {
    file.text().then((text) => {
      try {
        const out = normalizeAll(JSON.parse(text));
        setRuns(out);
        setSelected(0);
        setError(out.length ? null : 'No trace found in this file.');
      } catch (e) {
        setRuns([]);
        setError(e instanceof Error ? e.message : 'Could not read this file.');
      }
    });
  }, []);

  const t = runs[selected];
  const m = t ? computeMetrics(t) : null;

  return (
    <Shell active="explore">
      <div className="page-head">
        <div>
          <div className="eyebrow">Local · nothing is uploaded</div>
          <h1>Open a trace</h1>
        </div>
      </div>
      <label
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e: { preventDefault(): void }) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: { preventDefault(): void; dataTransfer: DataTransfer }) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) load(f); }}
        style={{ display: 'block', cursor: 'pointer' }}
      >
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(e: { target: HTMLInputElement }) => { const f = e.target.files?.[0]; if (f) load(f); }} />
        <strong style={{ color: 'var(--text)' }}>Drop a JSON trace here, or click to choose a file</strong>
        <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>Langfuse trace export · OTLP/JSON · Vercel AI SDK result · Trajekt trajectory</div>
      </label>
      {error && <div className="alert-err" style={{ marginTop: 16 }}>{error}</div>}
      {runs.length > 1 && (
        <div className="row" style={{ marginTop: 16 }}>
          <span className="faint">{runs.length} traces in this file:</span>
          {runs.map((r, i) => (
            <button key={r.id} type="button" className={i === selected ? 'chip chip-amber' : 'chip'} style={{ cursor: 'pointer', background: 'none', minHeight: 32 }} onClick={() => setSelected(i)}>
              {(r.metadata.traceId ?? r.id).slice(0, 8)}
            </button>
          ))}
        </div>
      )}
      {t && m && (
        <div className="section">
          <RunTimeline
            key={t.id}
            trajectory={t}
            annotations={annotateSteps(t)}
            header={{
              left: `${t.metadata.agentName ?? 'unknown agent'} · ${t.metadata.sourceFormat ?? ''}`,
              right: `${formatDuration(m.durationMs)} · ${formatCost(m.costUsd, m.costEstimated)}`,
            }}
          />
        </div>
      )}
    </Shell>
  );
}
