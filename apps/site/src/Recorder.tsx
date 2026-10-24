import { useEffect, useState } from 'react';

/**
 * Le "recorder" du hero : une trace figée, avec une tête de lecture qui
 * avance d'étape en étape. Données d'illustration, pas un vrai run.
 */

type Flag = { text: string; tone: 'amber' | 'red' };
interface Step {
  n: number;
  name: string;
  start: number;
  dur: number;
  kind: 'llm' | 'tool';
  flag?: Flag;
}

const TOTAL = 40.6;
const STEPS: Step[] = [
  { n: 2, name: 'llm.generate', start: 0.02, dur: 2.84, kind: 'llm' },
  { n: 3, name: 'sentry.getIssue', start: 2.88, dur: 0.41, kind: 'tool' },
  { n: 5, name: 'gitlab.searchCode', start: 5.45, dur: 0.88, kind: 'tool' },
  { n: 7, name: 'gitlab.readFile', start: 8.84, dur: 0.36, kind: 'tool' },
  { n: 9, name: 'jira.createIssue', start: 13.34, dur: 7.92, kind: 'tool', flag: { text: 'RETRY ×2', tone: 'amber' } },
  { n: 10, name: 'llm.generate', start: 21.28, dur: 3.42, kind: 'llm' },
  { n: 11, name: 'gitlab.searchCode', start: 24.72, dur: 0.91, kind: 'tool', flag: { text: 'REPEAT #5', tone: 'amber' } },
  { n: 13, name: 'gitlab.searchCode', start: 29.55, dur: 0.86, kind: 'tool', flag: { text: 'REPEAT #5', tone: 'amber' } },
  { n: 14, name: 'llm.generate', start: 30.43, dur: 9.61, kind: 'llm' },
  { n: 15, name: 'gitlab.createMergeRequest', start: 40.06, dur: 0.52, kind: 'tool', flag: { text: '422', tone: 'red' } },
];

function usePlayhead(count: number, intervalMs: number): number | null {
  // null tant que rien ne bouge : rendu serveur, ou mouvement réduit.
  const [i, setI] = useState<number | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;
    let id: number | undefined;
    const start = () => {
      setI(0);
      id = window.setInterval(() => setI((x) => ((x ?? 0) + 1) % count), intervalMs);
    };
    start();
    const onChange = () => {
      window.clearInterval(id);
      if (reduce.matches) setI(null);
      else start();
    };
    reduce.addEventListener('change', onChange);
    return () => {
      window.clearInterval(id);
      reduce.removeEventListener('change', onChange);
    };
  }, [count, intervalMs]);
  return i;
}

export function Recorder() {
  const head = usePlayhead(STEPS.length, 1100);
  const headPos = head === null ? null : (STEPS[head].start / TOTAL) * 100;

  return (
    <figure className="recorder" aria-label="Example recording of an agent run">
      <div className="recorder-bar">
        <span>AGENT FLIGHT RECORDER · DO NOT OPEN</span>
        <span className="rec"><span className="rec-dot" aria-hidden="true" />REC</span>
      </div>
      <div className="recorder-body">
        <div className="recorder-head mono">
          <span>run_7f3e9a21 · sentry-triage</span>
          <span>40.6s · $0.162</span>
        </div>
        <ol className="cascade">
          {STEPS.map((s, i) => {
            const left = (s.start / TOTAL) * 100;
            const width = Math.max((s.dur / TOTAL) * 100, 0.8);
            const active = head === i;
            const barColor = s.flag?.tone === 'red' ? 'var(--err)' : s.flag ? 'var(--amber)' : s.kind === 'llm' ? 'var(--t-llm)' : 'var(--t-tool)';
            const flagOnLeft = left + width > 70;
            return (
              <li key={s.n} className={`cascade-row${active ? ' is-active' : ''}`}>
                <span className="cascade-n mono">#{s.n}</span>
                <span className="cascade-name mono">{s.name}</span>
                <span className="cascade-track" aria-hidden="true">
                  <span className="cascade-bar" style={{ left: `${left}%`, width: `${width}%`, background: barColor }} />
                  {s.flag && (
                    <span
                      className={`cascade-flag flag-${s.flag.tone}`}
                      style={flagOnLeft ? { right: `calc(${100 - left}% + 6px)` } : { left: `calc(${left + width}% + 6px)` }}
                    >
                      {s.flag.text}
                    </span>
                  )}
                </span>
                {s.flag && <span className="sr-only">{s.flag.text}</span>}
              </li>
            );
          })}
          {headPos !== null && <span className="playhead" style={{ left: `calc(var(--track-start) + (100% - var(--track-start)) * ${headPos / 100})` }} aria-hidden="true" />}
        </ol>
        <figcaption className="recorder-legend">
          Steps #11 and #13 repeat #5 with identical arguments. #15 fails with 422.
        </figcaption>
      </div>
    </figure>
  );
}
