/**
 * Compare deux versions de l'agent sur toute la suite, scénario par
 * scénario, et sort en erreur si la nouvelle est moins bonne — de quoi
 * bloquer une CI.
 *
 *   npx tsx examples/eval-suite/compare.ts v1 v2
 */
import { compareScenarios, scenarioRunOf } from '../../packages/core/src/index.js';
import { SCENARIOS } from './scenarios.js';
import { runAgent, type AgentVersion } from './agent.js';

const [a = 'v1', b = 'v2'] = process.argv.slice(2) as AgentVersion[];
const REPEATS = 3;
const suite = (v: AgentVersion) =>
  SCENARIOS.flatMap((s) => Array.from({ length: REPEATS }, (_, k) => scenarioRunOf(runAgent(s, v, k))));

const r = compareScenarios(suite(a), suite(b));
const pct = (x: number | null) => (x === null ? '' : ` (${x > 0 ? '+' : ''}${Math.round(x * 100)}%)`);

console.log(`${b} vs ${a}: ${r.result.toUpperCase()} — ${r.paired} scenarios × ${REPEATS} runs\n`);
for (const m of r.metrics) console.log(`  ${m.label.padEnd(26)} ${m.verdict}${m.verdict === 'regression' || m.verdict === 'improvement' ? pct(m.relDelta) : ''}`);
const worse = r.scenarios.filter((s) => s.verdict === 'regression');
if (worse.length) {
  console.log('\nScenarios that got worse:');
  for (const s of worse) console.log(`  ${s.scenario}: ${s.changes.map((c) => c.label + pct(c.relDelta)).join(', ')}`);
}
if (r.result === 'fail') {
  console.log(`\n${r.reasons.join('\n')}`);
  process.exit(1);
}
