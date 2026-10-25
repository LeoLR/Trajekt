import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './setup';
import type { PgWire } from './pgwire';
import { createApiKey, createProject, verifyProjectApiKey } from '../src/server/auth';
import { ingestPayload } from '../src/server/ingest';
import { simulateTraffic } from '../src/server/simulate';
import { handleMcp, TOOLS, MCP_PROTOCOL_VERSIONS } from '../src/server/mcp';

let ctx: Awaited<ReturnType<typeof freshDb>>;
let db: PgWire;
let projectId: string;
let ingestKey: string;
const NOW = new Date('2026-10-24T12:00:00.000Z');

before(async () => {
  ctx = await freshDb();
  db = ctx.db;
  const created = await createProject(db, 'demo');
  projectId = created.project.id;
  ingestKey = created.apiKey;
  for (const p of simulateTraffic(NOW.getTime(), { days: 14, runsPerDay: 30, deployDaysAgo: 2 })) {
    await ingestPayload(db, projectId, p.payload);
  }
});
after(async () => ctx.drop());

const call = async (method: string, params?: Record<string, unknown>, id: number | undefined = 1) =>
  handleMcp({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }, async () => ({ db, projectId, now: NOW })) as Promise<any>;
const tool = async (name: string, args: Record<string, unknown> = {}) =>
  (await call('tools/call', { name, arguments: args })).result;

test('clés : lecture et ingestion ne sont pas interchangeables', async () => {
  const readKey = await createApiKey(db, projectId, 'read', 'claude');
  assert.match(readKey, /^tk_read_/);
  assert.equal((await verifyProjectApiKey(db, `Bearer ${readKey}`, 'read'))?.id, projectId);
  assert.equal(await verifyProjectApiKey(db, `Bearer ${readKey}`, 'ingest'), null);
  assert.equal((await verifyProjectApiKey(db, `Bearer ${ingestKey}`, 'ingest'))?.id, projectId);
  assert.equal(await verifyProjectApiKey(db, `Bearer ${ingestKey}`, 'read'), null);
  const extraIngest = await createApiKey(db, projectId, 'ingest', 'ci');
  assert.match(extraIngest, /^tk_live_/);
  assert.equal((await verifyProjectApiKey(db, `Bearer ${extraIngest}`))?.id, projectId);
});

test('protocole : initialize, ping, notifications, lots, méthodes inconnues', async () => {
  const init = await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'trajekt');
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /list_agents/);
  const future = await call('initialize', { protocolVersion: '2099-01-01' });
  assert.equal(future.result.protocolVersion, MCP_PROTOCOL_VERSIONS[0]);
  assert.deepEqual((await call('ping')).result, {});
  assert.equal(await call('notifications/initialized', undefined, undefined), null);
  assert.equal((await call('nope')).error.code, -32601);
  const batch = await handleMcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], async () => ({ db, projectId, now: NOW }));
  assert.ok(Array.isArray(batch) && batch.length === 1);
  assert.equal((await handleMcp({ hello: 1 }, async () => ({ db, projectId, now: NOW })) as any).error.code, -32600);
});

test('tools/list : 8 outils en lecture seule avec un schéma', async () => {
  const { tools } = (await call('tools/list')).result;
  assert.deepEqual(tools.map((t: any) => t.name), ['list_agents', 'list_versions', 'compare', 'compare_eval_suite', 'get_regressions', 'find_runs', 'explain_run', 'diff_runs']);
  assert.ok(tools.every((t: any) => t.annotations.readOnlyHint === true && t.inputSchema.type === 'object' && t.description.length > 40));
  assert.equal(TOOLS.length, 8);
});

test('list_agents et get_regressions : la régression de sentry-triage est là, en clair', async () => {
  const r = await tool('list_agents');
  assert.equal(r.isError, false);
  assert.match(r.content[0].text, /^sentry-triage — REGRESSED, agent 1\.5\.0/m);
  assert.match(r.content[0].text, /support-bot — (healthy|not enough runs)/);
  assert.equal(r.structuredContent.agents[0].name, 'sentry-triage');
  const g = await tool('get_regressions', { agent: 'sentry-triage' });
  assert.match(g.content[0].text, /Repeated tool calls: 0 → /);
  const healthy = await tool('get_regressions', { agent: 'support-bot' });
  assert.match(healthy.content[0].text, /No regression detected for support-bot/);
  const unknown = await tool('get_regressions', { agent: 'nope' });
  assert.equal(unknown.isError, true);
});

test('compare : A/B par prompt, dernière version, fenêtre, erreurs d’usage', async () => {
  const ab = await tool('compare', { agent: 'sentry-triage', dimension: 'prompt', a: 'v7', b: 'v8' });
  assert.match(ab.content[0].text, /prompt version: B = v8 \(\d+ runs\) vs A = v7/);
  assert.match(ab.content[0].text, /Repeated tool calls: .*REGRESSION/);
  assert.equal(ab.structuredContent.mode, 'ab');
  const latest = await tool('compare', { agent: 'sentry-triage' });
  assert.match(latest.content[0].text, /agent version: B = 1\.5\.0/);
  const window = await tool('compare', { agent: 'sentry-triage', mode: 'window' });
  assert.match(window.content[0].text, /last 24 h/);
  assert.equal((await tool('compare', { agent: 'sentry-triage', dimension: 'prompt', a: 'v7', b: 'v99' })).isError, true);
  assert.match((await tool('compare', { agent: 'sentry-triage', dimension: 'prompt', a: 'v7', b: 'v99' })).content[0].text, /Known: v8, v7/);
  assert.equal((await tool('compare', { agent: 'sentry-triage', a: '1.4.0' })).isError, true);
  assert.equal((await tool('compare', { agent: 'sentry-triage', dimension: 'colour' })).isError, true);
  assert.equal((await tool('compare', {})).isError, true);
});

test('find_runs → explain_run → diff_runs', async () => {
  const found = await tool('find_runs', { agent: 'sentry-triage', prompt_version: 'v8', repeated_tool_calls_only: true, limit: 3 });
  const runs = found.structuredContent.runs;
  assert.equal(runs.length, 3);
  assert.match(found.content[0].text, /repeated call/);
  const explained = await tool('explain_run', { run_id: runs[0].id });
  assert.match(explained.content[0].text, /Tool path: /);
  assert.match(explained.content[0].text, /same tool and arguments as step #\d+/);
  assert.ok(explained.structuredContent.notableSteps.length > 0);
  const diff = await tool('diff_runs', { run_id: runs[0].id });
  assert.match(diff.content[0].text, /Configuration changes: .*agent version 1\.4\.0 → 1\.5\.0/);
  assert.match(diff.content[0].text, /only in B: gitlab\.searchCode/);
  assert.equal((await tool('explain_run', { run_id: 'nope' })).isError, true);
  assert.equal((await tool('find_runs', { status: 'weird' })).isError, true);
  const versions = await tool('list_versions', { agent: 'sentry-triage', dimension: 'model' });
  assert.match(versions.content[0].text, /gpt-4\.1-mini: \d+ runs/);
});

test('les réponses restent courtes (budget de contexte)', async () => {
  for (const [name, args] of [
    ['list_agents', {}], ['get_regressions', {}], ['find_runs', { limit: 25 }],
    ['compare', { agent: 'sentry-triage', dimension: 'prompt', a: 'v7', b: 'v8' }],
  ] as const) {
    const r = await tool(name, args);
    assert.ok(r.content[0].text.length < 6000, `${name}: ${r.content[0].text.length} chars`);
  }
});
