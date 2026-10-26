'use client';

/**
 * La timeline d'un run : chaque step sur une ligne, sa barre placée sur
 * l'axe du temps, et les signaux qui comptent posés directement dessus
 * (REPEAT #n, tentative, erreur). Un clic ouvre le détail du step.
 */

import { useMemo, useState } from 'react';
import type { StepAnnotation, Trajectory, TrajectoryStep } from '@trajekt-ai/core';
import { formatCost, formatDuration, stepTitle } from '../lib/format';
import type { Lang } from '../lib/i18n';

const TYPE_COLOR: Record<TrajectoryStep['type'], string> = {
  llm_call: '#7AA2F7',
  tool_call: '#C9CDD3',
  user_message: '#A9AFB8',
  agent_message: '#A9AFB8',
  decision: '#A9AFB8',
  custom: '#5B626C',
};
const TYPE_LABEL: Record<TrajectoryStep['type'], string> = {
  llm_call: 'LLM call',
  tool_call: 'Tool call',
  user_message: 'User message',
  agent_message: 'Agent message',
  decision: 'Decision',
  custom: 'System',
};
const TYPE_LABEL_FR: Record<TrajectoryStep['type'], string> = {
  llm_call: 'Appel LLM',
  tool_call: 'Appel d’outil',
  user_message: 'Message utilisateur',
  agent_message: 'Message de l’agent',
  decision: 'Décision',
  custom: 'Système',
};

interface Placed {
  step: TrajectoryStep;
  ann: StepAnnotation;
  start: number; // ms depuis le début du run
  dur: number;
}

function place(steps: TrajectoryStep[], anns: StepAnnotation[]): { rows: Placed[]; total: number; timed: boolean } {
  const ts = steps.map((s) => (s.timestamp ? Date.parse(s.timestamp) : NaN));
  const timed = ts.some(Number.isFinite);
  if (!timed) {
    // Pas d'horodatage (ex. résultat AI SDK) : une case par step.
    return { rows: steps.map((step, i) => ({ step, ann: anns[i] ?? { index: i }, start: i, dur: 1 })), total: steps.length || 1, timed };
  }
  const t0 = Math.min(...ts.filter(Number.isFinite));
  let end = t0;
  const rows = steps.map((step, i) => {
    const start = Number.isFinite(ts[i]) ? ts[i] - t0 : 0;
    const dur = step.durationMs ?? 0;
    end = Math.max(end, t0 + start + dur);
    return { step, ann: anns[i] ?? { index: i }, start, dur };
  });
  return { rows, total: Math.max(end - t0, 1), timed };
}

function flagsFor(p: Placed): Array<{ text: string; tone: 'amber' | 'err' }> {
  const out: Array<{ text: string; tone: 'amber' | 'err' }> = [];
  if (p.ann.repeatOf !== undefined) out.push({ text: `REPEAT #${p.ann.repeatOf + 1}`, tone: 'amber' });
  if (p.ann.attempt !== undefined) out.push({ text: `ATTEMPT ${p.ann.attempt}`, tone: 'amber' });
  if (p.ann.error) out.push({ text: p.ann.error.length > 28 ? p.ann.error.slice(0, 27) + '…' : p.ann.error, tone: 'err' });
  return out;
}

export function RunTimeline({
  trajectory, annotations, header, lang = 'en',
}: {
  trajectory: Trajectory;
  annotations: StepAnnotation[];
  header: { left: string; right: string };
  lang?: Lang;
}) {
  const { rows, total, timed } = useMemo(() => place(trajectory.steps, annotations), [trajectory, annotations]);
  // Sélection initiale : le premier step réellement en cause, pas le span
  // racine (qui porte l'erreur finale mais n'explique rien).
  const firstFlagged = (() => {
    const i = rows.findIndex((r) => r.step.type !== 'custom' && flagsFor(r).length > 0);
    return i >= 0 ? i : rows.findIndex((r) => flagsFor(r).length > 0);
  })();
  const [selected, setSelected] = useState(firstFlagged >= 0 ? firstFlagged : 0);
  const active = rows[selected];
  const ticks = timed ? [0, 0.25, 0.5, 0.75, 1] : [];

  return (
    <div>
      <div className="recorder-bar" aria-hidden="true">{lang === 'fr' ? 'BOÎTE NOIRE D’AGENT' : 'AGENT FLIGHT RECORDER'}</div>
      <div className="timeline">
        <div className="tl-head"><span>{header.left}</span><span>{header.right}</span></div>
        {timed && (
          <div className="tl-axis" aria-hidden="true">
            <span /><span />
            <div className="tl-axis-ticks">
              {ticks.map((t) => <span key={t} className={t === 0.25 || t === 0.75 ? 'tick-minor' : undefined} style={{ left: `${t * 100}%`, transform: t === 0 ? 'none' : t === 1 ? 'translateX(-100%)' : undefined }}>{formatDuration(t * total)}</span>)}
            </div>
          </div>
        )}
        <div className="tl-rows" role="list">
          {rows.map((p, i) => {
            const left = (p.start / total) * 100;
            const width = Math.max((p.dur / total) * 100, 0.4);
            const flags = flagsFor(p);
            const color = p.ann.error ? '#FF6B6B' : p.ann.repeatOf !== undefined || p.ann.attempt !== undefined ? '#FFB224' : TYPE_COLOR[p.step.type];
            // Badge à droite de la barre s'il y a la place, sinon à gauche,
            // sinon (barre pleine largeur) à l'intérieur, calé à droite.
            const roomRight = left + width <= 72;
            const roomLeft = left >= 28;
            const flagPos = roomRight
              ? { left: `calc(${left + width}% + 8px)` }
              : roomLeft
                ? { right: `calc(${100 - left}% + 8px)` }
                : { right: `calc(${100 - left - width}% + 6px)` };
            return (
              <button key={i} type="button" role="listitem" className="tl-row" aria-pressed={i === selected} onClick={() => setSelected(i)}>
                <span className="tl-idx">#{p.step.index + 1}</span>
                <span className="tl-name">
                  <span className="type-dot" style={{ background: TYPE_COLOR[p.step.type] }} aria-hidden="true" />
                  <span className="n">{stepTitle(p.step)}</span>
                </span>
                <span className="tl-track">
                  <span className="tl-bar" style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: p.step.type === 'custom' ? 0.45 : 1 }} />
                  {flags.length > 0 && (
                    <span className="row" style={{ position: 'absolute', top: 9, gap: 4, flexWrap: 'nowrap', ...flagPos }}>
                      {flags.map((f) => <span key={f.text} className={`tl-flag flag-${f.tone}`} style={{ position: 'static' }}>{f.text}</span>)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {active && <StepDetail p={active} fr={lang === 'fr'} />}
    </div>
  );
}

function pretty(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

function StepDetail({ p, fr }: { p: Placed; fr: boolean }) {
  const s = p.step;
  const blocks: Array<[string, unknown]> = [];
  if (s.type === 'tool_call') {
    blocks.push(['Arguments', s.args], [fr ? 'Résultat' : 'Result', s.result]);
  } else if (s.type === 'llm_call') {
    if (s.input.length) blocks.push([fr ? 'Entrée' : 'Input', s.input.map((m) => ({ role: m.role, content: m.content }))]);
    if (s.output) blocks.push([fr ? 'Sortie' : 'Output', s.output.content]);
  } else if (s.type === 'custom') {
    blocks.push([fr ? 'Attributs' : 'Attributes', s.data]);
  } else if ('content' in s) {
    blocks.push([fr ? 'Contenu' : 'Content', s.content]);
  }
  const visible = blocks.filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <section className="panel panel-pad step-detail" aria-live="polite">
      <div className="step-detail-head">
        <div className="row">
          <span className="type-dot" style={{ background: TYPE_COLOR[s.type] }} aria-hidden="true" />
          <strong className="mono">#{s.index + 1} {stepTitle(s)}</strong>
          <span className="chip">{(fr ? TYPE_LABEL_FR : TYPE_LABEL)[s.type]}</span>
          {flagsFor(p).map((f) => <span key={f.text} className={f.tone === 'err' ? 'chip chip-err' : 'chip chip-amber'}>{f.text}</span>)}
        </div>
      </div>
      <div className="kv">
        <div><span>{fr ? 'Durée' : 'Duration'}</span><b>{formatDuration(s.durationMs)}</b></div>
        {s.timestamp && <div><span>{fr ? 'Début' : 'Started at'}</span><b>+{formatDuration(p.start)}</b></div>}
        {s.type === 'llm_call' && <div><span>{fr ? 'Tokens entrée / sortie' : 'Tokens in / out'}</span><b>{s.usage?.inputTokens ?? '—'} / {s.usage?.outputTokens ?? '—'}</b></div>}
        {s.type === 'llm_call' && s.costUsd !== undefined && <div><span>{fr ? 'Coût' : 'Cost'}</span><b>{formatCost(s.costUsd)}</b></div>}
        {p.ann.repeatOf !== undefined && <div><span>{fr ? 'Même appel que' : 'Same call as'}</span><b>#{p.ann.repeatOf + 1}</b></div>}
      </div>
      {p.ann.error && <div className="alert-err mono" style={{ marginBottom: 12 }}>{p.ann.error}</div>}
      {visible.map(([label, v]) => (
        <div key={label}>
          <div className="code-label">{label}</div>
          <pre className="code">{pretty(v)}</pre>
        </div>
      ))}
      {s.raw !== undefined && (
        <details style={{ marginTop: 12 }}>
          <summary className="faint" style={{ cursor: 'pointer', fontSize: 12.5 }}>{fr ? 'Payload brut de la source' : 'Raw payload from the source'}</summary>
          <pre className="code" style={{ marginTop: 8 }}>{pretty(s.raw)}</pre>
        </details>
      )}
    </section>
  );
}
