/**
 * Tests de bout en bout de l'application qui tourne (next start + Postgres),
 * dans un vrai navigateur. Prérequis (voir .github/workflows/ci.yml) :
 * base migrée et remplie par `pnpm --filter dashboard seed`, serveur sur
 * BASE_URL avec DASHBOARD_PASSWORD et TRAJEKT_REDACT=secrets,email.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { encodeOtlp } from './protobuf.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'e2e-password';
const sample = JSON.parse(readFileSync(new URL('../docs/assets/samples/otlp-sentry-triage.json', import.meta.url), 'utf8'));
// Le fichier d'exemple a des dates fixes : on le ramène à maintenant pour qu'il compte dans les 24 dernières heures.
{
  const spans = sample.resourceSpans.flatMap((rs) => rs.scopeSpans.flatMap((ss) => ss.spans));
  const last = spans.reduce((m, s) => (BigInt(s.endTimeUnixNano) > m ? BigInt(s.endTimeUnixNano) : m), 0n);
  const shift = BigInt(Date.now() - 60_000) * 1_000_000n - last;
  for (const s of spans) {
    s.startTimeUnixNano = String(BigInt(s.startTimeUnixNano) + shift);
    s.endTimeUnixNano = String(BigInt(s.endTimeUnixNano) + shift);
  }
}

let browser, page;
const problems = [];

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && problems.push(`console (${page.url()}): ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`page error (${page.url()}): ${e.message.slice(0, 160)}`));
});
after(async () => browser?.close());

/** Ouvre une page et vérifie qu'elle s'affiche sans erreur. */
async function visit(path, expectText) {
  problems.length = 0;
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  assert.equal(res.status(), 200, `${path} → HTTP ${res.status()}`);
  const body = await page.locator('body').innerText();
  assert.ok(!/Application error|This page could not be found|Internal Server Error/.test(body), `${path} : page en erreur\n${body.slice(0, 300)}`);
  if (expectText) assert.match(body, expectText, `${path} : contenu attendu absent`);
  // Laisse aux composants client le temps de s'hydrater.
  await page.waitForTimeout(200);
  assert.deepEqual(problems, [], `${path} : erreurs dans le navigateur`);
  return body;
}

test('connexion', async () => {
  const res = await page.goto(BASE + '/');
  assert.match(page.url(), /\/login/, 'non connecté : redirigé vers la connexion');
  assert.equal(res.status(), 200);
  await page.fill('input[name="password"]', 'wrong');
  await page.click('button[type="submit"]');
  await page.waitForURL(/error=1/);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + '/');
});

test('chaque page du projet de démo s’affiche sans erreur', async () => {
  await visit('/', /sentry-triage[\s\S]*Regressed/);
  await visit('/agents/sentry-triage', /Is it getting worse\?/);
  await visit('/agents/sentry-triage?dim=agent&compare=window', /Last 24 h vs previous 7 days/);
  await visit('/agents/sentry-triage?dim=prompt&compare=ab&a=v7&b=v8', /Prompt version/);
  await visit('/agents/sentry-triage?dim=model&compare=ab', /Model/);
  await visit('/agents/sentry-triage?dim=app&compare=version', /App version/);
  await visit('/agents/support-bot', /support-bot/);
  await visit('/agents/sentry-triage/evals', /FAIL[\s\S]*Scenario by scenario/);
  await visit('/agents/sentry-triage/evals?dim=prompt', /v8/);
  await visit('/runs', /Runs/);
  await visit('/runs?agent=sentry-triage&kind=eval', /eval ·/);
  await visit('/runs?agent=sentry-triage&loops=1&status=error', /Runs/);
  await visit('/projects', /Projects/);
  await visit('/explore', /Open a trace/);
});

test('un run : timeline interactive, comparaison, diff d’un scénario d’éval', async () => {
  await page.goto(BASE + '/runs?agent=sentry-triage&loops=1');
  const href = await page.locator('table a[href^="/runs/"]').first().getAttribute('href');
  await visit(href, /tool path:/);
  const rows = page.locator('.tl-row');
  assert.ok((await rows.count()) > 3);
  await rows.nth(2).click();
  assert.equal(await rows.nth(2).getAttribute('aria-pressed'), 'true');
  await visit(href + '/compare', /Compare runs[\s\S]*Step by step/);

  await page.goto(BASE + '/agents/sentry-triage/evals');
  const diff = await page.locator('a', { hasText: 'diff →' }).first().getAttribute('href');
  await visit(diff, /Compare runs/);
});

test('ouvrir un fichier de trace dans le navigateur', async () => {
  await visit('/explore');
  await page.setInputFiles('input[type="file"]', new URL('../docs/assets/samples/langfuse-support-bot.json', import.meta.url).pathname);
  await page.waitForSelector('.tl-row');
  assert.deepEqual(problems, []);
});

let ingestKey, readKey;

test('interface en français : sélecteur EN/FR, pages serveur et client', async () => {
  await page.goto(BASE + '/agents/sentry-triage');
  await page.click('.lang-switch');
  await page.waitForURL(BASE + '/agents/sentry-triage');
  assert.equal(await page.getAttribute('html', 'lang'), 'fr');
  await visit('/agents/sentry-triage', /Est-ce que ça se dégrade/);
  await visit('/', /En régression/);
  await visit('/agents/sentry-triage/evals', /Scénario par scénario/);
  await visit('/runs', /Tous les agents/);
  await visit('/explore', /Ouvrir une trace/);
  await page.setInputFiles('input[type="file"]', new URL('../docs/assets/samples/otlp-sentry-triage.json', import.meta.url).pathname);
  await page.waitForSelector('.tl-row');
  assert.match(await page.locator('body').innerText(), /BOÎTE NOIRE/);
  assert.deepEqual(problems, []);
  // Retour à l'anglais pour la suite.
  await page.click('.lang-switch');
  await visit('/', /Regressed/);
});

test('créer un projet, envoyer des traces (JSON et protobuf), des scores ; masquage', async () => {
  await visit('/projects');
  await page.fill('input[placeholder="checkout-agents"]', 'e2e');
  await page.click('button:has-text("Create")');
  await page.waitForSelector('text=shown only once');
  const keys = await page.locator('pre.code').allInnerTexts();
  [ingestKey, readKey] = keys.map((k) => k.trim());
  assert.match(ingestKey, /^tk_live_/);
  assert.match(readKey, /^tk_read_/);

  const auth = { Authorization: `Bearer ${ingestKey}` };
  // JSON, avec un email dans les arguments d'un outil (doit être masqué).
  const json = structuredClone(sample);
  const tool = json.resourceSpans[0].scopeSpans[0].spans.find((s) => s.attributes.some((a) => a.key === 'gen_ai.tool.name'));
  tool.attributes.push({ key: 'gen_ai.tool.call.arguments', value: { stringValue: JSON.stringify({ reporter: 'marie@client.fr' }) } });
  tool.attributes = tool.attributes.filter((a, i, all) => a.key !== 'gen_ai.tool.call.arguments' || i === all.length - 1);
  let res = await fetch(`${BASE}/v1/traces`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(json) });
  assert.equal(res.status, 201, await res.clone().text());
  const traceId = json.resourceSpans[0].scopeSpans[0].spans[0].traceId;

  // Protobuf : la même trace sous un autre traceId.
  const proto = structuredClone(sample);
  for (const s of proto.resourceSpans[0].scopeSpans[0].spans) s.traceId = 'ab'.repeat(16);
  res = await fetch(`${BASE}/v1/traces`, { method: 'POST', headers: { ...auth, 'content-type': 'application/x-protobuf' }, body: encodeOtlp(proto) });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'application/x-protobuf');

  // Score après coup.
  res = await fetch(`${BASE}/v1/scores`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ traceId, name: 'accepted', value: 0 }) });
  assert.equal(res.status, 201, await res.clone().text());

  // Lecture avec la clé de lecture : deux runs, le score, et l'email masqué.
  const runs = await (await fetch(`${BASE}/api/runs?limit=10`, { headers: { Authorization: `Bearer ${readKey}` } })).json();
  assert.equal(runs.items.length, 2);
  const scored = runs.items.find((r) => r.traceId === traceId);
  assert.deepEqual(scored.scores, { accepted: 0 });
  const detail = await (await fetch(`${BASE}/api/runs/${scored.id}`, { headers: { Authorization: `Bearer ${readKey}` } })).text();
  assert.ok(!detail.includes('marie@client.fr') && detail.includes('[email]'), 'email masqué avant stockage');

  // Le dashboard montre maintenant le projet e2e.
  await visit('/', /sentry-triage/);
  await visit(`/runs/${scored.id}`, /Score · accepted/);

  // La clé d'ingestion ne lit pas, la clé de lecture n'ingère pas.
  assert.equal((await fetch(`${BASE}/api/runs`, { headers: auth })).status, 401);
  assert.equal((await fetch(`${BASE}/v1/traces`, { method: 'POST', headers: { Authorization: `Bearer ${readKey}`, 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('MCP avec la clé de lecture', async () => {
  const call = (method, params) => fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${readKey}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json());
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'trajekt');
  const tools = await call('tools/list');
  assert.equal(tools.result.tools.length, 8);
  const agents = await call('tools/call', { name: 'list_agents', arguments: {} });
  assert.match(agents.result.content[0].text, /sentry-triage/);
});

test('revenir au projet de démo et se déconnecter', async () => {
  await visit('/projects', /e2e[\s\S]*current/);
  await page.locator('tr', { hasText: 'demo' }).locator('button:has-text("Open")').click();
  await page.waitForURL(BASE + '/');
  await visit('/', /Regressed/);
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/\/login/);
});
