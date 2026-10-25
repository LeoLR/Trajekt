import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './setup';
import type { PgWire } from './pgwire';
import { ingestPayload } from '../src/server/ingest';
import { createProject, verifyProjectApiKey, getDefaultProject } from '../src/server/auth';
import {
  listAgents, agentTimeseries, agentVersions, compareRecentWindow, compareLatestVersions,
  listRuns, getRun, previousRunId, projectStats, compareValues,
} from '../src/server/queries';
import { checkRegressions, recentAlerts, slackMessage } from '../src/server/alerts';
import { simulateTraffic, sentryTriageRun, rng } from '../src/server/simulate';
import { createSessionToken, isValidSessionToken } from '../src/lib/session';
import { loadComparePage } from '../src/server/pages';
import { UnknownFormatError } from '@trajekt/core';

let ctx: Awaited<ReturnType<typeof freshDb>>;
let db: PgWire;
let projectId: string;
let apiKey: string;
// Instant fixe : les tests ne dépendent pas de l'heure d'exécution.
const NOW = new Date('2026-10-24T12:00:00.000Z');

before(async () => {
  ctx = await freshDb();
  db = ctx.db;
  const created = await createProject(db, 'demo');
  projectId = created.project.id;
  apiKey = created.apiKey;
});
after(async () => ctx.drop());

test('clé API : bonne clé acceptée, mauvaise refusée', async () => {
  assert.equal((await verifyProjectApiKey(db, `Bearer ${apiKey}`))?.id, projectId);
  assert.equal(await verifyProjectApiKey(db, 'Bearer tk_live_nope'), null);
  assert.equal(await verifyProjectApiKey(db, null), null);
  assert.equal((await getDefaultProject(db))?.id, projectId);
});

test('ingestion : une trace OTLP en deux lots = une seule ligne, métriques complètes', async () => {
  const [first, second] = sentryTriageRun(rng(1), NOW.getTime() - 3600_000, '1.4.0');
  const a = await ingestPayload(db, projectId, first);
  assert.equal(a.length, 1);
  assert.equal(a[0].merged, false);
  const b = await ingestPayload(db, projectId, second);
  assert.equal(b[0].merged, true);
  assert.equal(b[0].id, a[0].id);
  assert.equal(b[0].agentName, 'sentry-triage');
  assert.equal(b[0].agentVersion, '1.4.0');

  // Renvoyer un lot déjà reçu ne crée ni ligne ni step en double.
  const c = await ingestPayload(db, projectId, second);
  assert.equal(c[0].stepCount, b[0].stepCount);
  const [{ count }] = await db.query<{ count: number }>('select count(*)::int as count from trajectories');
  assert.equal(count, 1);

  const run = await getRun(db, projectId, a[0].id);
  assert.ok(run);
  assert.equal(run.summary.status, 'ok');
  assert.ok(run.summary.costEstimated);
  assert.ok((run.summary.costUsd ?? 0) > 0);
  assert.match(run.summary.pathSignature, /^sentry\.getIssue → gitlab\.searchCode/);
  assert.equal(run.trajectory.steps[0].type, 'custom'); // racine en tête après tri
  assert.equal(await getRun(db, projectId, 'pas-un-uuid'), null);
  await db.query('delete from trajectories');
});

test('ingestion : identité par défaut (headers) seulement si la trace n’en a pas', async () => {
  const aiSdk = { steps: [{ text: 'hello', usage: { promptTokens: 10, completionTokens: 5 }, toolCalls: [] }] };
  const [run] = await ingestPayload(db, projectId, aiSdk, { agentName: 'from-header', agentVersion: '9.9' });
  assert.equal(run.agentName, 'from-header');
  assert.equal(run.traceId, null);
  const [otel] = await ingestPayload(db, projectId, sentryTriageRun(rng(2), NOW.getTime(), '1.4.0')[1], { agentName: 'from-header' });
  assert.equal(otel.agentName, 'sentry-triage');
  await assert.rejects(ingestPayload(db, projectId, { hello: 'world' }), UnknownFormatError);
  await db.query('delete from trajectories');
});

test('deux semaines de trafic simulé : la régression de la v1.5.0 ressort, pas le support-bot', async () => {
  const traffic = simulateTraffic(NOW.getTime(), { days: 14, runsPerDay: 30, deployDaysAgo: 2 });
  for (const p of traffic) await ingestPayload(db, projectId, p.payload);

  const agents = await listAgents(db, projectId, NOW);
  assert.deepEqual(agents.map((a) => a.name).sort(), ['sentry-triage', 'support-bot']);
  const triage = agents.find((a) => a.name === 'sentry-triage')!;
  assert.equal(triage.latestVersion, '1.5.0');
  assert.equal(triage.daily.length, 14);
  assert.ok(triage.runs24h > 20);
  assert.ok(triage.runs7d > triage.runs24h);

  // Versions
  const versions = await agentVersions(db, projectId, 'sentry-triage');
  assert.deepEqual(versions.map((v) => v.version), ['1.5.0', '1.4.0']);
  assert.ok(versions[0].avgSteps > versions[1].avgSteps);
  assert.ok(versions[0].avgRedundantToolCalls > 0.5);
  assert.equal(versions[1].avgRedundantToolCalls, 0);

  // Comparaison par version : boucles, steps, coût, échecs, chemin
  const byVersion = await compareLatestVersions(db, projectId, 'sentry-triage');
  assert.ok(byVersion);
  const reg = Object.fromEntries(byVersion.comparisons.map((c) => [c.metric, c]));
  for (const m of ['redundantToolCalls', 'stepCount', 'costUsd', 'errorRate', 'newPathShare'] as const) {
    assert.equal(reg[m].verdict, 'regression', `${m} devrait régresser`);
  }

  // Fenêtre récente vs 7 jours précédents : la v1.5 a démarré il y a 2 jours,
  // la référence mélange les deux versions, la régression reste visible.
  const byWindow = await compareRecentWindow(db, projectId, 'sentry-triage', { now: NOW });
  const w = Object.fromEntries(byWindow.comparisons.map((c) => [c.metric, c]));
  assert.equal(w.redundantToolCalls.verdict, 'regression');

  // L'agent sain ne déclenche rien.
  const bot = await compareRecentWindow(db, projectId, 'support-bot', { now: NOW });
  assert.equal(bot.comparisons.filter((c) => c.verdict === 'regression').length, 0);
  assert.equal(await compareLatestVersions(db, projectId, 'support-bot'), null); // une seule version

  // Série temporelle : 14 buckets journaliers, la marche est visible.
  const ts = await agentTimeseries(db, projectId, 'sentry-triage', {
    from: new Date(NOW.getTime() - 14 * 86400_000), to: NOW, bucket: 'day',
  });
  assert.equal(ts.length, 15); // bucket partiel du premier jour inclus
  const before = ts.slice(3, 10).map((p) => p.avgSteps ?? 0);
  const afterDeploy = ts.slice(-2).map((p) => p.avgSteps ?? 0);
  assert.ok(Math.min(...afterDeploy) > Math.max(...before));
  const hourly = await agentTimeseries(db, projectId, 'sentry-triage', {
    from: new Date(NOW.getTime() - 24 * 3600_000), to: NOW, bucket: 'hour',
  });
  assert.equal(hourly.length, 24);
  assert.equal(hourly.reduce((s, p) => s + p.runs, 0), triage.runs24h);
});

test('liste des runs : filtres et pagination stable', async () => {
  const page1 = await listRuns(db, projectId, { agent: 'sentry-triage', limit: 25 });
  assert.equal(page1.items.length, 25);
  assert.ok(page1.nextCursor);
  const page2 = await listRuns(db, projectId, { agent: 'sentry-triage', limit: 25, cursor: page1.nextCursor! });
  const ids = new Set([...page1.items, ...page2.items].map((r) => r.id));
  assert.equal(ids.size, 50);
  assert.ok(page1.items.every((r, i, a) => i === 0 || a[i - 1].startedAt >= r.startedAt));

  const errors = await listRuns(db, projectId, { status: 'error', limit: 200 });
  assert.ok(errors.items.length > 0 && errors.items.every((r) => r.status === 'error'));
  const loops = await listRuns(db, projectId, { loopsOnly: true, version: '1.4.0' });
  assert.equal(loops.items.length, 0);
  const loops15 = await listRuns(db, projectId, { loopsOnly: true, version: '1.5.0' });
  assert.ok(loops15.items.length > 0);

  const prev = await previousRunId(db, projectId, page1.items[0]);
  assert.equal(prev, page1.items[1].id);

  // Comparaison : un run v1.5.0 face au dernier run réussi de la v1.4.0.
  const cmp = await loadComparePage(db, projectId, loops15.items[0].id);
  assert.ok(cmp);
  assert.equal(cmp.baselineReason, 'previous-version');
  assert.equal(cmp.a.summary.agentVersion, '1.4.0');
  assert.equal(cmp.a.summary.status, 'ok');
  assert.ok(cmp.diff.counts['+'] > 0);
  assert.equal(await loadComparePage(db, projectId, '00000000-0000-0000-0000-000000000000'), null);

  const stats = await projectStats(db, projectId, null);
  assert.ok(stats.totalRuns > 0 && stats.totalCostUsd > 0);
});

test('dimensions : versions d’appli, d’agent, de prompt et modèle', async () => {
  const byDim = async (d: 'app' | 'agent' | 'prompt' | 'model') =>
    (await agentVersions(db, projectId, 'sentry-triage', d)).map((v) => v.version);
  assert.deepEqual(await byDim('app'), ['3.2.0', '3.1.0']);
  assert.deepEqual(await byDim('agent'), ['1.5.0', '1.4.0']);
  assert.deepEqual(await byDim('prompt'), ['v8', 'v7']);
  assert.deepEqual((await byDim('model')).sort(), ['claude-sonnet-4-5', 'gpt-4.1-mini']);

  const verdicts = (r: Awaited<ReturnType<typeof compareValues>>) =>
    Object.fromEntries(r.comparisons.map((c) => [c.metric, c.verdict]));

  // Prompt v7 → v8 (déployé avec l'agent 1.5.0) : la régression ressort.
  const prompt = await compareValues(db, projectId, 'sentry-triage', 'prompt', 'v7', 'v8');
  assert.equal(prompt.mode, 'ab');
  assert.equal(prompt.dimension, 'prompt');
  assert.equal(verdicts(prompt).redundantToolCalls, 'regression');

  // Appli 3.1.0 → 3.2.0 AVANT le déploiement de l'agent 1.5.0 : rien ne change.
  const beforeAgentDeploy = new Date(NOW.getTime() - 2 * 86400_000 - 3600_000);
  const app = await compareValues(db, projectId, 'sentry-triage', 'app', '3.1.0', '3.2.0', { to: beforeAgentDeploy });
  assert.ok(app.currentRuns >= 20 && app.baselineRuns >= 20);
  assert.equal(app.comparisons.filter((c) => c.verdict === 'regression').length, 0);

  // Modèle : gpt-4.1-mini coûte moins cher que claude-sonnet-4-5.
  const model = await compareValues(db, projectId, 'sentry-triage', 'model', 'claude-sonnet-4-5', 'gpt-4.1-mini');
  assert.equal(verdicts(model).costUsd, 'improvement');

  // Dernière valeur vs précédente sur une autre dimension que l'agent.
  const latestApp = await compareLatestVersions(db, projectId, 'sentry-triage', { dimension: 'app' });
  assert.equal(latestApp?.currentLabel, '3.2.0');
  assert.equal(latestApp?.baselineLabel, '3.1.0');

  // Filtres de runs par dimension.
  const mini = await listRuns(db, projectId, { agent: 'sentry-triage', model: 'gpt-4.1-mini', limit: 200 });
  assert.ok(mini.items.length > 0 && mini.items.every((r) => r.primaryModel === 'gpt-4.1-mini'));
  const v8 = await listRuns(db, projectId, { promptVersion: 'v8', appVersion: '3.2.0', limit: 5 });
  assert.ok(v8.items.every((r) => r.promptVersion === 'v8' && r.appVersion === '3.2.0' && r.agentVersion === '1.5.0'));

  // Série filtrée sur une valeur de dimension.
  const ts = await agentTimeseries(db, projectId, 'sentry-triage', {
    from: new Date(NOW.getTime() - 14 * 86400_000), to: NOW, bucket: 'day', dimension: 'prompt', version: 'v8',
  });
  assert.ok(ts.slice(0, 10).every((p) => p.runs === 0));
  assert.ok(ts.slice(-2).every((p) => p.runs > 0));
});

test('version d’appli par en-tête, version d’agent qui la suit par défaut', async () => {
  const aiSdk = { steps: [{ text: 'hi', usage: { promptTokens: 5, completionTokens: 2 }, toolCalls: [] }] };
  const [run] = await ingestPayload(db, projectId, aiSdk, { agentName: 'header-bot', appVersion: '9.0.1' });
  assert.equal(run.appVersion, '9.0.1');
  assert.equal(run.agentVersion, '9.0.1');
  const [explicit] = await ingestPayload(db, projectId, aiSdk, { agentName: 'header-bot', appVersion: '9.0.1', agentVersion: '2.0.0' });
  assert.equal(explicit.agentVersion, '2.0.0');
  await db.query("delete from trajectories where agent_name = 'header-bot'");
});

test('alertes : création, cooldown, message Slack', async () => {
  const sent: number[] = [];
  const first = await checkRegressions(db, projectId, { now: NOW, notify: async (a) => { sent.push(a.length); } });
  assert.equal(first.agentsChecked, 2);
  assert.ok(first.alertsCreated.length >= 4);
  assert.ok(first.alertsCreated.every((a) => a.agentName === 'sentry-triage'));
  assert.deepEqual(sent, [first.alertsCreated.length]);

  // Une heure plus tard : rien de nouveau, tout est sous cooldown.
  const second = await checkRegressions(db, projectId, { now: new Date(NOW.getTime() + 3600_000), notify: async () => { sent.push(-1); } });
  assert.equal(second.alertsCreated.length, 0);
  assert.equal(second.suppressedByCooldown, second.regressions);
  assert.deepEqual(sent.length, 1);

  const stored = await recentAlerts(db, projectId, { agent: 'sentry-triage' });
  assert.equal(stored.length, first.alertsCreated.length);
  const [{ notified }] = await db.query<{ notified: number }>('select count(notified_at)::int as notified from alerts');
  assert.equal(notified, first.alertsCreated.length);

  const msg = slackMessage(first.alertsCreated, 'https://trajekt.example.com');
  assert.match(msg.text, /regressions? detected/);
  assert.match(JSON.stringify(msg.blocks), /sentry-triage/);
  assert.match(JSON.stringify(msg.blocks), /agents\/sentry-triage\|open/);
});

test('session : jeton signé, expiré, falsifié', async () => {
  const secret = 'un-secret-de-test-assez-long';
  const token = await createSessionToken(Date.now(), secret);
  assert.equal(await isValidSessionToken(token, Date.now(), secret), true);
  assert.equal(await isValidSessionToken(token, Date.now() + 8 * 86400_000, secret), false);
  assert.equal(await isValidSessionToken(token.replace(/.$/, (c) => (c === '0' ? '1' : '0')), Date.now(), secret), false);
  assert.equal(await isValidSessionToken(token, Date.now(), 'un-autre-secret-assez-long'), false);
  assert.equal(await isValidSessionToken(undefined, Date.now(), secret), false);
});
