import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './setup';
import type { PgWire } from './pgwire';
import { createProject } from '../src/server/auth';
import { ingestPayload } from '../src/server/ingest';
import { agentVersions, listAgents, listRuns } from '../src/server/queries';
import { loadAgentsPage, loadComparePage } from '../src/server/pages';
import { listEvalAgents, loadSuitePage } from '../src/server/suites';
import { EVAL_SCENARIOS, demoPayloads, simulateEvalSuite } from '../src/server/simulate';
import { handleMcp } from '../src/server/mcp';

let ctx: Awaited<ReturnType<typeof freshDb>>;
let db: PgWire;
let projectId: string;
const NOW = new Date('2026-10-24T12:00:00.000Z');
let prodRuns = 0;

before(async () => {
  ctx = await freshDb();
  db = ctx.db;
  projectId = (await createProject(db, 'demo')).project.id;
  const payloads = demoPayloads(NOW.getTime());
  for (const p of payloads) await ingestPayload(db, projectId, p.payload);
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from trajectories where scenario is null and agent_name = 'sentry-triage'`);
  prodRuns = n;
});
after(async () => ctx.drop());

test('les runs de la suite sont stockés avec leur scénario, la prod les ignore', async () => {
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from trajectories where scenario is not null`);
  assert.equal(n, EVAL_SCENARIOS.length * 3 * 2);
  const prod = (await agentVersions(db, projectId, 'sentry-triage')).reduce((s, v) => s + v.runs, 0);
  assert.equal(prod, prodRuns, 'les versions de prod ne comptent pas les runs d’évaluation');
  const agents = await listAgents(db, projectId, NOW);
  assert.ok(agents.find((a) => a.name === 'sentry-triage')!.runs7d < prodRuns + 1);
  const evalRuns = await listRuns(db, projectId, { kind: 'eval', scenario: 'refund-rounding' });
  assert.equal(evalRuns.items.length, 6);
  assert.ok(evalRuns.items.every((r) => r.scenario === 'refund-rounding'));
  assert.ok((await listRuns(db, projectId, { kind: 'live', limit: 50 })).items.every((r) => r.scenario === null));
});

test('suite : la v1.5.0 échoue avant la mise en prod, et dit pourquoi', async () => {
  const page = (await loadSuitePage(db, projectId, 'sentry-triage'))!;
  assert.equal(page.a, '1.4.0');
  assert.equal(page.b, '1.5.0');
  const c = page.comparison!;
  assert.equal(c.paired, EVAL_SCENARIOS.length);
  assert.equal(c.result, 'fail');
  assert.ok(c.reasons.some((r) => r.startsWith('refund-rounding: 0/3 → 2/3 failed')), c.reasons.join(' | '));
  const verdict = (m: string) => c.metrics.find((x) => x.metric === m)!.verdict;
  assert.equal(verdict('stepCount'), 'regression');
  assert.equal(verdict('redundantToolCalls'), 'regression');
  // Les scénarios au fichier ambigu bouclent ; les autres restent stables.
  const worse = new Set(c.scenarios.filter((s) => s.verdict === 'regression').map((s) => s.scenario));
  for (const sc of EVAL_SCENARIOS.filter((x) => x.ambiguous)) assert.ok(worse.has(sc.name), `${sc.name} devrait être signalé`);
  assert.ok(!worse.has('payment-timeout'));
  assert.equal(c.scenarios[0].scenario, 'refund-rounding', 'le scénario qui échoue vient en premier');
  // Un run par côté pour ouvrir le diff.
  assert.ok(page.sampleRuns['refund-rounding'].a && page.sampleRuns['refund-rounding'].b);

  // Même suite dans l'autre sens : amélioration, pass.
  const back = (await loadSuitePage(db, projectId, 'sentry-triage', { a: '1.5.0', b: '1.4.0' }))!.comparison!;
  assert.equal(back.result, 'pass');
  assert.equal(back.metrics.find((x) => x.metric === 'stepCount')!.verdict, 'improvement');

  // Par version de prompt : même découpage (v7 / v8).
  const byPrompt = (await loadSuitePage(db, projectId, 'sentry-triage', { dimension: 'prompt' }))!;
  assert.deepEqual([byPrompt.a, byPrompt.b], ['v7', 'v8']);
});

test('vue d’ensemble, comparaison de runs et MCP connaissent les suites', async () => {
  const overview = await loadAgentsPage(db, projectId, NOW);
  const e = overview.evals.find((x) => x.name === 'sentry-triage')!;
  assert.equal(e.result, 'fail');
  assert.equal(e.scenarios, EVAL_SCENARIOS.length);
  assert.deepEqual(await listEvalAgents(db, projectId).then((x) => x.map((a) => a.name)), ['sentry-triage']);

  // Un run d'évaluation se compare au même scénario, version précédente.
  const [run] = (await listRuns(db, projectId, { kind: 'eval', scenario: 'coupon-expired', version: '1.5.0', limit: 1 })).items;
  const cmp = (await loadComparePage(db, projectId, run.id))!;
  assert.equal(cmp.baselineReason, 'previous-version');
  assert.equal(cmp.a.summary.scenario, 'coupon-expired');
  assert.equal(cmp.a.summary.agentVersion, '1.4.0');

  const call = async (name: string, args: Record<string, unknown>) =>
    ((await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, async () => ({ db, projectId, now: NOW }))) as any).result;
  const suite = await call('compare_eval_suite', { agent: 'sentry-triage' });
  assert.notEqual(suite.isError, true);
  const text = suite.content[0].text as string;
  assert.match(text, /agent version 1\.5\.0 vs 1\.4\.0: FAIL \(12 scenarios compared\)/);
  assert.match(text, /refund-rounding: Fails more often \(0\/3 → 2\/3 failed\)/);
  const bad = await call('compare_eval_suite', { agent: 'sentry-triage', a: '1.4.0', b: '9.9.9' });
  assert.equal(bad.isError, true);
  const runs = await call('find_runs', { agent: 'sentry-triage', kind: 'eval', scenario: 'tax-rate-eu', agent_version: '1.5.0' });
  assert.match(runs.content[0].text, /scenario tax-rate-eu/);
  const agentsTool = await call('list_agents', {});
  assert.match(agentsTool.content[0].text, /Eval suites[\s\S]*sentry-triage: 12 scenarios, FAIL — 1\.5\.0 vs 1\.4\.0/);
});

test('scénario fourni par en-tête (X-Trajekt-Scenario) si la trace n’en a pas', async () => {
  const [payload] = simulateEvalSuite(NOW.getTime() - 3600_000, '1.4.0', { repeats: 1 }).slice(0, 1).map((p) => p.payload);
  // Le premier lot d'un run n'a pas la racine, donc pas de scénario : l'en-tête le donne.
  const [run] = await ingestPayload(db, projectId, payload, { scenario: 'from-header' });
  assert.equal(run.scenario, 'from-header');
});
