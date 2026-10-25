import { Recorder } from './Recorder';
import { Playground } from './Playground';
import { CopyButton, DEMO_URL, Hatch, Logo, Page, quickstartUrl, REPO_URL, useLang, type Lang } from './Layout';

const INSTALL = 'npm i @trajekt/core';

function CopyCommand() {
  const fr = useLang() === 'fr';
  return (
    <div className="command">
      <code className="mono"><span className="prompt" aria-hidden="true">$</span> {INSTALL}</code>
      <CopyButton text={INSTALL} label={fr ? "Copier la commande d'installation" : 'Copy install command'} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mini-visuels des trois blocs                                         */
/* ------------------------------------------------------------------ */

function ReplayVisual() {
  const fr = useLang() === 'fr';
  return (
    <div className="mini">
      <div className="mini-label mono">#9 jira.createIssue · arguments</div>
      <pre className="mini-code mono">{`{
  "project": "PAY",
  "summary": "NPE in checkout discount",
  "priority": "High"
}`}</pre>
      <div className="mini-label mono">{fr ? 'tentatives' : 'attempts'}</div>
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
  const fr = useLang() === 'fr';
  return (
    <div className="mini">
      <div className="mini-label mono">{fr ? 'coût par step LLM' : 'cost per LLM step'}</div>
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
        <span className="chip chip-amber mono">{fr ? 'searchCode répété ×2' : 'repeated searchCode ×2'}</span>
        <span className="chip chip-amber mono">{fr ? '2 relances · 7,3 s d’attente' : '2 retries · 7.3s backoff'}</span>
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
  const fr = useLang() === 'fr';
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
      <div className="diff-sum mono">{fr ? <>steps 12 → 16 · coût +100 % · résultat <span className="t-err">échec</span></> : <>steps 12 → 16 · cost +100% · outcome <span className="t-err">failed</span></>}</div>
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

const SDK_SNIPPET_FR = SDK_SNIPPET
  .replace('standard OpenTelemetry, nothing proprietary', 'OpenTelemetry standard, rien de propriétaire')
  .replace('With the Vercel AI SDK, turn telemetry on for each call:', 'Avec le Vercel AI SDK, activez la télémétrie à chaque appel :');
const CORE_SNIPPET_FR = CORE_SNIPPET.replace('A Langfuse export, OTLP/JSON spans or an AI SDK result', 'Un export Langfuse, des spans OTLP/JSON ou un résultat AI SDK');

const COPY = {
  en: {
    eyebrow: 'OPEN SOURCE · SELF-HOSTED',
    h1: 'The flight recorder for AI agents.',
    lead: 'Trajekt records every step of every run — reasoning, tool calls, inputs and outputs, tokens, latency, cost — so when an agent goes off the rails in production, you can replay exactly what happened.',
    start: 'Get started',
    demoLink: 'Open the live demo →',
    sourceLink: 'View the source on GitHub →',
    problem: 'When an agent fails, logs show you the last error.',
    problemMuted: 'Not the nine steps that led to it.',
    blocks: [
      ['01 · Replay', 'What did it actually do?', "Step through a run like a timeline. Each step shows the prompt, the model's reasoning, the exact tool arguments and what the tool returned."],
      ['02 · Diagnose', 'Why did this run cost twice as much?', 'Tokens, latency and cost are broken down per step. Retries, repeated tool calls and loops are flagged on the timeline, so the expensive part is the first thing you see.'],
      ['03 · Compare', 'Did my prompt change break it?', 'Put two runs side by side, aligned step by step. Added steps, wrong tools and changed outcomes stand out, next to the configuration that changed between them.'],
    ],
    tryH: 'Try it on a real trace.',
    tryLead: 'Load an example — or your own export — and replay it step by step, with loops, retries and failures flagged.',
    howH: 'Three lines to your first recording.',
    steps: [
      ['Instrument', 'Point any OpenTelemetry exporter at Trajekt. Spans following the GenAI semantic conventions or the Vercel AI SDK telemetry are understood as-is.'],
      ['Record', 'Every run becomes a trajectory: steps, tool arguments and results, tokens, latency and cost, grouped per agent and version.'],
      ['Replay', 'Open any run on a timeline, compare it with another, and see when a new version starts looping, failing or costing more.'],
    ],
    otelLabel: 'OpenTelemetry setup',
    coreNote: 'Already have traces?',
    coreNoteEnd: 'reads them in your own code and tests:',
    worksWith: 'Works with',
    langfuse: 'Langfuse import',
    selfH: 'Your traces stay on your infrastructure.',
    selfLead: 'Prompts and tool results often contain customer data. Trajekt is open source and runs with one Docker Compose file, next to your agents.',
    terminalLabel: 'Terminal: clone the repository and start Trajekt with Docker Compose',
    running: 'Trajekt is running at',
    finalH: 'Record your next run.',
    demo: 'Live demo',
    github: 'View on GitHub',
  },
  fr: {
    eyebrow: 'OPEN SOURCE · AUTO-HÉBERGÉ',
    h1: 'La boîte noire de vos agents IA.',
    lead: 'Trajekt enregistre chaque étape de chaque run — raisonnement, appels d’outils, entrées et sorties, tokens, latence, coût — pour que, le jour où un agent déraille en production, vous puissiez rejouer exactement ce qui s’est passé.',
    start: 'Commencer',
    demoLink: 'Ouvrir la démo →',
    sourceLink: 'Voir le code sur GitHub →',
    problem: 'Quand un agent échoue, les logs montrent la dernière erreur.',
    problemMuted: 'Pas les neuf étapes qui y ont mené.',
    blocks: [
      ['01 · Rejouer', 'Qu’a-t-il vraiment fait ?', 'Parcourez un run comme une timeline. Chaque étape montre le prompt, le raisonnement du modèle, les arguments exacts passés à l’outil et ce qu’il a renvoyé.'],
      ['02 · Diagnostiquer', 'Pourquoi ce run a-t-il coûté deux fois plus ?', 'Tokens, latence et coût sont détaillés étape par étape. Relances, appels d’outils répétés et boucles sont signalés sur la timeline : la partie coûteuse saute aux yeux.'],
      ['03 · Comparer', 'Mon changement de prompt a-t-il tout cassé ?', 'Mettez deux runs côte à côte, alignés étape par étape. Étapes ajoutées, mauvais outils et résultats différents ressortent, à côté de la configuration qui a changé entre les deux.'],
    ],
    tryH: 'Essayez sur une vraie trace.',
    tryLead: 'Chargez un exemple — ou votre propre export — et rejouez-le étape par étape, boucles, relances et échecs signalés.',
    howH: 'Trois lignes pour votre premier enregistrement.',
    steps: [
      ['Instrumenter', 'Branchez n’importe quel exporteur OpenTelemetry sur Trajekt. Les spans qui suivent les conventions sémantiques GenAI ou la télémétrie du Vercel AI SDK sont compris tels quels.'],
      ['Enregistrer', 'Chaque run devient une trajectoire : étapes, arguments et résultats d’outils, tokens, latence et coût, regroupés par agent et par version.'],
      ['Rejouer', 'Ouvrez n’importe quel run sur une timeline, comparez-le à un autre et voyez quand une nouvelle version se met à boucler, à échouer ou à coûter plus cher.'],
    ],
    otelLabel: 'Configuration OpenTelemetry',
    coreNote: 'Vous avez déjà des traces ?',
    coreNoteEnd: 'les lit dans votre propre code et vos tests :',
    worksWith: 'Compatible avec',
    langfuse: 'Import Langfuse',
    selfH: 'Vos traces restent sur votre infrastructure.',
    selfLead: 'Les prompts et les résultats d’outils contiennent souvent des données clients. Trajekt est open source et tourne avec un seul fichier Docker Compose, à côté de vos agents.',
    terminalLabel: 'Terminal : cloner le dépôt et lancer Trajekt avec Docker Compose',
    running: 'Trajekt tourne sur',
    finalH: 'Enregistrez votre prochain run.',
    demo: 'Démo',
    github: 'Voir sur GitHub',
  },
};

export function App({ lang = 'en' }: { lang?: Lang }) {
  const t = COPY[lang];
  const qs = quickstartUrl(lang);
  return (
    <Page page="home" lang={lang}>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow mono"><Hatch />{t.eyebrow}</div>
              <h1>{t.h1}</h1>
              <p className="lead">{t.lead}</p>
              <div className="cta-row">
                <a className="btn btn-amber btn-lg" href={qs}>{t.start}</a>
                <CopyCommand />
              </div>
              <div className="source-links">
                <a className="source-link" href={DEMO_URL}>{t.demoLink}</a>
                <a className="source-link" href={REPO_URL}>{t.sourceLink}</a>
              </div>
            </div>
            <Recorder />
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2 className="h2">
              {t.problem} <span className="muted">{t.problemMuted}</span>
            </h2>
            <div className="blocks">
              <article className="block">
                <div className="block-kicker mono">{t.blocks[0][0]}</div>
                <h3>{t.blocks[0][1]}</h3>
                <p>{t.blocks[0][2]}</p>
                <ReplayVisual />
              </article>
              <article className="block">
                <div className="block-kicker mono">{t.blocks[1][0]}</div>
                <h3>{t.blocks[1][1]}</h3>
                <p>{t.blocks[1][2]}</p>
                <DiagnoseVisual />
              </article>
              <article className="block">
                <div className="block-kicker mono">{t.blocks[2][0]}</div>
                <h3>{t.blocks[2][1]}</h3>
                <p>{t.blocks[2][2]}</p>
                <CompareVisual />
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="try">
          <div className="container">
            <div className="try-head">
              <div>
                <h2 className="h2">{t.tryH}</h2>
                <p className="lead">{t.tryLead}</p>
              </div>
            </div>
            <Playground />
          </div>
        </section>

        <section className="section section-alt" id="how">
          <div className="container">
            <h2 className="h2">{t.howH}</h2>
            <ol className="steps">
              {t.steps.map(([h, p], k) => (
                <li key={h}><span className="step-n mono">0{k + 1}</span><div><h3>{h}</h3><p>{p}</p></div></li>
              ))}
            </ol>
            <pre className="code mono" tabIndex={0} aria-label={t.otelLabel}>{lang === 'fr' ? SDK_SNIPPET_FR : SDK_SNIPPET}</pre>
            <p className="code-note">{t.coreNote} <code className="mono">@trajekt/core</code> {t.coreNoteEnd}</p>
            <pre className="code mono" tabIndex={0} aria-label="@trajekt/core example">{lang === 'fr' ? CORE_SNIPPET_FR : CORE_SNIPPET}</pre>
            <div className="works-with">
              <span>{t.worksWith}</span>
              <span className="tag mono">OpenTelemetry · OTLP/HTTP JSON &amp; protobuf</span>
              <span className="tag mono">GenAI semantic conventions</span>
              <span className="tag mono">Vercel AI SDK</span>
              <span className="tag mono">OpenInference · LangChain, LlamaIndex</span>
              <span className="tag mono">{t.langfuse}</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container selfhost">
            <div>
              <h2 className="h2">{t.selfH}</h2>
              <p className="lead">{t.selfLead}</p>
            </div>
            <div className="terminal" role="img" aria-label={t.terminalLabel}>
              <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
              <pre className="mono">
{`$ git clone ${REPO_URL}.git
$ cd trajekt
$ docker compose up -d
`}<span className="t-ok">✓</span>{` ${t.running} http://localhost:3000`}
              </pre>
            </div>
          </div>
        </section>

        <section className="section final">
          <div className="container final-inner">
            <Logo />
            <h2 className="h2">{t.finalH}</h2>
            <div className="cta-row center">
              <a className="btn btn-amber btn-lg" href={qs}>{t.start}</a>
              <a className="btn btn-outline btn-lg" href={DEMO_URL}>{t.demo}</a>
              <a className="btn btn-outline btn-lg" href={REPO_URL}>{t.github}</a>
            </div>
          </div>
        </section>
    </Page>
  );
}
