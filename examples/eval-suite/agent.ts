/**
 * Un agent de triage jouet, pour l'exemple : il appelle des outils
 * mockés et enregistre ce qu'il fait sous forme de Trajectory.
 *
 * Dans votre projet, c'est votre vrai agent (avec un vrai LLM) branché
 * sur des outils mockés, et la trajectoire vient de votre instrumentation
 * OpenTelemetry (normalize) ou de votre framework.
 *
 * La « v2 » imite une régression courante : quand la recherche de code
 * renvoie plusieurs fichiers, elle relance la même recherche au lieu de
 * lire le bon fichier.
 */
import { SCHEMA_VERSION, type Trajectory, type TrajectoryStep } from '../../packages/core/src/index.js';
import type { Scenario } from './scenarios.js';

export type AgentVersion = 'v1' | 'v2';

/** Petit aléa reproductible : le LLM n'est pas déterministe, les répétitions d'un scénario varient. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function runAgent(scenario: Scenario, version: AgentVersion, repeat: number): Trajectory {
  const r = rng(scenario.name.length * 97 + repeat * 13 + (version === 'v2' ? 7 : 0));
  const steps: TrajectoryStep[] = [];
  let t = Date.UTC(2026, 9, 25, 9, 0, 0);
  const push = (s: Omit<TrajectoryStep, 'index' | 'timestamp'>, ms: number) => {
    steps.push({ ...s, index: steps.length, timestamp: new Date(t).toISOString(), durationMs: ms } as TrajectoryStep);
    t += ms + 20;
  };
  const llm = (inT: number, outT: number) =>
    push({ type: 'llm_call', model: 'claude-sonnet-4-5', input: [], usage: { inputTokens: inT, outputTokens: outT } }, 1500 + r() * 1500);

  llm(1800, 200);
  push({ type: 'tool_call', name: 'sentry.getIssue', args: { id: scenario.issue.id }, result: scenario.issue }, 300);
  llm(2600, 250);
  push({ type: 'tool_call', name: 'gitlab.searchCode', args: { query: scenario.issue.title }, result: scenario.searchHits }, 800);
  if (version === 'v2' && scenario.searchHits.length > 1) {
    // La régression : la même recherche, encore, sur les tickets ambigus.
    const extra = r() < 0.4 ? 2 : 1;
    for (let i = 0; i < extra; i++) {
      llm(3600, 400);
      push({ type: 'tool_call', name: 'gitlab.searchCode', args: { query: scenario.issue.title }, result: scenario.searchHits }, 800);
    }
  }
  // v2 lit parfois le mauvais fichier quand la recherche est ambiguë (le premier
  // résultat n'est pas le bon) : le ticket part sur une fausse piste.
  const readsWrongFile = version === 'v2' && scenario.searchHits.length > 1 && scenario.searchHits[0] !== scenario.issue.file && repeat < 2;
  const file = readsWrongFile ? scenario.searchHits[0] : scenario.issue.file;
  push({ type: 'tool_call', name: 'gitlab.readFile', args: { path: file }, result: '…' }, 300);
  llm(4200 + r() * 800, 500);
  push({ type: 'tool_call', name: 'jira.createIssue', args: { project: scenario.issue.id.split('-')[0], summary: scenario.issue.title }, result: { key: 'X-1' } }, 600);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `${scenario.name}-${version}-${repeat}`,
    source: 'simulation',
    steps,
    metadata: {
      agentName: 'sentry-triage', agentVersion: version, scenario: { name: scenario.name },
      // Le score de qualité : le ticket pointe-t-il le bon fichier ?
      scores: { correct: file === scenario.issue.file ? 1 : 0 },
    },
  };
}
