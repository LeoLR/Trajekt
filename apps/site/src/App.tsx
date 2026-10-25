import { Recorder } from './Recorder';
import { Playground } from './Playground';
import { CopyButton, DEMO_URL, Hatch, Logo, Page, QUICKSTART_URL, REPO_URL } from './Layout';

const INSTALL = 'npm i @trajekt/core';

function CopyCommand() {
  return (
    <div className="command">
      <code className="mono"><span className="prompt" aria-hidden="true">$</span> {INSTALL}</code>
      <CopyButton text={INSTALL} label="Copy install command" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mini-visuels des trois blocs                                         */
/* ------------------------------------------------------------------ */

function ReplayVisual() {
  return (
    <div className="mini">
      <div className="mini-label mono">#9 jira.createIssue · arguments</div>
      <pre className="mini-code mono">{`{
  "project": "PAY",
  "summary": "NPE in checkout discount",
  "priority": "High"
}`}</pre>
      <div className="mini-label mono">attempts</div>
      <ul className="attempts mono">
        <li><span>1</span><span className="t-err">429 Too Many Requests</span></li>
        <li><span>2</span><span className="t-err">429 Too Many Requests</span></li>
        <li><span>3</span><span className="t-ok">201 Created · PAY-1432</span></li>
      </ul>
    </div>
  );
}

const COSTS: Array<[number, number]> = [[2, 0.009], [4, 0.013], [6, 0.018], [8, 0.025], [10, 0.024], [12, 0.028], [14, 0.046]];

function DiagnoseVisual() {
  const max = 0.046;
  return (
    <div className="mini">
      <div className="mini-label mono">cost per LLM step</div>
      <ul className="costs mono">
        {COSTS.map(([n, c]) => (
          <li key={n}>
            <span className="faint">#{n}</span>
            <span className="cost-track"><span className="cost-bar" style={{ width: `${(c / max) * 100}%`, background: n === 10 || n === 12 ? 'var(--amber)' : 'var(--t-llm)' }} /></span>
            <span>${c.toFixed(3)}</span>
          </li>
        ))}
      </ul>
      <div className="chips">
        <span className="chip chip-amber mono">repeated searchCode ×2</span>
        <span className="chip chip-amber mono">2 retries · 7.3s backoff</span>
      </div>
    </div>
  );
}

const DIFF: Array<['=' | '+' | '≠' | '−', string, string]> = [
  ['=', 'sentry.getIssue', 'sentry.getIssue'],
  ['=', 'gitlab.searchCode', 'gitlab.searchCode'],
  ['+', '', 'gitlab.searchCode'],
  ['+', '', 'gitlab.searchCode'],
  ['≠', 'jira.createIssue', 'jira.createIssue · priority'],
  ['−', 'gitlab.readFile', ''],
  ['+', '', 'gitlab.createMergeRequest · 422'],
];

function CompareVisual() {
  return (
    <div className="mini">
      <div className="diff-head mono">
        <span />
        <span>A · prompt v1.8.2</span>
        <span>B · prompt v1.9.0</span>
      </div>
      <ul className="diff mono">
        {DIFF.map(([m, a, b], i) => (
          <li key={i} className={`diff-${m === '=' ? 'same' : m === '−' ? 'removed' : 'changed'}`}>
            <span className="diff-mark">{m}</span>
            <span className={a ? '' : 'faint'}>{a || '—'}</span>
            <span className={b ? '' : 'faint'}>{b || '—'}</span>
          </li>
        ))}
      </ul>
      <div className="diff-sum mono">steps 12 → 16 · cost +100% · outcome <span className="t-err">failed</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const SDK_SNIPPET = `// instrumentation.ts — standard OpenTelemetry, nothing proprietary
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'sentry-triage',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:3000/v1/traces',
    headers: { Authorization: \`Bearer \${process.env.TRAJEKT_API_KEY}\` },
  }),
}).start();

// With the Vercel AI SDK, turn telemetry on for each call:
await generateText({
  model, prompt, tools,
  experimental_telemetry: { isEnabled: true, functionId: 'sentry-triage' },
});`;

const CORE_SNIPPET = `import { normalize, computeMetrics } from '@trajekt/core';

// A Langfuse export, OTLP/JSON spans or an AI SDK result
const run = normalize(trace);
const { status, costUsd, redundantToolCalls, retryCount } = computeMetrics(run);`;

export function App() {
  return (
    <Page page="home">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow mono"><Hatch />OPEN SOURCE · SELF-HOSTED</div>
              <h1>The flight recorder for AI agents.</h1>
              <p className="lead">
                Trajekt records every step of every run — reasoning, tool calls, inputs and outputs, tokens, latency, cost — so when an agent goes off the rails in production, you can replay exactly what happened.
              </p>
              <div className="cta-row">
                <a className="btn btn-amber btn-lg" href={QUICKSTART_URL}>Get started</a>
                <CopyCommand />
              </div>
              <div className="source-links">
                <a className="source-link" href={DEMO_URL}>Open the live demo →</a>
                <a className="source-link" href={REPO_URL}>View the source on GitHub →</a>
              </div>
            </div>
            <Recorder />
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2 className="h2">
              When an agent fails, logs show you the last error. <span className="muted">Not the nine steps that led to it.</span>
            </h2>
            <div className="blocks">
              <article className="block">
                <div className="block-kicker mono">01 · Replay</div>
                <h3>What did it actually do?</h3>
                <p>Step through a run like a timeline. Each step shows the prompt, the model's reasoning, the exact tool arguments and what the tool returned.</p>
                <ReplayVisual />
              </article>
              <article className="block">
                <div className="block-kicker mono">02 · Diagnose</div>
                <h3>Why did this run cost twice as much?</h3>
                <p>Tokens, latency and cost are broken down per step. Retries, repeated tool calls and loops are flagged on the timeline, so the expensive part is the first thing you see.</p>
                <DiagnoseVisual />
              </article>
              <article className="block">
                <div className="block-kicker mono">03 · Compare</div>
                <h3>Did my prompt change break it?</h3>
                <p>Put two runs side by side, aligned step by step. Added steps, wrong tools and changed outcomes stand out, next to the configuration that changed between them.</p>
                <CompareVisual />
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="try">
          <div className="container">
            <div className="try-head">
              <div>
                <h2 className="h2">Try it on a real trace.</h2>
                <p className="lead">Load an example — or your own export — and replay it step by step, with loops, retries and failures flagged.</p>
              </div>
            </div>
            <Playground />
          </div>
        </section>

        <section className="section section-alt" id="how">
          <div className="container">
            <h2 className="h2">Three lines to your first recording.</h2>
            <ol className="steps">
              <li><span className="step-n mono">01</span><div><h3>Instrument</h3><p>Point any OpenTelemetry exporter at Trajekt. Spans following the GenAI semantic conventions or the Vercel AI SDK telemetry are understood as-is.</p></div></li>
              <li><span className="step-n mono">02</span><div><h3>Record</h3><p>Every run becomes a trajectory: steps, tool arguments and results, tokens, latency and cost, grouped per agent and version.</p></div></li>
              <li><span className="step-n mono">03</span><div><h3>Replay</h3><p>Open any run on a timeline, compare it with another, and see when a new version starts looping, failing or costing more.</p></div></li>
            </ol>
            <pre className="code mono" tabIndex={0} aria-label="OpenTelemetry setup">{SDK_SNIPPET}</pre>
            <p className="code-note">Already have traces? <code className="mono">@trajekt/core</code> reads them in your own code and tests:</p>
            <pre className="code mono" tabIndex={0} aria-label="@trajekt/core example">{CORE_SNIPPET}</pre>
            <div className="works-with">
              <span>Works with</span>
              <span className="tag mono">OpenTelemetry · OTLP/HTTP JSON</span>
              <span className="tag mono">GenAI semantic conventions</span>
              <span className="tag mono">Vercel AI SDK</span>
              <span className="tag mono">Langfuse trace exports</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container selfhost">
            <div>
              <h2 className="h2">Your traces stay on your infrastructure.</h2>
              <p className="lead">Prompts and tool results often contain customer data. Trajekt is open source and runs with one Docker Compose file, next to your agents.</p>
            </div>
            <div className="terminal" role="img" aria-label="Terminal: clone the repository and start Trajekt with Docker Compose">
              <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
              <pre className="mono">
{`$ git clone ${REPO_URL}.git
$ cd trajekt
$ docker compose up -d
`}<span className="t-ok">✓</span>{` Trajekt is running at http://localhost:3000`}
              </pre>
            </div>
          </div>
        </section>

        <section className="section final">
          <div className="container final-inner">
            <Logo />
            <h2 className="h2">Record your next run.</h2>
            <div className="cta-row center">
              <a className="btn btn-amber btn-lg" href={QUICKSTART_URL}>Get started</a>
              <a className="btn btn-outline btn-lg" href={DEMO_URL}>Live demo</a>
              <a className="btn btn-outline btn-lg" href={REPO_URL}>View on GitHub</a>
            </div>
          </div>
        </section>
    </Page>
  );
}
