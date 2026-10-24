/**
 * Générateur de trafic réaliste, pour la démo (`pnpm seed`) et les tests.
 *
 * Deux agents :
 *   - sentry-triage (OTLP) : v1.4.0 stable, puis v1.5.0 déployée il y a
 *     deux jours, qui boucle sur gitlab.searchCode, consomme plus et
 *     échoue plus souvent (422 sur la création de MR). C'est la
 *     régression que le dashboard doit faire apparaître.
 *   - support-bot (Langfuse) : stable, pour montrer qu'un agent sain ne
 *     déclenche rien.
 *
 * Chaque run OTLP est envoyé en DEUX lots (enfants puis racine), comme
 * le fait un BatchSpanProcessor : la fusion est exercée à chaque run.
 * Aléatoire à graine fixe : mêmes données à chaque exécution.
 */

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const hex = (r: Rand, len: number) =>
  Array.from({ length: len }, () => Math.floor(r() * 16).toString(16)).join('');
const between = (r: Rand, a: number, b: number) => a + (b - a) * r();
const sv = (stringValue: string) => ({ stringValue });
const iv = (n: number) => ({ intValue: String(Math.round(n)) });

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: unknown }>;
  status: { code: number; message?: string };
  events: unknown[];
}

class RunBuilder {
  spans: Span[] = [];
  t: number;
  constructor(private r: Rand, readonly traceId: string, readonly rootId: string, readonly start: number) {
    this.t = start + between(r, 5, 30);
  }
  private push(name: string, durMs: number, attrs: Record<string, unknown>, error?: string) {
    const s = this.t;
    const e = s + durMs;
    this.spans.push({
      traceId: this.traceId,
      spanId: hex(this.r, 16),
      parentSpanId: this.rootId,
      name,
      startTimeUnixNano: String(BigInt(Math.round(s * 1000)) * 1000n),
      endTimeUnixNano: String(BigInt(Math.round(e * 1000)) * 1000n),
      attributes: Object.entries(attrs).map(([key, value]) => ({ key, value })),
      status: error ? { code: 2, message: error } : { code: 0 },
      events: [],
    });
    this.t = e + between(this.r, 5, 40);
  }
  llm(model: string, inT: number, outT: number, durMs: number) {
    this.push(`chat ${model}`, durMs, {
      'gen_ai.operation.name': sv('chat'),
      'gen_ai.request.model': sv(model),
      'gen_ai.usage.input_tokens': iv(inT),
      'gen_ai.usage.output_tokens': iv(outT),
    });
  }
  tool(name: string, args: unknown, durMs: number, error?: string, result?: unknown) {
    this.push(`execute_tool ${name}`, durMs, {
      'gen_ai.operation.name': sv('execute_tool'),
      'gen_ai.tool.name': sv(name),
      'gen_ai.tool.call.arguments': sv(JSON.stringify(args)),
      ...(result !== undefined ? { 'gen_ai.tool.call.result': sv(JSON.stringify(result)) } : {}),
    }, error);
  }
  root(agent: string, error?: string): Span {
    return {
      traceId: this.traceId,
      spanId: this.rootId,
      parentSpanId: '',
      name: `invoke_agent ${agent}`,
      startTimeUnixNano: String(BigInt(Math.round(this.start * 1000)) * 1000n),
      endTimeUnixNano: String(BigInt(Math.round(this.t * 1000)) * 1000n),
      attributes: [
        { key: 'gen_ai.operation.name', value: sv('invoke_agent') },
        { key: 'gen_ai.agent.name', value: sv(agent) },
      ],
      status: error ? { code: 2, message: error } : { code: 0 },
      events: [],
    };
  }
}

function otlp(spans: Span[], service: string, version: string) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: sv(service) },
            { key: 'service.version', value: sv(version) },
            { key: 'deployment.environment.name', value: sv('production') },
          ],
        },
        scopeSpans: [{ scope: { name: 'trajekt-demo' }, spans }],
      },
    ],
  };
}

const ISSUES = ['PAY-1432', 'PAY-1440', 'CHK-219', 'CHK-233', 'AUTH-88', 'SRCH-412'];
const FILES = ['checkout/payment.ts', 'checkout/discount.ts', 'auth/session.ts', 'search/indexer.ts'];

/** Un run de sentry-triage, sous forme de deux payloads OTLP (enfants, puis racine). */
export function sentryTriageRun(r: Rand, startMs: number, version: '1.4.0' | '1.5.0'): unknown[] {
  const b = new RunBuilder(r, hex(r, 32), hex(r, 16), startMs);
  const regressed = version === '1.5.0';
  const model = 'claude-sonnet-4-5';
  const issue = ISSUES[Math.floor(r() * ISSUES.length)];
  const file = FILES[Math.floor(r() * FILES.length)];

  b.llm(model, between(r, 1800, 2600), between(r, 150, 300), between(r, 1800, 3200));
  b.tool('sentry.getIssue', { id: issue }, between(r, 250, 500), undefined, { id: issue, count: Math.floor(between(r, 3, 80)) });
  b.llm(model, between(r, 2600, 3400), between(r, 200, 400), between(r, 1500, 2800));
  b.tool('gitlab.searchCode', { query: file, scope: 'blobs' }, between(r, 600, 1100));

  if (regressed && r() < 0.65) {
    // La régression : la v1.5 relance la même recherche au lieu de lire le fichier.
    const loops = r() < 0.4 ? 2 : 1;
    for (let i = 0; i < loops; i++) {
      b.llm(model, between(r, 3600, 4800), between(r, 300, 500), between(r, 2500, 4200));
      b.tool('gitlab.searchCode', { query: file, scope: 'blobs' }, between(r, 600, 1000));
    }
  }
  b.tool('gitlab.readFile', { path: file }, between(r, 200, 450));
  b.llm(model, between(r, 4200, 5600), between(r, 400, 700), between(r, 3000, 5200));

  // Jira : 429 occasionnels, rattrapés par un retry.
  const jiraRetries = r() < (regressed ? 0.12 : 0.06) ? (r() < 0.5 ? 2 : 1) : 0;
  for (let i = 0; i < jiraRetries; i++) b.tool('jira.createIssue', { project: issue.split('-')[0], summary: `Fix ${file}` }, between(r, 300, 700), '429 Too Many Requests');
  b.tool('jira.createIssue', { project: issue.split('-')[0], summary: `Fix ${file}` }, between(r, 400, 900), undefined, { key: `${issue.split('-')[0]}-${Math.floor(between(r, 1000, 2000))}` });

  let rootError: string | undefined;
  if (regressed && r() < 0.14) {
    b.llm(model, between(r, 5000, 7000), between(r, 600, 900), between(r, 4000, 9000));
    b.tool('gitlab.createMergeRequest', { source: `fix/${issue.toLowerCase()}`, target: 'main' }, between(r, 400, 600), '422 Unprocessable Entity');
    rootError = 'Merge request rejected (422)';
  } else if (!regressed && r() < 0.025) {
    rootError = 'Sentry issue not found';
  }
  b.tool('slack.postMessage', { channel: '#backend-alerts' }, between(r, 150, 300));

  const children = b.spans;
  const cut = Math.max(1, Math.floor(children.length * between(r, 0.4, 0.8)));
  return [
    otlp(children.slice(0, cut), 'sentry-triage', version),
    otlp([...children.slice(cut), b.root('sentry-triage', rootError)], 'sentry-triage', version),
  ];
}

/** Un run de support-bot, au format d'export Langfuse. */
export function supportBotRun(r: Rand, startMs: number): unknown {
  const t = (ms: number) => new Date(startMs + ms).toISOString();
  const id = `lf-${hex(r, 12)}`;
  const d1 = between(r, 900, 1800);
  const d2 = between(r, 150, 400);
  const d3 = between(r, 700, 1500);
  const failed = r() < 0.03;
  return {
    id,
    name: 'support-bot',
    release: 'v2.1.0',
    environment: 'production',
    timestamp: t(0),
    observations: [
      { id: `${id}-1`, type: 'GENERATION', name: 'route', model: 'gpt-4o-mini', startTime: t(0), endTime: t(d1), usage: { input: Math.round(between(r, 700, 1100)), output: Math.round(between(r, 40, 90)) }, calculatedTotalCost: between(r, 0.0002, 0.0004), input: [{ role: 'user', content: 'Where is my order?' }], output: { role: 'assistant', content: 'Let me check.' } },
      { id: `${id}-2`, type: 'TOOL', name: 'orders.lookup', startTime: t(d1 + 20), endTime: t(d1 + 20 + d2), input: { orderId: Math.floor(between(r, 1000, 9999)) }, output: { status: 'shipped' }, level: failed ? 'ERROR' : 'DEFAULT', statusMessage: failed ? 'orders API timeout' : undefined },
      { id: `${id}-3`, type: 'GENERATION', name: 'answer', model: 'gpt-4o-mini', startTime: t(d1 + d2 + 40), endTime: t(d1 + d2 + 40 + d3), usage: { input: Math.round(between(r, 1200, 1600)), output: Math.round(between(r, 80, 160)) }, calculatedTotalCost: between(r, 0.0003, 0.0006), level: failed ? 'ERROR' : 'DEFAULT', statusMessage: failed ? 'could not answer' : undefined },
    ],
  };
}

export interface SimulatedPayload {
  at: number;
  payload: unknown;
}

/**
 * Deux semaines de trafic se terminant à `now`. La v1.5.0 de
 * sentry-triage remplace la v1.4.0 `deployDaysAgo` jours avant `now`.
 */
export function simulateTraffic(now: number, opts: { days?: number; seed?: number; deployDaysAgo?: number; runsPerDay?: number } = {}): SimulatedPayload[] {
  const r = rng(opts.seed ?? 42);
  const days = opts.days ?? 14;
  const deployAt = now - (opts.deployDaysAgo ?? 2) * 24 * 3600 * 1000;
  const perDay = opts.runsPerDay ?? 40;
  const out: SimulatedPayload[] = [];
  const start = now - days * 24 * 3600 * 1000;
  const total = days * perDay;
  for (let i = 0; i < total; i++) {
    // Un peu de jitter pour éviter des horodatages réguliers.
    const at = start + ((i + r() * 0.8) / total) * (now - start - 60_000);
    const version = at >= deployAt ? '1.5.0' : '1.4.0';
    for (const payload of sentryTriageRun(r, at, version)) out.push({ at, payload });
    if (r() < 0.6) out.push({ at: at + 1000, payload: supportBotRun(r, at + 1000) });
  }
  return out;
}
