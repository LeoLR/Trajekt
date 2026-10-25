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

test('scores : en prod, la baisse de qualité de la v1.5.0 ressort ; scores après coup par traceId', async () => {
  const { compareLatestVersions, listRuns: lr, agentVersions: av } = await import('../src/server/queries');
  const { addScores, parseScore } = await import('../src/server/scores');
  const cmp = (await compareLatestVersions(db, projectId, 'sentry-triage'))!;
  const correct = cmp.comparisons.find((c) => c.metric === 'score:correct')!;
  assert.equal(correct.verdict, 'regression');
  assert.ok(correct.baseline! > 0.9 && correct.current! < 0.85, `${correct.baseline} → ${correct.current}`);
  assert.ok((await av(db, projectId, 'sentry-triage')).every((v) => typeof v.scores.correct === 'number'));
  // support-bot : score « helpful » venu de l'export Langfuse.
  const [bot] = (await lr(db, projectId, { agent: 'support-bot', limit: 1 })).items;
  assert.ok('helpful' in bot.scores);

  // Retour utilisateur après coup, par traceId : il prime sur la trace, même si elle est renvoyée.
  const [run] = (await lr(db, projectId, { agent: 'sentry-triage', kind: 'live', limit: 1 })).items;
  const input = parseScore({ traceId: run.traceId, name: 'correct', value: true, comment: 'checked by on-call' });
  assert.equal(typeof input, 'object');
  const [res] = await addScores(db, projectId, [input as any, { traceId: 'nope', name: 'x', value: 1 }].slice(0, 1));
  assert.equal(res.ok, true);
  const missing = await addScores(db, projectId, [{ traceId: 'nope', name: 'x', value: 1 }]);
  assert.match(missing[0].error!, /No run found for traceId nope/);
  const [{ value, source }] = await db.query<{ value: number; source: string }>(`select value, source from run_scores where trajectory_id = $1 and name = 'correct'`, [run.id]);
  assert.equal(Number(value), 1);
  assert.equal(source, 'api');
  assert.equal(parseScore({ traceId: 't', name: 'bad name!', value: 1 }), '"name" must be 1–100 characters: letters, digits, _ . -');
  assert.match(String(parseScore({ name: 'ok', value: 1 })), /traceId/);
});

test('exploitation : rétention, limite de débit, payloads bruts optionnels, plusieurs projets', async () => {
  const { purgeOldRuns, retentionDays } = await import('../src/server/maintenance');
  const { takeToken } = await import('../src/lib/ratelimit');
  const { createProject: cp, listProjects, resolveProject } = await import('../src/server/auth');
  const { sentryTriageRun, rng } = await import('../src/server/simulate');

  // Plusieurs projets : chacun ses runs, et le choix par cookie retombe sur le projet par défaut.
  const other = (await cp(db, 'other')).project;
  process.env.TRAJEKT_STORE_RAW = 'false';
  const [payloadA, payloadB] = sentryTriageRun(rng(1), NOW.getTime() - 400 * 86400_000, '1.4.0');
  await ingestPayload(db, other.id, payloadA);
  const [run] = await ingestPayload(db, other.id, payloadB);
  delete process.env.TRAJEKT_STORE_RAW;
  const [{ steps }] = await db.query<{ steps: unknown }>('select steps::text as steps from trajectories where id = $1', [run.id]);
  assert.ok(!String(steps).includes('"raw"'), 'payload brut non stocké');
  const projects = await listProjects(db);
  assert.deepEqual(projects.map((p) => [p.name, p.runs > 0]), [['demo', true], ['other', true]]);
  assert.equal((await resolveProject(db, other.id))!.name, 'other');
  assert.equal((await resolveProject(db, '00000000-0000-0000-0000-000000000000'))!.name, 'demo');
  assert.equal((await resolveProject(db, 'garbage'))!.name, 'demo');

  // Rétention : seul le run de plus de 365 jours part.
  assert.equal(retentionDays({}), null);
  assert.equal(retentionDays({ TRAJEKT_RETENTION_DAYS: '30' }), 30);
  assert.equal(await purgeOldRuns(db, NOW, null), 0);
  assert.equal(await purgeOldRuns(db, NOW, 365), 1);
  assert.equal((await db.query('select 1 from trajectories where id = $1', [run.id])).length, 0);

  // Débit : 3 par minute, puis 429 avec un délai, puis une nouvelle fenêtre.
  const t0 = 1_000_000;
  assert.ok(takeToken('p', 3, t0).ok && takeToken('p', 3, t0 + 1).ok && takeToken('p', 3, t0 + 2).ok);
  const blocked = takeToken('p', 3, t0 + 30_000);
  assert.deepEqual(blocked, { ok: false, retryAfterSeconds: 30 });
  assert.ok(takeToken('p', 3, t0 + 60_000).ok);
});
