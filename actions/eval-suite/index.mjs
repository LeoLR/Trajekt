// Trajekt eval suite — GitHub Action, sans dépendance (Node 24, fetch natif).
// Appelle GET /api/agents/:agent/evals, écrit le résumé du job, commente la PR
// et échoue si la suite régresse.

import { appendFileSync, readFileSync } from 'node:fs';

const input = (name, fallback = '') => {
  const v = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return v === undefined || v === '' ? fallback : v.trim();
};
const setOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const fail = (msg) => {
  console.log(`::error::${msg}`);
  process.exitCode = 1;
};

const LABELS = { agent: 'Agent version', prompt: 'Prompt version', app: 'App version', model: 'Model' };

export function pct(x) {
  return x === null || x === undefined ? '' : `${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;
}

function fmt(metric, v) {
  if (v === null || v === undefined) return '—';
  if (metric.startsWith('score:')) return v.toFixed(2);
  switch (metric) {
    case 'errorRate': case 'toolErrorRate': case 'newPathShare': return `${(v * 100).toFixed(1)}%`;
    case 'durationMs': return v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}s`;
    case 'costUsd': return `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`;
    case 'totalTokens': return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
    default: return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
}

function change(m) {
  if (m.metric === 'newPathShare' || m.delta === null || m.delta === undefined) return '';
  if (m.metric.startsWith('score:')) return `${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta).toFixed(2)}`;
  if (m.metric === 'errorRate' || m.metric === 'toolErrorRate') {
    return `${m.delta > 0 ? '+' : '−'}${(Math.abs(m.delta) * 100).toFixed(1)} pts`;
  }
  return m.relDelta === null || m.relDelta === undefined ? `${m.delta > 0 ? '+' : '−'}${fmt(m.metric, Math.abs(m.delta))}` : pct(m.relDelta);
}

const VERDICT = { regression: '🔴 regression', improvement: '🟢 better', stable: 'stable', insufficient: 'not enough data' };

function scenarioChanges(s) {
  return s.changes.map((c) => {
    if (c.metric === 'errorRate') return `**${c.label}** (${c.detail})`;
    if (c.metric.startsWith('score:')) return `**${c.label} ${fmt(c.metric, c.baseline)} → ${fmt(c.metric, c.current)}**`;
    if (c.metric === 'newPathShare') return 'tool path changed';
    if (c.relDelta !== null && c.relDelta !== undefined) return `${c.label} ${pct(c.relDelta)}`;
    return `${c.label} ${fmt(c.metric, c.baseline)} → ${fmt(c.metric, c.current)}`;
  }).join(', ');
}

/** Le rapport Markdown, partagé par le résumé du job et le commentaire. */
export function report(data, { url, agent, marker }) {
  const c = data.comparison;
  const dimLabel = LABELS[data.dimension] ?? data.dimension;
  const base = url.replace(/\/$/, '');
  const page = `${base}/agents/${encodeURIComponent(agent)}/evals?dim=${data.dimension}&a=${encodeURIComponent(data.a)}&b=${encodeURIComponent(data.b)}`;
  const lines = [marker];
  lines.push(`### ${c.result === 'fail' ? '❌' : '✅'} Trajekt eval suite — \`${agent}\` ${c.result.toUpperCase()}`);
  lines.push('');
  lines.push(`${dimLabel} \`${data.b}\` vs \`${data.a}\` · ${c.paired} scenarios compared · [open in Trajekt](${page})`);
  if (c.reasons.length) {
    lines.push('');
    for (const r of c.reasons) lines.push(`- ${r}`);
  }
  lines.push('', '| Metric | A | B | Change | Verdict |', '|---|--:|--:|--:|---|');
  for (const m of c.metrics) {
    // Un nouveau chemin d'outils est à regarder, jamais bloquant.
    const verdict = m.metric === 'newPathShare' && m.verdict === 'regression' ? '⚠️ changed' : VERDICT[m.verdict] ?? m.verdict;
    lines.push(`| ${m.label} | ${m.metric === 'newPathShare' ? '—' : fmt(m.metric, m.baseline)} | ${fmt(m.metric, m.current)} | ${change(m)} | ${verdict} |`);
  }
  const worse = c.scenarios.filter((s) => s.verdict === 'regression');
  const better = c.scenarios.filter((s) => s.verdict === 'improvement');
  const diff = (s) => {
    const r = data.sampleRuns?.[s.scenario];
    return r?.a && r?.b ? ` · [diff](${base}/runs/${r.b}/compare?with=${r.a})` : '';
  };
  if (worse.length) {
    lines.push('', `**Scenarios that got worse (${worse.length})**`, '');
    for (const s of worse.slice(0, 15)) lines.push(`- \`${s.scenario}\` — ${scenarioChanges(s)}${diff(s)}`);
    if (worse.length > 15) lines.push(`- … and ${worse.length - 15} more`);
  }
  if (better.length) {
    lines.push('', `<details><summary>Scenarios that got better (${better.length})</summary>`, '');
    for (const s of better) lines.push(`- \`${s.scenario}\` — ${scenarioChanges(s)}${diff(s)}`);
    lines.push('', '</details>');
  }
  if (c.onlyBaseline.length || c.onlyCurrent.length) {
    lines.push('');
    if (c.onlyBaseline.length) lines.push(`Only in A (not compared): ${c.onlyBaseline.map((x) => `\`${x}\``).join(', ')}  `);
    if (c.onlyCurrent.length) lines.push(`Only in B (not compared): ${c.onlyCurrent.map((x) => `\`${x}\``).join(', ')}`);
  }
  lines.push('', '<sub>Each scenario is compared with itself across the two versions (paired test across the suite, thresholds per scenario). A new tool path is shown but never fails the suite.</sub>');
  return { markdown: lines.join('\n'), page };
}

async function comment(markdown, marker) {
  const token = input('github-token');
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repo = process.env.GITHUB_REPOSITORY;
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  if (!token || !eventPath || !repo) return;
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const pr = event.pull_request?.number ?? event.issue?.number;
  if (!pr) {
    console.log('Not a pull request: no comment posted.');
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'trajekt-eval-suite' };
  let existing;
  for (let page = 1; page <= 10 && !existing; page++) {
    const res = await fetch(`${api}/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`, { headers });
    if (!res.ok) { console.log(`::warning::Could not list PR comments (${res.status}).`); return; }
    const list = await res.json();
    existing = list.find((c) => typeof c.body === 'string' && c.body.startsWith(marker));
    if (list.length < 100) break;
  }
  const res = existing
    ? await fetch(`${api}/repos/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', headers, body: JSON.stringify({ body: markdown }) })
    : await fetch(`${api}/repos/${repo}/issues/${pr}/comments`, { method: 'POST', headers, body: JSON.stringify({ body: markdown }) });
  if (!res.ok) console.log(`::warning::Could not comment on the pull request (${res.status}). Give the job "pull-requests: write" permission.`);
  else console.log(existing ? 'PR comment updated.' : 'PR comment posted.');
}

export async function main() {
  const url = input('url');
  const agent = input('agent');
  if (!url || !agent) return fail('Inputs "url" and "agent" are required.');
  const dimension = input('dimension', 'agent');
  const a = input('baseline');
  const b = input('candidate');
  const q = new URLSearchParams({ dimension });
  // L'API veut a et b ensemble ; avec un seul des deux, on complète à partir des valeurs connues.
  const key = input('read-key');
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const endpoint = `${url.replace(/\/$/, '')}/api/agents/${encodeURIComponent(agent)}/evals`;
  let res;
  if (a && b) {
    q.set('a', a);
    q.set('b', b);
  } else if (a || b) {
    res = await fetch(`${endpoint}?dimension=${dimension}`, { headers });
    if (!res.ok) return fail(await apiError(res));
    const known = (await res.json()).values.map((v) => v.value);
    const pickedA = a || known.find((v) => v !== b);
    const pickedB = b || known.find((v) => v !== a);
    if (!pickedA || !pickedB) return fail(`Need two evaluated values of ${dimension} for ${agent}; found: ${known.join(', ') || 'none'}.`);
    q.set('a', pickedA);
    q.set('b', pickedB);
  }
  res = await fetch(`${endpoint}?${q}`, { headers });
  if (!res.ok) return fail(await apiError(res));
  const data = await res.json();
  if (!data.comparison) {
    return fail(`Only one ${dimension} evaluated for ${agent} so far (${data.values.map((v) => v.value).join(', ') || 'none'}): nothing to compare.`);
  }

  const marker = `<!-- trajekt-eval-suite:${agent}:${dimension} -->`;
  const { markdown, page } = report(data, { url, agent, marker });
  console.log(markdown.replace(marker + '\n', ''));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  setOutput('result', data.comparison.result);
  setOutput('report-url', page);
  if (input('comment', 'true') !== 'false') await comment(markdown, marker);

  if (data.comparison.result === 'fail' && input('fail-on-regression', 'true') !== 'false') {
    fail(`Eval suite regressed: ${data.comparison.reasons.join('; ')}`);
  }
}

async function apiError(res) {
  let msg = `Trajekt answered ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error?.message) msg += `: ${body.error.message}`;
  } catch {}
  if (res.status === 401) msg += ' — check the read-key input (tk_read_…).';
  return msg;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(e?.stack ?? String(e)));
}
