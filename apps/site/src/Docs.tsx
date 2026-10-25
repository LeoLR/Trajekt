import type { ReactNode } from 'react';
import { CopyButton, DEMO_URL, Page, REPO_URL } from './Layout';

/**
 * Documentation : installation, envoi de traces, utilisation, tests.
 * Tout ce qui est écrit ici doit correspondre au code du dépôt
 * (apps/dashboard, packages/core) — pas de fonctionnalité annoncée.
 */

const SECTIONS: Array<[string, string, Array<[string, string]>?]> = [
  ['overview', 'Overview'],
  ['quickstart', 'Quickstart'],
  ['install', 'Installation', [['install-docker', 'Docker Compose'], ['install-source', 'From source'], ['configuration', 'Configuration']]],
  ['send', 'Sending traces', [['send-otel', 'OpenTelemetry'], ['send-helpers', 'Instrument your code'], ['send-ai-sdk', 'Vercel AI SDK'], ['send-frameworks', 'LangChain, LlamaIndex…'], ['send-file', 'Langfuse & files'], ['identity', 'Agent, versions & model']]],
  ['scores', 'Quality scores'],
  ['dashboard', 'Using the dashboard', [['compare-versions', 'Comparing versions']]],
  ['regressions', 'Regression alerts'],
  ['projects', 'Projects & operations'],
  ['ai', 'Ask your agents (MCP)', [['read-keys', 'Read API keys'], ['mcp-tools', 'Tools']]],
  ['library', '@trajekt/core'],
  ['testing', 'Testing your agent', [['test-assert', 'Assert on a run'], ['eval-suites', 'Eval suites'], ['eval-ci', 'In CI'], ['test-trajekt', 'Test Trajekt itself']]],
  ['api', 'API reference'],
  ['troubleshooting', 'Troubleshooting'],
];

function Code({ children, lang = 'bash', label }: { children: string; lang?: string; label?: string }) {
  const text = children.replace(/^\n/, '').replace(/\n\s*$/, '');
  return (
    <div className="doc-code">
      <div className="doc-code-bar">
        <span className="mono">{label ?? lang}</span>
        <CopyButton text={text} label={`Copy ${label ?? lang} snippet`} />
      </div>
      <pre className="mono" tabIndex={0}>{text}</pre>
    </div>
  );
}

function H2({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="doc-h2"><a href={`#${id}`} className="doc-anchor">{children}</a></h2>;
}
function H3({ id, children }: { id: string; children: ReactNode }) {
  return <h3 id={id} className="doc-h3"><a href={`#${id}`} className="doc-anchor">{children}</a></h3>;
}
function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`doc-note doc-note-${tone}`}>{children}</div>;
}
const C = ({ children }: { children: ReactNode }) => <code className="mono doc-inline">{children}</code>;

export function Docs() {
  return (
    <Page page="docs">
      <div className="container doc-layout">
        <nav className="doc-nav" aria-label="Documentation">
          <div className="doc-nav-title mono">DOCUMENTATION</div>
          <ul>
            {SECTIONS.map(([id, label, children]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
                {children && (
                  <ul>
                    {children.map(([cid, clabel]) => <li key={cid}><a href={`#${cid}`}>{clabel}</a></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <article className="doc">
          <div className="eyebrow mono">DOCS</div>
          <h1 className="doc-h1">Install, record, replay.</h1>
          <p className="doc-lead">
            Everything you need to run Trajekt next to your agents, send it traces, read what they did and get told when a new version gets worse.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="overview">Overview</H2>
          <p>Trajekt has two parts:</p>
          <ul>
            <li><strong>The server</strong> (<C>apps/dashboard</C>): a Next.js app with one Postgres. It receives traces on <C>POST /v1/traces</C>, stores one row per run, and serves the dashboard.</li>
            <li><strong>The library</strong> (<C>@trajekt/core</C>): reads a trace from any supported format into one model, computes its metrics and compares groups of runs. The server uses it; you can use it in your own tests.</li>
          </ul>
          <p>Your agent does not need a Trajekt SDK. It sends standard OpenTelemetry spans, or you post a trace file.</p>

          {/* ------------------------------------------------------------ */}
          <H2 id="quickstart">Quickstart</H2>
          <p>Docker and Git are the only requirements.</p>
          <Code label="1 · start Trajekt">{`
git clone ${REPO_URL}.git
cd trajekt
cp .env.example .env     # set DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET
docker compose up -d --build
`}</Code>
          <Code label="2 · create a project (prints the API key once)">{`
docker compose exec dashboard pnpm create-project my-project
`}</Code>
          <Code label="3 · optional: two weeks of demo data">{`
docker compose exec dashboard pnpm seed
`}</Code>
          <p>
            Open <C>http://localhost:3000</C> and sign in with <C>DASHBOARD_PASSWORD</C>. With the demo data you will see an agent, <C>sentry-triage</C>, whose version 1.5.0 starts looping on a tool call, costs more and fails more often than 1.4.0 — that is what a regression looks like in Trajekt.
          </p>
          <p>Then <a href="#send">send your own traces</a>.</p>

          {/* ------------------------------------------------------------ */}
          <H2 id="install">Installation</H2>
          <H3 id="install-docker">Docker Compose</H3>
          <p>
            The compose file starts two containers: Postgres 16 and the dashboard. Migrations run when the dashboard container starts. The dashboard and the ingestion endpoint share port <C>3000</C>.
          </p>
          <Code>{`
docker compose up -d --build     # start
docker compose logs -f dashboard # follow logs
docker compose down              # stop, keep data
docker compose down -v           # stop and delete the database volume
`}</Code>
          <Note tone="warn">
            Without a <C>.env</C> file, the password defaults to <C>trajekt</C> and the session secret to a development value. Set both before exposing the port beyond your machine. There is no TLS or reverse proxy in the compose file.
          </Note>

          <H3 id="install-source">From source</H3>
          <p>You need Node.js 22, pnpm 10 and a Postgres database.</p>
          <Code>{`
pnpm install
pnpm --filter @trajekt/core build    # the dashboard imports the built package

cd apps/dashboard
cp .env.example .env                 # DATABASE_URL, DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET
pnpm migrate
pnpm create-project my-project
pnpm dev                             # http://localhost:3000
`}</Code>

          <H3 id="configuration">Configuration</H3>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Variable</th><th>Required</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td><C>DATABASE_URL</C></td><td>yes</td><td>Postgres connection string. Set by the compose file.</td></tr>
                <tr><td><C>DASHBOARD_PASSWORD</C></td><td>yes</td><td>The password of the sign-in page. There is one account.</td></tr>
                <tr><td><C>DASHBOARD_SESSION_SECRET</C></td><td>yes</td><td>Signs the session cookie. At least 16 characters.</td></tr>
                <tr><td><C>CRON_SECRET</C></td><td>for alerts</td><td>Bearer token of <C>POST /api/alerts/check</C>. The endpoint is off while it is empty.</td></tr>
                <tr><td><C>SLACK_WEBHOOK_URL</C></td><td>no</td><td>Slack incoming webhook. New regressions are posted there.</td></tr>
                <tr><td><C>TRAJEKT_PUBLIC_URL</C></td><td>no</td><td>Public URL of the dashboard, used for links in Slack messages.</td></tr>
                <tr><td><C>TRAJEKT_PRICING</C></td><td>no</td><td>JSON price overrides, in USD per million tokens. See <a href="#library">cost estimation</a>.</td></tr>
                <tr><td><C>TRAJEKT_RETENTION_DAYS</C></td><td>no</td><td>Runs older than this are deleted when the cron runs. Empty: kept forever.</td></tr>
                <tr><td><C>TRAJEKT_INGEST_RATE_PER_MIN</C></td><td>no</td><td>Ingestion requests per minute and per project, per server instance (default 600). Over it: <C>429</C> with <C>Retry-After</C>.</td></tr>
                <tr><td><C>TRAJEKT_MAX_BODY_MB</C></td><td>no</td><td>Largest request accepted, after gzip (default 20). Over it: <C>413</C>.</td></tr>
                <tr><td><C>TRAJEKT_STORE_RAW</C></td><td>no</td><td><C>false</C>: do not keep the original payload of each step — roughly half the storage, but the "raw payload" panel of a step is empty.</td></tr>
              </tbody>
            </table>
          </div>

          {/* ------------------------------------------------------------ */}
          <H2 id="send">Sending traces</H2>
          <p>
            Every request to <C>POST /v1/traces</C> needs the project API key: <C>Authorization: Bearer tk_live_…</C>. Only its hash is stored, so a lost key cannot be recovered — create a new project.
          </p>

          <H3 id="send-otel">OpenTelemetry</H3>
          <p>Point any OTLP/HTTP exporter at the root URL of Trajekt; the exporter adds <C>/v1/traces</C> itself. JSON and protobuf encodings both work, so the default settings of the Python, Java or Go SDKs are fine.</p>
          <Code label=".env of your agent">{`
OTEL_SERVICE_NAME=sentry-triage
OTEL_RESOURCE_ATTRIBUTES=service.version=3.2.0,trajekt.agent.version=1.5.0,trajekt.prompt.version=v8
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf   # or http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."
`}</Code>
          <p>Or in code, with the Node SDK:</p>
          <Code lang="ts" label="instrumentation.ts">{`
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

new NodeSDK({
  serviceName: 'sentry-triage',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:3000/v1/traces',
    headers: { Authorization: \`Bearer \${process.env.TRAJEKT_API_KEY}\` },
  }),
}).start();
`}</Code>
          <p>
            Trajekt reads spans that follow the OpenTelemetry GenAI semantic conventions: <C>gen_ai.operation.name</C>, <C>gen_ai.request.model</C>, <C>gen_ai.usage.input_tokens</C> / <C>output_tokens</C>, <C>gen_ai.tool.name</C>, <C>gen_ai.tool.call.arguments</C> / <C>result</C>, <C>gen_ai.input.messages</C> / <C>output.messages</C>. It also reads OpenInference and OpenLLMetry spans (see <a href="#send-frameworks">below</a>). A span is a failure when its status is <C>ERROR</C> or when it records an exception.
          </p>
          <p>
            An exporter sends a trace in several batches, children first. Trajekt merges every batch with the same <C>traceId</C> into one run; sending a batch twice does not duplicate steps.
          </p>
          <Note>Gzip is accepted. gRPC is not: use OTLP over HTTP (port 3000, path <C>/v1/traces</C>).</Note>

          <H3 id="send-helpers">Instrument your code</H3>
          <p>
            If your agent is hand-written, <C>@trajekt/core</C> has two helpers that create the spans Trajekt expects, with any OpenTelemetry tracer. Tool arguments matter: without them, repeated calls cannot be detected.
          </p>
          <Code lang="ts" label="agent.ts">{`
import { trace } from '@opentelemetry/api';
import { traceRun, traceTool } from '@trajekt/core';

const tracer = trace.getTracer('sentry-triage');

await traceRun(tracer, { agent: 'sentry-triage', agentVersion: '1.5.0', promptVersion: 'v8' }, async (run) => {
  const issue = await traceTool(tracer, 'sentry.getIssue', { id }, () => sentry.getIssue(id));
  const ticket = await traceTool(tracer, 'jira.createIssue', { project, summary }, () => jira.createIssue(project, summary));
  run.score('correct', ticket.project === expectedProject); // optional quality score
  return ticket;
});
`}</Code>
          <p>
            Calls to the model: wrap the Anthropic client once and every <C>messages.create</C> is recorded — model, tokens including the prompt cache (priced as such), stop reason, and the messages unless <C>{'{ captureContent: false }'}</C>. Other SDKs: <C>traceLlm(tracer, {'{ model, input }'}, () => call())</C> reads Anthropic and OpenAI responses.
          </p>
          <Code lang="ts">{`
import Anthropic from '@anthropic-ai/sdk';
import { traceAnthropic } from '@trajekt/core';

const anthropic = traceAnthropic(new Anthropic(), tracer);
// unchanged agent code:
const msg = await anthropic.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 1024, system, messages, tools });
`}</Code>
          <p>
            <C>traceRun</C> also takes <C>appVersion</C>, <C>environment</C> and <C>scenario</C> (for <a href="#eval-suites">eval runs</a>), and exposes <C>run.traceId</C> to attach a score later. An exception that escapes the run marks it as failed; one thrown by a tool marks only that step.
          </p>

          <H3 id="send-ai-sdk">Vercel AI SDK</H3>
          <p>With an OpenTelemetry exporter set up as above, turn telemetry on for each call. <C>functionId</C> becomes the agent name.</p>
          <Code lang="ts">{`
const result = await generateText({
  model,
  prompt,
  tools,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'trip-planner',
    metadata: { appVersion: '3.2.0', agentVersion: '2.3.0', promptVersion: 'v8' },
  },
});
`}</Code>
          <p>
            Without OpenTelemetry, you can post the result object itself (the value with <C>steps</C>) to <C>/v1/traces</C>. It carries no timestamps and no trace id, so each post is a separate run, and the agent name must come from a header.
          </p>

          <H3 id="send-frameworks">LangChain, LlamaIndex, CrewAI…</H3>
          <p>
            Python frameworks are usually traced with <a href="https://github.com/Arize-ai/openinference">OpenInference</a> or <a href="https://github.com/traceloop/openllmetry">OpenLLMetry</a>. Trajekt reads both: model, tokens, cost and messages of LLM spans; name, arguments and result of tool spans; the agent name from the <C>AGENT</C> span or the workflow name. Point their OTLP exporter at Trajekt:
          </p>
          <Code lang="python" label="LangChain + OpenInference">{`
from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="http://localhost:3000/v1/traces",
    headers={"Authorization": "Bearer tk_live_..."},
)))
trace.set_tracer_provider(provider)
LangChainInstrumentor().instrument()
`}</Code>
          <p>
            Set the versions with resource attributes (<C>OTEL_RESOURCE_ATTRIBUTES=service.version=3.2.0,trajekt.agent.version=1.5.0,trajekt.prompt.version=v8</C>) so you can compare them.
          </p>

          <H3 id="send-file">Langfuse exports and trace files</H3>
          <p>
            Already on Langfuse? Import its traces, scores included, without touching your agent. Run it on a schedule: it only adds what is new and never duplicates a run.
          </p>
          <Code label="import the last 7 days of one agent">{`
LANGFUSE_HOST=https://cloud.langfuse.com \
LANGFUSE_PUBLIC_KEY=pk-lf-... LANGFUSE_SECRET_KEY=sk-lf-... \
pnpm --filter dashboard import-langfuse --since 7d --name sentry-triage
`}</Code>
          <p>
            The versions come from the trace: <C>release</C> becomes the app version, <C>version</C> the agent version, <C>metadata.promptVersion</C> the prompt version. A single Langfuse trace — the response of <C>GET /api/public/traces/:traceId</C> — can also be posted as-is, as can an OTLP/JSON file.
          </p>
          <Code>{`
curl -X POST http://localhost:3000/v1/traces \\
  -H "Authorization: Bearer tk_live_..." \\
  -H "Content-Type: application/json" \\
  -H "X-Trajekt-Agent: support-bot" \\
  --data @trace.json
`}</Code>
          <p>
            Example files for each format: <a href="/samples/otlp-sentry-triage.json" download>OTLP</a>, <a href="/samples/langfuse-support-bot.json" download>Langfuse</a>, <a href="/samples/ai-sdk-trip-planner.json" download>Vercel AI SDK</a>.
          </p>

          <H3 id="identity">Agent, versions and model</H3>
          <p>
            Each run carries five labels. The agent name groups runs together; the four others are the dimensions you can compare on:
          </p>
          <ul>
            <li><strong>App version</strong> — the release of the application that embeds the agent (your service, your web app).</li>
            <li><strong>Agent version</strong> — the agent itself: its code, tools and orchestration. It defaults to the app version when you do not set it.</li>
            <li><strong>Prompt version</strong> — the version of the system prompt or prompt template.</li>
            <li><strong>Model</strong> — read from the LLM calls of the run (the most used one), nothing to set.</li>
          </ul>
          <p>For each field the first value found wins.</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Field</th><th>OpenTelemetry (span, then resource)</th><th>Langfuse</th><th>Header fallback</th></tr></thead>
              <tbody>
                <tr><td>Agent</td><td><C>trajekt.agent.name</C>, <C>gen_ai.agent.name</C>, <C>ai.telemetry.functionId</C>, <C>service.name</C></td><td><C>metadata.agentName</C>, trace name</td><td><C>X-Trajekt-Agent</C></td></tr>
                <tr><td>App version</td><td><C>trajekt.app.version</C>, <C>app.version</C>, <C>ai.telemetry.metadata.appVersion</C>, <C>service.version</C></td><td><C>metadata.appVersion</C>, <C>release</C></td><td><C>X-Trajekt-App-Version</C></td></tr>
                <tr><td>Agent version</td><td><C>trajekt.agent.version</C>, <C>gen_ai.agent.version</C>, <C>ai.telemetry.metadata.agentVersion</C> — otherwise the app version</td><td><C>metadata.agentVersion</C>, <C>version</C>, <C>release</C></td><td><C>X-Trajekt-Agent-Version</C></td></tr>
                <tr><td>Prompt version</td><td><C>trajekt.prompt.version</C>, <C>gen_ai.prompt.version</C>, <C>ai.telemetry.metadata.promptVersion</C></td><td><C>metadata.promptVersion</C>, generation <C>promptVersion</C></td><td><C>X-Trajekt-Prompt-Version</C></td></tr>
                <tr><td>Environment</td><td><C>trajekt.environment</C>, <C>deployment.environment.name</C></td><td><C>environment</C></td><td><C>X-Trajekt-Environment</C></td></tr>
                <tr><td>Scores</td><td><C>trajekt.score.&lt;name&gt;</C> (a number, higher is better) — see <a href="#scores">Quality scores</a></td><td><C>scores</C> of the trace (numeric and boolean)</td><td><C>POST /v1/scores</C></td></tr>
                <tr><td>Scenario</td><td><C>trajekt.scenario</C>, <C>ai.telemetry.metadata.scenario</C> — marks an eval run, see <a href="#eval-suites">Eval suites</a></td><td><C>metadata.scenario</C></td><td><C>X-Trajekt-Scenario</C></td></tr>
              </tbody>
            </table>
          </div>
          <p>Headers are used only when the trace carries no value. A run without any agent name is filed under <C>unknown</C>.</p>
          <Note>
            If your app and your agent ship together, setting <C>service.version</C> is enough. Set <C>trajekt.agent.version</C> and <C>trajekt.prompt.version</C> as soon as they change independently — otherwise a prompt change cannot be told apart from an app release.
          </Note>

          {/* ------------------------------------------------------------ */}
          <H2 id="scores">Quality scores</H2>
          <p>
            Cost, duration and failures say how an agent ran, not whether it did the right thing. A version that is cheaper but files tickets in the wrong project looks better on every other metric. Scores close that gap: one number per run and per name, <strong>higher is better</strong>, ideally between 0 and 1 — correct or not, share of expectations met, an LLM judge's grade, a thumbs up.
          </p>
          <ul>
            <li><strong>In the trace</strong>: an attribute <C>trajekt.score.correct = 1</C> on any span, or <C>run.score('correct', true)</C> with <C>traceRun</C>. Langfuse scores come along with the trace.</li>
            <li><strong>After the fact</strong>, when you know: the user's feedback, the merge request that got merged, a review. Send it with the trace id your app already has. A score sent this way is never overwritten by the trace.</li>
          </ul>
          <Code label="POST /v1/scores — ingestion key">{`
curl -X POST https://trajekt.example.com/v1/scores \
  -H "Authorization: Bearer tk_live_..." -H "Content-Type: application/json" \
  -d '{ "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "name": "correct", "value": 0, "comment": "wrong Jira project" }'
`}</Code>
          <p>
            It also takes a list (<C>{'{ "scores": [ … ] }'}</C>, up to 500) and a Trajekt <C>runId</C> instead of a <C>traceId</C>. In tests, <C>scoreTrajectory(run, expectations)</C> turns <a href="#test-assert">assertions</a> into a score (the share of expectations met).
          </p>
          <p>
            Scores are compared like the other metrics, but a <em>drop</em> is the regression: in production (at least −0.05, significant, 20 scored runs on each side — alerts included), and in <a href="#eval-suites">eval suites</a>, where they come first and a scenario whose score drops by 0.5 or more fails the suite. They show on each run, in the runs list when below 1, and per version on the agent page.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="dashboard">Using the dashboard</H2>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Page</th><th>Use it to</th></tr></thead>
              <tbody>
                <tr><td><C>/</C> Agents</td><td>See which agents regressed. One card per agent: runs, failure rate, median duration and mean cost over 24 h, a 14-day trend, and the regressions found.</td></tr>
                <tr><td><C>/agents/:name</C></td><td>Answer "is it getting worse, and since when?". Compare versions metric by metric (see below), the last 24 h against the 7 days before, daily trends with the first run of each version marked, tool paths per version, recent runs.</td></tr>
                <tr><td><C>/runs</C></td><td>Filter runs by agent, app version, agent version, prompt version, model, status, or "repeated tool calls only".</td></tr>
                <tr><td><C>/runs/:id</C></td><td>Replay one run on a timeline. Repeated calls (<C>REPEAT #5</C>), retries (<C>ATTEMPT 2</C>) and failures are marked; click a step to see its arguments, result, prompt or output.</td></tr>
                <tr><td><C>/runs/:id/compare</C></td><td>Align two runs step by step. By default the run is compared with the latest successful run of the previous version; add <C>?with=&lt;run id&gt;</C> to pick another one.</td></tr>
                <tr><td><C>/agents/:name/evals</C></td><td>Compare two versions on your eval suite, scenario by scenario: PASS or FAIL, what got worse, and a diff per scenario. See <a href="#eval-suites">Eval suites</a>.</td></tr>
                <tr><td><C>/explore</C></td><td>Open a trace file in the browser without sending it to the server.</td></tr>
              </tbody>
            </table>
          </div>
          <H3 id="compare-versions">Comparing versions</H3>
          <p>
            On an agent page, <strong>Compare by</strong> picks the dimension — app version, agent version, prompt version or model — and the comparison follows it:
          </p>
          <ul>
            <li><strong>Latest vs previous</strong>: the most recent value against the one before it.</li>
            <li><strong>Pick two</strong>: any A and B, e.g. prompt <C>v7</C> against <C>v8</C>, or app <C>3.1.0</C> against <C>3.2.0</C>. For models, A defaults to the most used one, so a cheaper model under test shows up as B.</li>
          </ul>
          <p>
            The URL keeps the selection (<C>/agents/sentry-triage?dim=prompt&amp;compare=ab&amp;a=v7&amp;b=v8</C>), so a comparison can be shared as a link. The versions table, the tool paths and the run filters follow the same dimension.
          </p>
          <Note tone="warn">
            Comparing two app versions also compares everything that shipped with them. If a new agent version went out during the same period, narrow the time range — the API takes <C>from</C> and <C>to</C> — or compare on the agent dimension.
          </Note>
          <p>How the run metrics are computed:</p>
          <ul>
            <li><strong>Repeated tool call</strong>: the same tool with the same arguments (key order ignored) as an earlier call that succeeded, with no state-changing call in between. Reading a file again after editing it, or re-running the tests after a fix, is not a loop; doing the same write twice in a row is. A tool counts as state-changing from its name (<C>write</C>, <C>edit</C>, <C>create</C>, <C>update</C>, <C>post</C>, <C>run</C>, <C>bash</C>… but not <C>get</C>, <C>read</C>, <C>search</C>, <C>list</C>…); <C>setMutatingTools()</C> in <C>@trajekt/core</C> overrides the rule. Calls without captured arguments are never counted.</li>
            <li><strong>Retry</strong>: a call to the same tool or model right after that call failed. A retry is not counted as a repeat.</li>
            <li><strong>Status</strong>: with a single root span, the root decides — errors caught inside the run do not fail it. Otherwise the last step that is not a system span decides.</li>
            <li><strong>Cost</strong>: the cost from the source when there is one (Langfuse), otherwise estimated from tokens and shown with <C>≈</C>.</li>
            <li><strong>Tool path</strong>: tools in order; retries are dropped and consecutive repeats become <C>×n</C>, e.g. <C>sentry.getIssue → gitlab.searchCode ×3 → jira.createIssue</C>.</li>
          </ul>

          {/* ------------------------------------------------------------ */}
          <H2 id="regressions">Regression alerts</H2>
          <p>Two comparisons run for each agent that had runs in the last 24 h:</p>
          <ul>
            <li>the last 24 h against the 7 days before;</li>
            <li>the latest agent version, prompt version and app version against the previous one, each while it is less than 7 days old — a prompt change alone can raise an alert.</li>
          </ul>
          <p>
            Eight metrics are compared — failed runs, failed tool calls, mean duration, mean cost, steps per run, tokens per run, repeated tool calls, share of runs on a tool path never seen before — plus every <a href="#scores">quality score</a> present on both sides. A metric is flagged only when all three hold:
          </p>
          <ul>
            <li>the change is statistically significant (one-sided test, p &lt; 0.01), and still is after correcting for the number of metrics tested at once (Holm) — otherwise one metric in ten would cry wolf by chance;</li>
            <li>it is large enough to matter: +15% on a mean, +3 points on a rate, −0.05 on a score;</li>
            <li>there are at least 20 runs on each side.</li>
          </ul>
          <p>Run the check on a schedule. It covers every project; each new regression is stored and posted to Slack once per agent and metric every 24 h. The same call purges old runs when <C>TRAJEKT_RETENTION_DAYS</C> is set.</p>
          <Code label="crontab — every hour">{`
0 * * * * curl -fsS -X POST https://trajekt.example.com/api/alerts/check -H "Authorization: Bearer $CRON_SECRET"
`}</Code>
          <Code label="or inside the container">{`
docker compose exec dashboard pnpm check-regressions
`}</Code>

          {/* ------------------------------------------------------------ */}
          <H2 id="projects">Projects & operations</H2>
          <p>
            A project groups runs and has its own API keys: one per team, product or environment. Create and open projects on the <C>/projects</C> page of the dashboard — the keys are shown once, at creation — or from the command line with <C>pnpm --filter dashboard create-project &lt;name&gt;</C>. There is still one sign-in password for the whole instance.
          </p>
          <ul>
            <li><strong>Retention</strong>: <C>TRAJEKT_RETENTION_DAYS=90</C> deletes older runs (and their scores) each time the cron runs; alerts are kept at least 90 days.</li>
            <li><strong>Storage</strong>: a run stores every step with its original payload. <C>TRAJEKT_STORE_RAW=false</C> drops the payload and roughly halves the size; Postgres already compresses the rest.</li>
            <li><strong>Ingestion limits</strong>: 600 requests per minute and per project (<C>TRAJEKT_INGEST_RATE_PER_MIN</C>), 20 MB per request after gzip (<C>TRAJEKT_MAX_BODY_MB</C>). OpenTelemetry exporters retry on <C>429</C> and honour <C>Retry-After</C>. The rate limit is kept in memory, per server instance: a safety net, not a quota.</li>
          </ul>

          {/* ------------------------------------------------------------ */}
          <H2 id="ai">Ask your agents (MCP)</H2>
          <p>
            Trajekt is an MCP server. Connect Claude, Cursor or your own agent to it and ask in plain language: <em>"did sentry-triage get worse since prompt v8?"</em>, <em>"why did this run fail?"</em>, <em>"is the cheaper model good enough?"</em>.
          </p>
          <p>
            The tools return answers Trajekt has already computed — statistical verdicts, run summaries, differences — as short text plus structured JSON. Your agent never has to read thousands of spans, so its answers stay short and grounded in the numbers. All tools are read-only.
          </p>
          <Code label="Claude Code">{`
claude mcp add --transport http trajekt http://localhost:3000/api/mcp \\
  --header "Authorization: Bearer tk_read_..."
`}</Code>
          <Code lang="json" label="any MCP client (Streamable HTTP)">{`
{
  "mcpServers": {
    "trajekt": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer tk_read_..." }
    }
  }
}
`}</Code>
          <p>
            Try it without installing anything: the <a href={DEMO_URL}>live demo</a> exposes its MCP endpoint without a key at <C>{`${DEMO_URL}/api/mcp`}</C>.
          </p>

          <H3 id="read-keys">Read API keys</H3>
          <p>
            Keys have a scope. An ingestion key (<C>tk_live_…</C>) can only send traces; a read key (<C>tk_read_…</C>) can only read — the MCP server and every <C>GET /api/*</C> route. Give agents a read key, never your ingestion key.
          </p>
          <Code>{`
docker compose exec dashboard pnpm create-read-key claude-desktop
`}</Code>

          <H3 id="mcp-tools">Tools</H3>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Tool</th><th>Answers</th></tr></thead>
              <tbody>
                <tr><td><C>list_agents</C></td><td>Which agents exist, their activity over 24 h, and which ones regressed. The starting point.</td></tr>
                <tr><td><C>list_versions</C></td><td>App versions, agent versions, prompt versions or models of an agent, with their metrics.</td></tr>
                <tr><td><C>compare</C></td><td>Is B worse than A? Two values of any dimension, the latest against the previous one, or the last 24 h against the 7 days before — one verdict per metric.</td></tr>
                <tr><td><C>compare_eval_suite</C></td><td>For eval runs (tagged with a scenario): PASS or FAIL between two versions, the suite-level verdicts, and the scenarios that got worse with what changed.</td></tr>
                <tr><td><C>get_regressions</C></td><td>Regressions detected now, and the alerts already sent.</td></tr>
                <tr><td><C>find_runs</C></td><td>Recent runs by agent, status, versions, model, scenario, production or eval, or repeated tool calls.</td></tr>
                <tr><td><C>explain_run</C></td><td>What a run did: tool path, and the steps that failed, were retried or repeated, with their arguments.</td></tr>
                <tr><td><C>diff_runs</C></td><td>Two runs aligned step by step, and the configuration that changed between them.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            There is deliberately no free-form query tool: traces contain customer data, and an agent writing its own SQL is both fragile and risky. A plain-text summary of these docs for agents is at <a href="/llms.txt">/llms.txt</a>.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="library">@trajekt/core</H2>
          <Note tone="warn">
            <C>@trajekt/core</C> is not published on npm yet — the release is ready and will be announced here. Until then, build it from the repository and install it by path: <C>pnpm --filter @trajekt/core build</C>, then <C>npm i ../trajekt/packages/core</C> from your project.
          </Note>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Function</th><th>Returns</th></tr></thead>
              <tbody>
                <tr><td><C>normalize(trace)</C></td><td>One <C>Trajectory</C> from a Langfuse trace, OTLP/JSON spans, an AI SDK result or a Trajekt trajectory. The format is detected from the shape of the JSON.</td></tr>
                <tr><td><C>normalizeAll(payload)</C></td><td>One <C>Trajectory</C> per <C>traceId</C>, for OTLP batches that mix traces.</td></tr>
                <tr><td><C>computeMetrics(run)</C></td><td><C>status</C>, <C>durationMs</C>, <C>stepCount</C>, <C>toolCallCount</C>, <C>errorCount</C>, <C>inputTokens</C>, <C>outputTokens</C>, <C>costUsd</C>, <C>costEstimated</C>, <C>redundantToolCalls</C>, <C>retryCount</C>, <C>pathSignature</C>…</td></tr>
                <tr><td><C>annotateSteps(run)</C></td><td>Per step: <C>error</C>, <C>attempt</C>, <C>repeatOf</C>.</td></tr>
                <tr><td><C>diffTrajectories(a, b)</C></td><td>Rows aligned step by step, marked <C>=</C> <C>≠</C> <C>+</C> <C>−</C>, with counts.</td></tr>
                <tr><td><C>compareWindows(baseline, current)</C></td><td>One verdict per metric: <C>regression</C>, <C>improvement</C>, <C>stable</C> or <C>insufficient</C>.</td></tr>
                <tr><td><C>decodeOtlpProtobuf(bytes)</C></td><td>An OTLP protobuf request → its OTLP/JSON form, ready for <C>normalize</C>. No dependency.</td></tr>
                <tr><td><C>traceRun</C>, <C>traceTool</C>, <C>traceLlm</C>, <C>traceAnthropic(client, tracer)</C></td><td>The spans Trajekt reads, with any OpenTelemetry tracer; the Anthropic client wrapper records every model call. See <a href="#send-helpers">Instrument your code</a>.</td></tr>
                <tr><td><C>scoreTrajectory(run, expectations)</C></td><td>The share of expectations met, to send as a quality score.</td></tr>
                <tr><td><C>setMutatingTools(rule)</C></td><td>Which tools change state (a regex, a list of names or a function), for repeated-call detection.</td></tr>
                <tr><td><C>assertTrajectory(run, expectations)</C></td><td>Throws a readable error listing every unmet expectation (tools called, order, arguments, budgets). <C>checkTrajectory</C> returns the list instead.</td></tr>
                <tr><td><C>compareScenarios(a, b)</C></td><td>Eval suite comparison, scenario by scenario: <C>result</C> (<C>pass</C> / <C>fail</C>), <C>reasons</C>, suite-level verdicts and per-scenario changes. <C>scenarioRunOf(run)</C> turns a trajectory into its input.</td></tr>
                <tr><td><C>mergeTrajectories(a, b)</C></td><td>A run assembled from two partial batches of the same trace.</td></tr>
                <tr><td><C>setPricing(prices)</C></td><td>Overrides the price table used to estimate cost.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong id="pricing">Cost estimation.</strong> Spans rarely carry a cost, so it is estimated from tokens with a table of indicative public prices for common Anthropic (including Claude 5.x), OpenAI, Google and Mistral models. Prompt-cache reads and writes are priced separately when the spans report them. The longest matching model prefix wins; an unknown model gets no estimate rather than a wrong one. Prices change: override them.
          </p>
          <Code lang="ts">{`
import { setPricing } from '@trajekt/core';
setPricing({ 'my-fine-tune': { input: 1.2, output: 4.8 } }); // USD per million tokens
`}</Code>
          <Code label="server: same thing through the environment">{`
TRAJEKT_PRICING={"my-fine-tune":{"input":1.2,"output":4.8}}
`}</Code>

          {/* ------------------------------------------------------------ */}
          <H2 id="testing">Testing your agent</H2>
          <p>
            Production tells you an agent got worse after the fact. While you develop it, replay a fixed set of scenarios — mocked tools and data — on every change, and check that nothing regressed before it ships.
          </p>

          <H3 id="test-assert">Assert on a run</H3>
          <p>
            Assert on what the agent did, not only on its final answer. Works with <C>node:test</C>, vitest or jest; the error lists every expectation that failed, with the tool path of the run.
          </p>
          <Code lang="ts" label="triage.test.ts">{`
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalize, assertTrajectory } from '@trajekt/core';

test('npe-checkout: opens a PAY ticket, no loop, within budget', () => {
  const run = normalize(JSON.parse(readFileSync('runs/npe-checkout.json', 'utf8')));
  assertTrajectory(run, {
    status: 'ok',
    order: ['sentry.getIssue', 'gitlab.readFile', 'jira.createIssue'],
    calledWith: [{ tool: 'jira.createIssue', args: { project: 'PAY' } }],
    notCalls: ['gitlab.createMergeRequest'],
    maxRepeatedToolCalls: 0,
    maxSteps: 12,
    maxCostUsd: 0.08,
  });
});
`}</Code>
          <p>
            Also available: <C>calls</C>, <C>maxCallsPerTool</C>, <C>maxToolCalls</C>, <C>maxFailedToolCalls</C>, <C>maxRetries</C>, <C>maxDurationMs</C>, <C>maxTokens</C>. <C>calledWith</C> matches arguments partially (only the keys you give), and reads arguments serialized as JSON.
          </p>

          <H3 id="eval-suites">Eval suites</H3>
          <p>
            One run is not enough to judge a change: the model is not deterministic. Run each scenario a few times, on each version, and send the runs to Trajekt with a <C>trajekt.scenario</C> attribute:
          </p>
          <Code lang="ts" label="eval/run-suite.ts">{`
import { trace } from '@opentelemetry/api';

for (const scenario of scenarios) {          // e.g. 10–30 mocked Sentry issues
  for (let i = 0; i < 3; i++) {              // a few repeats per scenario
    await trace.getTracer('eval').startActiveSpan('invoke_agent sentry-triage', async (span) => {
      span.setAttributes({
        'gen_ai.agent.name': 'sentry-triage',
        'trajekt.scenario': scenario.name,
        'trajekt.agent.version': process.env.GIT_SHA ?? 'dev',
        'trajekt.prompt.version': PROMPT_VERSION,
      });
      await runAgent(scenario.input, { tools: mockedTools(scenario) });
      span.end();
    });
  }
}
`}</Code>
          <p>
            Runs with a scenario are <strong>eval runs</strong>: they are kept out of production metrics, trends and alerts, and compared on <C>/agents/:name/evals</C>. Each scenario is compared <em>with itself</em> across the two versions, which is far more sensitive than comparing averages:
          </p>
          <ul>
            <li><strong>Across the suite</strong>: a paired test (Wilcoxon signed-rank, one-sided, p &lt; 0.05, Holm-corrected across metrics) on each metric and each quality score. Duration, cost, steps and tokens are compared as ratios, so a large scenario does not outweigh a small one. A metric is flagged if the typical change is also large enough: +15%, +5 points on a rate, −0.05 on a score. It needs at least 8 scenarios.</li>
            <li><strong>Scenario by scenario</strong>: no statistics with three runs, plain thresholds instead — a scenario that starts failing (e.g. 0/3 → 2/3), a score down by 0.25 or more, +50% duration, cost, steps or tokens, a tool call repeated that was not before, a tool path never seen in the baseline.</li>
            <li><strong>Result</strong>: <C>fail</C> if a metric regresses across the suite, if a scenario starts failing, or if a scenario's score drops by 0.5 or more. A new tool path is shown but never fails the suite.</li>
          </ul>
          <p>
            Each scenario links to a step-by-step diff of the two versions. Compare on any dimension: agent version, prompt version, app version or model.
          </p>

          <H3 id="eval-ci">In CI</H3>
          <p>
            <strong>GitHub Actions.</strong> Record the suite on <C>main</C> under the commit SHA, run it again on each pull request, and let the action compare the two. It writes the result to the job summary, posts one comment on the pull request (updated on each push) with the scenarios that got worse and a link to their diff, and fails the job on a regression.
          </p>
          <Code lang="yaml" label=".github/workflows/agent-evals.yml">{`
name: Agent evals
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  evals:
    runs-on: ubuntu-latest
    env:
      AGENT_SHA: \${{ github.event.pull_request.head.sha || github.sha }}
    steps:
      - uses: actions/checkout@v4
      # Your suite: mocked tools, a few runs per scenario, each traced with
      # trajekt.scenario and trajekt.agent.version=$AGENT_SHA.
      - run: npm ci && npm run eval
        env:
          OTEL_EXPORTER_OTLP_ENDPOINT: \${{ vars.TRAJEKT_URL }}
          OTEL_EXPORTER_OTLP_PROTOCOL: http/json
          OTEL_EXPORTER_OTLP_HEADERS: Authorization=Bearer \${{ secrets.TRAJEKT_INGEST_KEY }}
      - if: github.event_name == 'pull_request'
        uses: LeoLR/Trajekt/actions/eval-suite@main
        with:
          url: \${{ vars.TRAJEKT_URL }}
          read-key: \${{ secrets.TRAJEKT_READ_KEY }}
          agent: sentry-triage
          baseline: \${{ github.event.pull_request.base.sha }}
          candidate: \${{ env.AGENT_SHA }}
`}</Code>
          <p>
            Inputs: <C>dimension</C> (<C>agent</C> by default; <C>prompt</C>, <C>app</C> or <C>model</C> to compare on another label), <C>fail-on-regression</C> and <C>comment</C> (both <C>true</C>). Outputs: <C>result</C> and <C>report-url</C>. The baseline commit must have been evaluated — that is what the <C>push</C> trigger on <C>main</C> is for. All options are in the <a href="https://github.com/LeoLR/Trajekt/tree/main/actions/eval-suite">action's README</a>.
          </p>
          <p><strong>Any other CI</strong> calls the same endpoint:</p>
          <Code label="against a Trajekt instance (read key)">{`
curl -s -H "Authorization: Bearer $TRAJEKT_READ_KEY" \\
  "$TRAJEKT_URL/api/agents/sentry-triage/evals?dimension=agent&a=$BASE_SHA&b=$GIT_SHA" \\
  | jq -e '.comparison.result == "pass"' || { echo "eval suite regressed"; exit 1; }
`}</Code>
          <p><strong>Without a server</strong>, compare two saved runs of the suite in code:</p>
          <Code lang="ts" label="eval/compare.ts">{`
import { normalize, scenarioRunOf, compareScenarios } from '@trajekt/core';

const baseline = loadRuns('eval/baseline/').map((t) => scenarioRunOf(normalize(t)));
const current = loadRuns('eval/current/').map((t) => scenarioRunOf(normalize(t)));
const r = compareScenarios(baseline, current);
if (r.result === 'fail') {
  console.error(r.reasons.join('\\n'));
  process.exit(1);
}
`}</Code>
          <p>
            A runnable version of all this — a toy agent, mocked scenarios, behaviour tests and the comparison — is in <a href="https://github.com/LeoLR/Trajekt/tree/main/examples/eval-suite"><C>examples/eval-suite</C></a>. An agent can ask the same question through MCP with <C>compare_eval_suite</C>: "did my branch make sentry-triage worse?".
          </p>

          <H3 id="test-trajekt">Test Trajekt itself</H3>
          <Code label="library tests">{`
pnpm --filter @trajekt/core test
`}</Code>
          <p>
            The dashboard tests run the real SQL against a throwaway database, created and dropped by each test file. They need a Postgres that accepts the <C>postgres</C> user without a password:
          </p>
          <Code>{`
docker run -d --name trajekt-test -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
pnpm --filter dashboard test
`}</Code>
          <p>
            <C>TEST_PG_HOST</C>, <C>TEST_PG_PORT</C> and <C>TEST_PG_USER</C> change the target (defaults: <C>127.0.0.1</C>, <C>54329</C>, <C>postgres</C>). <C>pnpm --filter dashboard preview</C> renders every dashboard page with simulated data into static HTML files, without Next.js.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="api">API reference</H2>
          <p>Read routes accept the dashboard session or a read key: <C>Authorization: Bearer tk_read_…</C>.</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Endpoint</th><th>Auth</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td><C>POST /v1/traces</C></td><td>API key</td><td>Ingest OTLP (JSON or protobuf), a Langfuse trace, an AI SDK result or a trajectory. Returns the runs created or completed.</td></tr>
                <tr><td><C>POST /v1/scores</C></td><td>API key</td><td>Attach quality scores to runs, by <C>traceId</C> or <C>runId</C>.</td></tr>
                <tr><td><C>GET /api/agents</C></td><td>read</td><td>One summary per agent.</td></tr>
                <tr><td><C>GET /api/agents/:name/timeseries</C></td><td>read</td><td><C>from</C>, <C>to</C>, <C>bucket=hour|day</C>, <C>version</C>.</td></tr>
                <tr><td><C>GET /api/agents/:name/versions</C></td><td>read</td><td>Metrics per value of <C>dimension=app|agent|prompt|model</C> (default <C>agent</C>).</td></tr>
                <tr><td><C>GET /api/agents/:name/compare</C></td><td>read</td><td><C>mode=window</C>, <C>mode=version&amp;dimension=…</C>, or <C>mode=ab&amp;dimension=…&amp;a=…&amp;b=…</C> with optional <C>from</C>, <C>to</C>.</td></tr>
                <tr><td><C>GET /api/agents/:name/evals</C></td><td>read</td><td>Eval suite comparison: <C>dimension</C>, <C>a</C>, <C>b</C>. <C>comparison.result</C> is <C>pass</C> or <C>fail</C>.</td></tr>
                <tr><td><C>GET /api/runs</C></td><td>read</td><td><C>agent</C>, <C>appVersion</C>, <C>version</C>, <C>promptVersion</C>, <C>model</C>, <C>scenario</C>, <C>kind=live|eval</C>, <C>status</C>, <C>loops=1</C>, <C>from</C>, <C>to</C>, <C>limit</C>, <C>cursor</C>.</td></tr>
                <tr><td><C>GET /api/runs/:id</C></td><td>read</td><td>Run metrics and the full trajectory.</td></tr>
                <tr><td><C>GET /api/alerts</C></td><td>read</td><td>Alerts sent, newest first.</td></tr>
                <tr><td><C>POST /api/mcp</C></td><td>read key</td><td>MCP server (Streamable HTTP, JSON responses).</td></tr>
                <tr><td><C>POST /api/alerts/check</C></td><td><C>CRON_SECRET</C></td><td>Run the regression check on every project and purge old runs (also <C>GET</C>, for Vercel Cron).</td></tr>
                <tr><td><C>GET</C> / <C>POST /api/projects</C></td><td>session</td><td>List projects, or create one (returns its ingestion and read keys, once).</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Errors always have the shape <C>{'{ "error": { "code", "message" } }'}</C>. The full contract is in <a href={`${REPO_URL}/blob/main/docs/api-contract.md`}>docs/api-contract.md</a>.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="troubleshooting">Troubleshooting</H2>
          <dl className="doc-faq">
            <dt>The exporter cannot connect, or uses port 4317</dt>
            <dd>That is gRPC, which Trajekt does not accept. Use OTLP over HTTP: <C>OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf</C> (or <C>http/json</C>) and the dashboard's URL.</dd>
            <dt><C>429 RATE_LIMITED</C> or <C>413 PAYLOAD_TOO_LARGE</C></dt>
            <dd>Too many requests per minute for this project, or a batch too large. Exporters retry on 429; for 413 lower the batch size (<C>OTEL_BSP_MAX_EXPORT_BATCH_SIZE</C>) or raise <C>TRAJEKT_MAX_BODY_MB</C>.</dd>
            <dt><C>422 UNKNOWN_FORMAT</C></dt>
            <dd>The JSON is valid but is not one of the supported shapes. The message lists the top-level keys that were found.</dd>
            <dt><C>401 UNAUTHORIZED</C></dt>
            <dd>The <C>Authorization</C> header is missing, or the key belongs to no project. Keys start with <C>tk_live_</C>.</dd>
            <dt>Runs appear under <C>unknown</C></dt>
            <dd>No agent name was found. Set <C>OTEL_SERVICE_NAME</C> (the SDK default, <C>unknown_service</C>, is ignored) or send <C>X-Trajekt-Agent</C>.</dd>
            <dt>Cost shows <C>—</C></dt>
            <dd>The model is not in the price table, or the spans carry no token counts. Add the model with <C>TRAJEKT_PRICING</C>.</dd>
            <dt>Every metric says "not enough data"</dt>
            <dd>A production comparison needs at least 20 runs on each side, an eval suite at least 8 scenarios.</dd>
            <dt>A metric moved a lot but stays "stable"</dt>
            <dd>The change is not significant once corrected for the number of metrics tested, or it is below the minimum effect. Hover the verdict to see why.</dd>
            <dt>The sign-in page says sign-in is disabled</dt>
            <dd>Set <C>DASHBOARD_PASSWORD</C> and <C>DASHBOARD_SESSION_SECRET</C> (16 characters or more) and restart.</dd>
          </dl>

          <p className="doc-end muted">Missing something? <a href={`${REPO_URL}/issues`}>Open an issue</a>.</p>
        </article>
      </div>
    </Page>
  );
}
