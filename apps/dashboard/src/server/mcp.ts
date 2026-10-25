/**
 * Serveur MCP (Model Context Protocol) de Trajekt — lecture seule.
 *
 * Principe : un agent IA ne reçoit jamais de spans bruts. Chaque outil
 * renvoie une réponse déjà calculée par Trajekt (verdicts statistiques,
 * résumé du run, différences), en texte court lisible par un LLM, plus
 * la même chose en JSON structuré (structuredContent).
 *
 * Transport : "Streamable HTTP" sans état, réponses JSON (pas de SSE).
 * Implémenté à la main : le protocole utile ici tient en quatre méthodes
 * (initialize, tools/list, tools/call, ping).
 */

import { METRIC_LABELS, annotateSteps, type Comparison, type TrajectoryStep } from '@trajekt/core';
import type { Db } from './db';
import {
  DIMENSIONS, agentVersions, compareLatestVersions, compareRecentWindow, compareValues,
  getRun, isDimension, listRuns, type ComparisonResult, type Dimension, type RunSummary,
} from './queries';
import { loadAgentsPage, loadComparePage } from './pages';
import { recentAlerts } from './alerts';
import { loadSuitePage, suiteValues } from './suites';
import { formatCost, formatDelta, formatDuration, formatMetric, formatPercent } from '../lib/format';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'trajekt', version: '0.1.0' };

const INSTRUCTIONS = `Trajekt records the runs of AI agents and compares them over time.
Start with list_agents to see which agents exist and whether any regressed.
To answer "did version X make it worse?", use compare with a dimension (app, agent, prompt or model).
Runs tagged with a scenario come from eval suites (mocked data, dev or CI): use compare_eval_suite for those.
To explain one run, use find_runs then explain_run. All tools are read-only.
Numbers are already computed: report them, do not recompute them.`;

/* ------------------------------------------------------------------ */
/* Outils                                                               */
/* ------------------------------------------------------------------ */

interface ToolContext {
  db: Db;
  projectId: string;
  now: Date;
}

interface ToolResult {
  text: string;
  data: unknown;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

class ToolInputError extends Error {}

const DIM_ENUM = Object.keys(DIMENSIONS);
const HEALTH_TEXT = {
  regressed: 'REGRESSED',
  healthy: 'healthy',
  insufficient: 'not enough runs in the last 24 h to compare (20 needed)',
  idle: 'no runs in the last 24 h',
} as const;
const DIM_NAME: Record<Dimension, string> = { app: 'app version', agent: 'agent version', prompt: 'prompt version', model: 'model' };

function str(args: Record<string, unknown>, key: string, required = false): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ToolInputError(`"${key}" must be a string.`);
  return v;
}

function dimension(args: Record<string, unknown>): Dimension {
  const d = str(args, 'dimension') ?? 'agent';
  if (!isDimension(d)) throw new ToolInputError(`"dimension" must be one of ${DIM_ENUM.join(', ')}.`);
  return d;
}

function comparisonLine(c: Comparison): string {
  const verdict = c.verdict === 'regression' ? `REGRESSION (${c.severity})`
    : c.verdict === 'improvement' ? 'improvement'
    : c.verdict === 'insufficient' ? 'not enough data' : 'stable';
  const values = c.baseline === null && c.current === null
    ? ''
    : `${formatMetric(c.metric, c.baseline)} → ${formatMetric(c.metric, c.current)} (${formatDelta(c.metric, c.delta, c.relDelta)})`;
  return `- ${METRIC_LABELS[c.metric]}: ${values} — ${verdict}${c.detail && c.verdict === 'regression' ? `. ${c.detail}` : ''}`;
}

function comparisonText(agent: string, r: ComparisonResult): string {
  const what = r.mode === 'window'
    ? `${agent}: ${r.currentLabel} (${r.currentRuns} runs) vs ${r.baselineLabel} (${r.baselineRuns} runs)`
    : `${agent}, ${DIM_NAME[r.dimension ?? 'agent']}: B = ${r.currentLabel} (${r.currentRuns} runs) vs A = ${r.baselineLabel} (${r.baselineRuns} runs)`;
  const reg = r.comparisons.filter((c) => c.verdict === 'regression');
  const head = reg.length
    ? `${reg.length} regression${reg.length > 1 ? 's' : ''} found.`
    : r.comparisons.every((c) => c.verdict === 'insufficient')
      ? 'Not enough runs to conclude (need 20 on each side).'
      : 'No regression found.';
  return [what, head, ...r.comparisons.map(comparisonLine)].join('\n');
}

function runLine(r: RunSummary): string {
  const flags = [
    r.redundantToolCalls ? `${r.redundantToolCalls} repeated call${r.redundantToolCalls > 1 ? 's' : ''}` : null,
    r.retryCount ? `${r.retryCount} retr${r.retryCount > 1 ? 'ies' : 'y'}` : null,
    r.toolErrorCount ? `${r.toolErrorCount} tool error${r.toolErrorCount > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  const versions = [r.appVersion && r.appVersion !== r.agentVersion ? `app ${r.appVersion}` : null, r.agentVersion ? `agent ${r.agentVersion}` : null, r.promptVersion ? `prompt ${r.promptVersion}` : null, r.primaryModel].filter(Boolean).join(', ');
  const scenario = r.scenario ? ` · scenario ${r.scenario}` : '';
  return `- ${r.id} · ${r.startedAt.slice(0, 16).replace('T', ' ')} UTC · ${r.status === 'ok' ? 'ok' : 'FAILED'} · ${formatDuration(r.durationMs)} · ${formatCost(r.costUsd, r.costEstimated)} · ${r.stepCount} steps · ${versions}${scenario}${flags.length ? ` · ${flags.join(', ')}` : ''}`;
}

function stepName(s: TrajectoryStep): string {
  if (s.type === 'tool_call') return s.name;
  if (s.type === 'llm_call') return `LLM ${s.model ?? ''}`.trim();
  if (s.type === 'custom') return s.kind;
  return s.type;
}

function short(v: unknown, max = 160): string {
  if (v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export const TOOLS: Tool[] = [
  {
    name: 'list_agents',
    title: 'List agents',
    description: 'Every agent with its latest versions, activity and health over the last 24 hours, and the regressions currently detected. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run(_args, { db, projectId, now }) {
      const page = await loadAgentsPage(db, projectId, now);
      const evalText = page.evals.length
        ? '\nEval suites (compare_eval_suite):\n' + page.evals.map((e) =>
            `- ${e.name}: ${e.scenarios} scenarios, ${e.result ? `${e.result.toUpperCase()} — ${e.b} vs ${e.a}` : 'one version evaluated so far'}${e.reasons.length ? ` (${e.reasons.join('; ')})` : ''}`,
          ).join('\n')
        : '';
      if (!page.agents.length) {
        return { text: (page.evals.length ? 'No production runs yet.' : 'No agent has sent runs yet.') + evalText, data: { agents: [], evalSuites: page.evals } };
      }
      const data = page.agents.map(({ agent, health, findings }) => ({
        name: agent.name,
        health,
        latestAgentVersion: agent.latestVersion,
        lastRunAt: agent.lastSeen,
        runs24h: agent.runs24h,
        failureRate24h: agent.errorRate24h,
        p50DurationMs24h: agent.p50DurationMs24h,
        meanCostUsd24h: agent.avgCostUsd24h,
        regressions: findings.map((f) => ({ metric: f.metric, label: METRIC_LABELS[f.metric], severity: f.severity, baseline: f.baseline, current: f.current, comparedAs: f.scope })),
      }));
      const text = page.agents.map(({ agent, health, findings }) => {
        const head = `${agent.name} — ${HEALTH_TEXT[health]}${agent.latestVersion ? `, agent ${agent.latestVersion}` : ''} · last 24 h: ${agent.runs24h} runs, ${formatPercent(agent.errorRate24h)} failed, p50 ${formatDuration(agent.p50DurationMs24h)}, mean cost ${formatCost(agent.avgCostUsd24h)}`;
        const lines = findings.map((f) => `  - ${METRIC_LABELS[f.metric]}: ${formatMetric(f.metric, f.baseline)} → ${formatMetric(f.metric, f.current)} (${f.severity}, ${f.scope})`);
        return [head, ...lines].join('\n');
      }).join('\n') + evalText;
      return { text, data: { now: now.toISOString(), agents: data, evalSuites: page.evals } };
    },
  },
  {
    name: 'list_versions',
    title: 'List versions',
    description: 'Values of one dimension for an agent (app versions, agent versions, prompt versions or models), newest first, with runs, failure rate, median duration, mean cost and repeated tool calls for each.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name, as returned by list_agents.' },
        dimension: { type: 'string', enum: DIM_ENUM, description: 'Default: agent.' },
      },
      required: ['agent'],
      additionalProperties: false,
    },
    async run(args, { db, projectId }) {
      const agent = str(args, 'agent', true)!;
      const dim = dimension(args);
      const versions = await agentVersions(db, projectId, agent, dim);
      if (!versions.length) return { text: `No runs for agent "${agent}".`, data: { agent, dimension: dim, versions: [] } };
      const text = [`${agent} — ${DIM_NAME[dim]}s, newest first:`, ...versions.map((v) =>
        `- ${v.version ?? '(none)'}: ${v.runs} runs since ${v.firstSeen.slice(0, 10)}, ${formatPercent(v.errorRate)} failed, p50 ${formatDuration(v.p50DurationMs)}, mean cost ${formatCost(v.avgCostUsd)}, ${v.avgSteps.toFixed(1)} steps, ${v.avgRedundantToolCalls.toFixed(2)} repeated calls/run`,
      )].join('\n');
      return { text, data: { agent, dimension: dim, versions } };
    },
  },
  {
    name: 'compare',
    title: 'Compare versions or periods',
    description: 'Is B worse than A? Compares two groups of runs of one agent on failure rate, failed tool calls, duration, cost, steps, tokens, repeated tool calls and new tool paths, with a statistical verdict per metric. Give a and b to compare two values of a dimension (e.g. prompt v7 vs v8); omit them to compare the latest value with the previous one; or set mode to "window" to compare the last 24 hours with the 7 days before.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        dimension: { type: 'string', enum: DIM_ENUM, description: 'What differs between A and B. Default: agent.' },
        a: { type: 'string', description: 'Baseline value (e.g. "v7", "1.4.0", "claude-sonnet-4-5").' },
        b: { type: 'string', description: 'Value to evaluate against the baseline.' },
        mode: { type: 'string', enum: ['versions', 'window'], description: 'Default: versions.' },
      },
      required: ['agent'],
      additionalProperties: false,
    },
    async run(args, { db, projectId, now }) {
      const agent = str(args, 'agent', true)!;
      const dim = dimension(args);
      const a = str(args, 'a');
      const b = str(args, 'b');
      const mode = str(args, 'mode') ?? 'versions';
      let result: ComparisonResult | null;
      if (mode === 'window') {
        result = await compareRecentWindow(db, projectId, agent, { now });
      } else if (a || b) {
        if (!a || !b) throw new ToolInputError('Give both "a" and "b", or neither.');
        const known = (await agentVersions(db, projectId, agent, dim)).map((v) => v.version);
        for (const v of [a, b]) {
          if (!known.includes(v)) throw new ToolInputError(`Unknown ${DIM_NAME[dim]} "${v}" for ${agent}. Known: ${known.filter(Boolean).join(', ') || 'none'}.`);
        }
        result = await compareValues(db, projectId, agent, dim, a, b);
      } else {
        result = await compareLatestVersions(db, projectId, agent, { dimension: dim });
        if (!result) return { text: `${agent} has fewer than two ${DIM_NAME[dim]}s to compare. Try mode "window".`, data: null };
      }
      return { text: comparisonText(agent, result), data: result };
    },
  },
  {
    name: 'compare_eval_suite',
    title: 'Compare eval suites',
    description: 'For runs tagged with a scenario (an eval suite run on mocked data, in dev or CI): compares two versions scenario by scenario. Returns PASS or FAIL with the reasons, the suite-level verdict on each metric (paired test, works with a handful of scenarios), and the scenarios that got worse with what changed. Without a and b: the latest value against the previous one.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        dimension: { type: 'string', enum: DIM_ENUM, description: 'What differs between A and B. Default: agent.' },
        a: { type: 'string', description: 'Baseline value.' },
        b: { type: 'string', description: 'Value to evaluate against the baseline.' },
      },
      required: ['agent'],
      additionalProperties: false,
    },
    async run(args, { db, projectId }) {
      const agent = str(args, 'agent', true)!;
      const dim = dimension(args);
      const a = str(args, 'a');
      const b = str(args, 'b');
      if ((a && !b) || (b && !a)) throw new ToolInputError('Give both "a" and "b", or neither.');
      const known = (await suiteValues(db, projectId, agent, dim)).map((v) => v.value);
      for (const v of [a, b]) {
        if (v && !known.includes(v)) throw new ToolInputError(`No eval run of ${agent} with ${DIM_NAME[dim]} "${v}". Evaluated: ${known.join(', ') || 'none'}.`);
      }
      const page = await loadSuitePage(db, projectId, agent, { dimension: dim, a, b });
      if (!page) throw new ToolInputError(`${agent} has no eval runs (runs tagged with trajekt.scenario).`);
      const c = page.comparison;
      if (!c) return { text: `${agent}: only one ${DIM_NAME[dim]} evaluated so far (${known.join(', ') || 'none'}).`, data: page };
      const worse = c.scenarios.filter((s) => s.verdict === 'regression');
      const better = c.scenarios.filter((s) => s.verdict === 'improvement');
      const changeLine = (s: (typeof c.scenarios)[number]) => `  - ${s.scenario}: ` + s.changes.map((ch) =>
        ch.metric === 'errorRate' || ch.metric === 'newPathShare' ? `${ch.label} (${ch.detail})`
          : ch.relDelta !== null ? `${ch.label} ${ch.relDelta > 0 ? '+' : ''}${Math.round(ch.relDelta * 100)}%`
          : `${ch.label} ${formatMetric(ch.metric, ch.baseline)} → ${formatMetric(ch.metric, ch.current)}`,
      ).join(', ');
      const text = [
        `${agent} eval suite — ${DIM_NAME[dim]} ${page.b} vs ${page.a}: ${c.result.toUpperCase()} (${c.paired} scenarios compared)`,
        ...c.reasons.map((r) => `  reason: ${r}`),
        'Across the suite:',
        ...c.metrics.map((m) => `  - ${METRIC_LABELS[m.metric]}: ${m.verdict === 'insufficient' ? `not enough data (${m.detail})` : `${formatMetric(m.metric, m.baseline)} → ${formatMetric(m.metric, m.current)}${m.metric === 'newPathShare' ? '' : ` (${formatDelta(m.metric, m.delta, m.relDelta)})`}, ${m.verdict}${m.severity ? ` (${m.severity})` : ''}`}`),
        worse.length ? `Scenarios that got worse (${worse.length}):` : 'No scenario got worse.',
        ...worse.map(changeLine),
        ...(better.length ? [`Scenarios that got better (${better.length}):`, ...better.map(changeLine)] : []),
        ...(c.onlyBaseline.length ? [`Only in A, not compared: ${c.onlyBaseline.join(', ')}`] : []),
        ...(c.onlyCurrent.length ? [`Only in B, not compared: ${c.onlyCurrent.join(', ')}`] : []),
        'Use find_runs with scenario and agent_version to get run ids, then diff_runs to see where a scenario diverged.',
      ].join('\n');
      return { text, data: { agent, dimension: dim, a: page.a, b: page.b, ...c, sampleRuns: page.sampleRuns } };
    },
  },
  {
    name: 'get_regressions',
    title: 'Get regressions',
    description: 'Regressions detected right now (latest versions vs previous ones, last 24 h vs the 7 days before), plus the alerts already sent. Optionally for one agent.',
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', description: 'Limit to one agent.' } },
      additionalProperties: false,
    },
    async run(args, { db, projectId, now }) {
      const only = str(args, 'agent');
      const page = await loadAgentsPage(db, projectId, now);
      const agents = page.agents.filter((a) => !only || a.agent.name === only);
      if (only && !agents.length) throw new ToolInputError(`Unknown agent "${only}".`);
      const alerts = await recentAlerts(db, projectId, { agent: only, limit: 10 });
      const regressed = agents.filter((a) => a.findings.length);
      const lines = regressed.length
        ? regressed.flatMap(({ agent, findings }) => [
            `${agent.name}:`,
            ...findings.map((f) => `  - ${METRIC_LABELS[f.metric]}: ${formatMetric(f.metric, f.baseline)} → ${formatMetric(f.metric, f.current)} (${formatDelta(f.metric, f.delta, f.relDelta)}, ${f.severity}) — ${f.scope}`),
          ])
        : [`No regression detected${only ? ` for ${only}` : ''}.`];
      if (alerts.length) {
        lines.push('', 'Alerts sent:', ...alerts.map((a) => `- ${a.createdAt.slice(0, 16).replace('T', ' ')} UTC · ${a.agentName} · ${METRIC_LABELS[a.metric]} (${a.severity}) · ${a.currentLabel} vs ${a.baselineLabel}`));
      }
      return {
        text: lines.join('\n'),
        data: {
          regressions: regressed.map(({ agent, findings }) => ({ agent: agent.name, findings })),
          alerts,
        },
      };
    },
  },
  {
    name: 'find_runs',
    title: 'Find runs',
    description: 'Most recent runs matching filters, newest first, one line each (id, time, status, duration, cost, steps, versions, flags). Use the id with explain_run or diff_runs.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        status: { type: 'string', enum: ['ok', 'error'] },
        app_version: { type: 'string' },
        agent_version: { type: 'string' },
        prompt_version: { type: 'string' },
        model: { type: 'string' },
        scenario: { type: 'string', description: 'Eval scenario name.' },
        kind: { type: 'string', enum: ['live', 'eval'], description: 'live: production runs only; eval: eval suite runs only. Default: both.' },
        repeated_tool_calls_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Default 10.' },
      },
      additionalProperties: false,
    },
    async run(args, { db, projectId }) {
      const status = str(args, 'status');
      if (status && status !== 'ok' && status !== 'error') throw new ToolInputError('"status" must be ok or error.');
      const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 25);
      const page = await listRuns(db, projectId, {
        agent: str(args, 'agent'),
        status: status as 'ok' | 'error' | undefined,
        appVersion: str(args, 'app_version'),
        version: str(args, 'agent_version'),
        promptVersion: str(args, 'prompt_version'),
        model: str(args, 'model'),
        scenario: str(args, 'scenario'),
        kind: (() => {
          const k = str(args, 'kind');
          if (k && k !== 'live' && k !== 'eval') throw new ToolInputError('"kind" must be live or eval.');
          return k as 'live' | 'eval' | undefined;
        })(),
        loopsOnly: args.repeated_tool_calls_only === true,
        limit,
      });
      return {
        text: page.items.length ? page.items.map(runLine).join('\n') : 'No run matches these filters.',
        data: { runs: page.items },
      };
    },
  },
  {
    name: 'explain_run',
    title: 'Explain a run',
    description: 'What one run did and what went wrong: status, versions, duration, cost, tool path, and the steps that failed, were retried or repeated an earlier call, with their arguments and errors.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string', description: 'Run id from find_runs.' } },
      required: ['run_id'],
      additionalProperties: false,
    },
    async run(args, { db, projectId }) {
      const id = str(args, 'run_id', true)!;
      const run = await getRun(db, projectId, id);
      if (!run) throw new ToolInputError(`No run with id "${id}".`);
      const s = run.summary;
      const ann = annotateSteps(run.trajectory);
      const notable = run.trajectory.steps
        .map((step, i) => ({ step, a: ann[i] }))
        .filter(({ a }) => a && (a.error || a.attempt !== undefined || a.repeatOf !== undefined));
      const lines = [
        runLine(s).slice(2),
        `Tool path: ${s.pathSignature}`,
        notable.length ? 'Notable steps:' : 'Nothing notable: no failed, retried or repeated step.',
        ...notable.map(({ step, a }) => {
          const what = [
            a.error ? `failed: ${short(a.error, 80)}` : null,
            a.attempt !== undefined ? `attempt ${a.attempt} after a failure` : null,
            a.repeatOf !== undefined ? `same tool and arguments as step #${a.repeatOf + 1}` : null,
          ].filter(Boolean).join('; ');
          const args = step.type === 'tool_call' && step.args !== undefined ? ` args=${short(step.args)}` : '';
          return `- #${step.index + 1} ${stepName(step)}: ${what}${args}`;
        }),
      ];
      return {
        text: lines.join('\n'),
        data: {
          run: s,
          notableSteps: notable.map(({ step, a }) => ({
            index: step.index, type: step.type, name: stepName(step), error: a.error ?? null,
            attempt: a.attempt ?? null, repeatOf: a.repeatOf ?? null,
            args: step.type === 'tool_call' ? step.args ?? null : null,
          })),
        },
      };
    },
  },
  {
    name: 'diff_runs',
    title: 'Diff two runs',
    description: 'Aligns two runs step by step and says what changed (added, missing or changed steps) and which configuration differs (app, agent, prompt version, model). Without with_run_id, compares with the latest successful run of the previous agent version.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'The run to explain (B).' },
        with_run_id: { type: 'string', description: 'Baseline run (A). Optional.' },
      },
      required: ['run_id'],
      additionalProperties: false,
    },
    async run(args, { db, projectId }) {
      const id = str(args, 'run_id', true)!;
      const cmp = await loadComparePage(db, projectId, id, str(args, 'with_run_id'));
      if (!cmp) throw new ToolInputError(`Cannot compare run "${id}": not found, or no baseline run.`);
      const A = cmp.a.summary;
      const B = cmp.b.summary;
      const config = ([
        ['app version', A.appVersion, B.appVersion],
        ['agent version', A.agentVersion, B.agentVersion],
        ['prompt version', A.promptVersion, B.promptVersion],
        ['model', A.primaryModel, B.primaryModel],
      ] as const).filter(([, x, y]) => (x ?? '') !== (y ?? ''));
      const changed = cmp.diff.rows.filter((r) => r.mark !== '=');
      const lines = [
        `A = ${A.id} (${A.status}), B = ${B.id} (${B.status})`,
        `Steps ${A.stepCount} → ${B.stepCount}, cost ${formatCost(A.costUsd)} → ${formatCost(B.costUsd)}, duration ${formatDuration(A.durationMs)} → ${formatDuration(B.durationMs)}`,
        config.length ? `Configuration changes: ${config.map(([k, x, y]) => `${k} ${x ?? '—'} → ${y ?? '—'}`).join('; ')}` : 'Same configuration.',
        `Aligned steps: ${cmp.diff.counts['=']} same, ${cmp.diff.counts['≠']} changed, ${cmp.diff.counts['+']} only in B, ${cmp.diff.counts['−']} only in A.`,
        ...changed.slice(0, 15).map((r) => {
          const name = stepName((r.b ?? r.a)!);
          if (r.mark === '+') return `+ only in B: ${name}${r.b && 'error' in r.b && r.b.error ? ` (failed: ${short(r.b.error, 60)})` : ''}`;
          if (r.mark === '−') return `− only in A: ${name}`;
          return `≠ ${name}: ${r.changes?.join(', ')} changed`;
        }),
      ];
      return { text: lines.join('\n'), data: { a: A, b: B, configChanges: config, diff: { counts: cmp.diff.counts, rows: changed.map((r) => ({ mark: r.mark, a: r.a ? stepName(r.a) : null, b: r.b ? stepName(r.b) : null, changes: r.changes ?? null })) } } };
    },
  },
];

/* ------------------------------------------------------------------ */
/* JSON-RPC                                                              */
/* ------------------------------------------------------------------ */

type Id = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: Id; method: string; params?: Record<string, unknown> }
type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id; error: { code: number; message: string } };

const err = (id: Id, code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleOne(msg: unknown, ctx: () => Promise<ToolContext>): Promise<JsonRpcResponse | null> {
  if (typeof msg !== 'object' || msg === null || (msg as JsonRpcRequest).jsonrpc !== '2.0' || typeof (msg as JsonRpcRequest).method !== 'string') {
    return err(null, -32600, 'Invalid request');
  }
  const req = msg as JsonRpcRequest;
  const isNotification = req.id === undefined;
  const id = req.id ?? null;

  switch (req.method) {
    case 'initialize': {
      const asked = String(req.params?.protocolVersion ?? '');
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case 'ping':
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
            name, title, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false },
          })),
        },
      };
    case 'tools/call': {
      const name = String(req.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(id, -32602, `Unknown tool: ${name}`);
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const out = await tool.run(args, await ctx());
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: out.text }],
            ...(out.data && typeof out.data === 'object' && !Array.isArray(out.data) ? { structuredContent: out.data } : {}),
            isError: false,
          },
        };
      } catch (e) {
        // Erreur d'usage : renvoyée à l'agent pour qu'il corrige son appel.
        if (e instanceof ToolInputError) {
          return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } };
        }
        throw e;
      }
    }
    default:
      if (req.method.startsWith('notifications/')) return null;
      return isNotification ? null : err(id, -32601, `Method not found: ${req.method}`);
  }
}

/**
 * Traite un corps JSON-RPC (message seul ou lot). Renvoie null quand il
 * n'y a rien à répondre (notifications uniquement → HTTP 202).
 */
export async function handleMcp(body: unknown, ctx: () => Promise<ToolContext>): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m, ctx)))).filter((r): r is JsonRpcResponse => r !== null);
    return out.length ? out : null;
  }
  return handleOne(body, ctx);
}
