import { DEMO_URL, Page, REPO_URL } from './Layout';
import { C, Code, DocNav, H2, H3, Note, type Sections } from './Docs';

/**
 * Documentation en français. Même contenu que Docs.tsx, mêmes ancres :
 * toute modification de l'une doit être reportée dans l'autre.
 */

const SECTIONS: Sections = [
  ['overview', 'Vue d’ensemble'],
  ['quickstart', 'Démarrage rapide'],
  ['install', 'Installation', [['install-docker', 'Docker Compose'], ['install-source', 'Depuis les sources'], ['configuration', 'Configuration']]],
  ['send', 'Envoyer des traces', [['send-otel', 'OpenTelemetry'], ['send-helpers', 'Instrumenter votre code'], ['send-ai-sdk', 'Vercel AI SDK'], ['send-frameworks', 'LangChain, LlamaIndex…'], ['send-file', 'Langfuse et fichiers'], ['identity', 'Agent, versions et modèle']]],
  ['scores', 'Scores de qualité'],
  ['dashboard', 'Utiliser le dashboard', [['compare-versions', 'Comparer des versions']]],
  ['regressions', 'Alertes de régression'],
  ['projects', 'Projets et exploitation', [['redaction', 'Données sensibles']]],
  ['ai', 'Interroger vos agents (MCP)', [['read-keys', 'Clés de lecture'], ['mcp-tools', 'Outils']]],
  ['library', '@trajekt/core'],
  ['testing', 'Tester votre agent', [['test-assert', 'Vérifier un run'], ['eval-suites', 'Suites d’évaluation'], ['eval-ci', 'En CI'], ['test-trajekt', 'Tester Trajekt']]],
  ['api', 'Référence de l’API'],
  ['troubleshooting', 'Dépannage'],
];

export function DocsFr() {
  return (
    <Page page="docs" lang="fr">
      <div className="container doc-layout">
        <DocNav sections={SECTIONS} />

        <article className="doc">
          <div className="eyebrow mono">DOCS</div>
          <h1 className="doc-h1">Installer, enregistrer, rejouer.</h1>
          <p className="doc-lead">
            Tout ce qu’il faut pour faire tourner Trajekt à côté de vos agents, lui envoyer des traces, lire ce qu’ils ont fait et être prévenu quand une nouvelle version se dégrade.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="overview">Vue d’ensemble</H2>
          <p>Trajekt a deux parties :</p>
          <ul>
            <li><strong>Le serveur</strong> (<C>apps/dashboard</C>) : une app Next.js avec un Postgres. Il reçoit les traces sur <C>POST /v1/traces</C>, stocke une ligne par run et sert le dashboard.</li>
            <li><strong>La librairie</strong> (<C>@trajekt/core</C>) : lit une trace dans n’importe quel format supporté vers un modèle unique, calcule ses métriques et compare des groupes de runs. Le serveur l’utilise ; vous pouvez l’utiliser dans vos propres tests.</li>
          </ul>
          <p>Votre agent n’a pas besoin d’un SDK Trajekt. Il envoie des spans OpenTelemetry standard, ou vous postez un fichier de trace.</p>

          {/* ------------------------------------------------------------ */}
          <H2 id="quickstart">Démarrage rapide</H2>
          <p>Il suffit de Docker et de Git.</p>
          <Code label="1 · lancer Trajekt">{`
git clone ${REPO_URL}.git
cd trajekt
cp .env.example .env     # renseigner DASHBOARD_PASSWORD et DASHBOARD_SESSION_SECRET
docker compose up -d --build
`}</Code>
          <Code label="2 · créer un projet (affiche la clé d’API une seule fois)">{`
docker compose exec dashboard pnpm create-project mon-projet
`}</Code>
          <Code label="3 · optionnel : deux semaines de données de démo">{`
docker compose exec dashboard pnpm seed
`}</Code>
          <p>
            Ouvrez <C>http://localhost:3000</C> et connectez-vous avec <C>DASHBOARD_PASSWORD</C>. Avec les données de démo, vous verrez un agent, <C>sentry-triage</C>, dont la version 1.5.0 se met à boucler sur un appel d’outil, coûte plus cher et échoue plus souvent que la 1.4.0 — c’est à ça que ressemble une régression dans Trajekt.
          </p>
          <p>Ensuite, <a href="#send">envoyez vos propres traces</a>.</p>

          {/* ------------------------------------------------------------ */}
          <H2 id="install">Installation</H2>
          <H3 id="install-docker">Docker Compose</H3>
          <p>
            Le fichier compose lance deux conteneurs : Postgres 16 et le dashboard. Les migrations s’exécutent au démarrage du conteneur du dashboard. Le dashboard et le point d’ingestion partagent le port <C>3000</C>.
          </p>
          <Code>{`
docker compose up -d --build     # démarrer
docker compose logs -f dashboard # suivre les logs
docker compose down              # arrêter, garder les données
docker compose down -v           # arrêter et supprimer le volume de la base
`}</Code>
          <Note tone="warn">
            Sans fichier <C>.env</C>, le mot de passe vaut <C>trajekt</C> et le secret de session une valeur de développement. Définissez les deux avant d’exposer le port au-delà de votre machine. Le fichier compose ne fournit ni TLS ni reverse proxy.
          </Note>

          <H3 id="install-source">Depuis les sources</H3>
          <p>Il faut Node.js 22, pnpm 10 et une base Postgres.</p>
          <Code>{`
pnpm install
pnpm --filter @trajekt/core build    # le dashboard importe le paquet compilé

cd apps/dashboard
cp .env.example .env                 # DATABASE_URL, DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET
pnpm migrate
pnpm create-project mon-projet
pnpm dev                             # http://localhost:3000
`}</Code>

          <H3 id="configuration">Configuration</H3>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Variable</th><th>Requise</th><th>Rôle</th></tr></thead>
              <tbody>
                <tr><td><C>DATABASE_URL</C></td><td>oui</td><td>Chaîne de connexion Postgres. Définie par le fichier compose.</td></tr>
                <tr><td><C>DASHBOARD_PASSWORD</C></td><td>oui</td><td>Le mot de passe de la page de connexion. Il y a un seul compte.</td></tr>
                <tr><td><C>DASHBOARD_SESSION_SECRET</C></td><td>oui</td><td>Signe le cookie de session. 16 caractères minimum.</td></tr>
                <tr><td><C>CRON_SECRET</C></td><td>pour les alertes</td><td>Jeton Bearer de <C>POST /api/alerts/check</C>. Le point d’accès est désactivé tant qu’il est vide.</td></tr>
                <tr><td><C>SLACK_WEBHOOK_URL</C></td><td>non</td><td>Webhook entrant Slack. Les nouvelles régressions y sont postées.</td></tr>
                <tr><td><C>TRAJEKT_PUBLIC_URL</C></td><td>non</td><td>URL publique du dashboard, pour les liens des messages Slack.</td></tr>
                <tr><td><C>TRAJEKT_PRICING</C></td><td>non</td><td>Prix personnalisés en JSON, en USD par million de tokens. Voir <a href="#library">l’estimation des coûts</a>.</td></tr>
                <tr><td><C>TRAJEKT_REDACT</C></td><td>non</td><td>Ce qu’il faut masquer avant stockage : <C>secrets</C> (défaut), <C>email</C>, <C>iban</C>, <C>card</C>, <C>phone</C>, <C>ip</C>, séparés par des virgules, ou <C>none</C>. Voir <a href="#redaction">Données sensibles</a>.</td></tr>
                <tr><td><C>TRAJEKT_REDACT_PATTERNS</C></td><td>non</td><td>Vos propres motifs, en JSON : <C>{'[{"name":"customer","pattern":"CUST-\\\\d{6}"}]'}</C>.</td></tr>
                <tr><td><C>TRAJEKT_RETENTION_DAYS</C></td><td>non</td><td>Les runs plus anciens sont supprimés à chaque passage du cron. Vide : conservés indéfiniment.</td></tr>
                <tr><td><C>TRAJEKT_INGEST_RATE_PER_MIN</C></td><td>non</td><td>Requêtes d’ingestion par minute et par projet, par instance du serveur (600 par défaut). Au-delà : <C>429</C> avec <C>Retry-After</C>.</td></tr>
                <tr><td><C>TRAJEKT_MAX_BODY_MB</C></td><td>non</td><td>Taille maximale d’une requête, après gzip (20 par défaut). Au-delà : <C>413</C>.</td></tr>
                <tr><td><C>TRAJEKT_STORE_RAW</C></td><td>non</td><td><C>false</C> : ne pas conserver le payload d’origine de chaque step — environ deux fois moins de stockage, mais le panneau « raw payload » d’un step est vide.</td></tr>
              </tbody>
            </table>
          </div>

          {/* ------------------------------------------------------------ */}
          <H2 id="send">Envoyer des traces</H2>
          <p>
            Chaque requête vers <C>POST /v1/traces</C> doit porter la clé d’API du projet : <C>Authorization: Bearer tk_live_…</C>. Seul son hash est stocké : une clé perdue ne se récupère pas, il faut créer un nouveau projet.
          </p>

          <H3 id="send-otel">OpenTelemetry</H3>
          <p>Pointez n’importe quel exporteur OTLP/HTTP vers l’URL racine de Trajekt ; l’exporteur ajoute lui-même <C>/v1/traces</C>. Les encodages JSON et protobuf fonctionnent tous les deux : les réglages par défaut des SDK Python, Java ou Go conviennent.</p>
          <Code label=".env de votre agent">{`
OTEL_SERVICE_NAME=sentry-triage
OTEL_RESOURCE_ATTRIBUTES=service.version=3.2.0,trajekt.agent.version=1.5.0,trajekt.prompt.version=v8
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf   # ou http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."
`}</Code>
          <p>Ou dans le code, avec le SDK Node :</p>
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
            Trajekt lit les spans qui suivent les conventions sémantiques GenAI d’OpenTelemetry : <C>gen_ai.operation.name</C>, <C>gen_ai.request.model</C>, <C>gen_ai.usage.input_tokens</C> / <C>output_tokens</C>, <C>gen_ai.tool.name</C>, <C>gen_ai.tool.call.arguments</C> / <C>result</C>, <C>gen_ai.input.messages</C> / <C>output.messages</C>. Il lit aussi les spans OpenInference et OpenLLMetry (voir <a href="#send-frameworks">plus bas</a>). Un span est en échec si son statut est <C>ERROR</C> ou s’il enregistre une exception.
          </p>
          <p>
            Un exporteur envoie une trace en plusieurs lots, les enfants d’abord. Trajekt fusionne tous les lots d’un même <C>traceId</C> en un seul run ; renvoyer un lot ne duplique pas les steps.
          </p>
          <Note>Gzip est accepté. gRPC ne l’est pas : utilisez OTLP sur HTTP (port 3000, chemin <C>/v1/traces</C>).</Note>

          <H3 id="send-helpers">Instrumenter votre code</H3>
          <p>
            Si votre agent est écrit à la main, <C>@trajekt/core</C> fournit deux helpers qui créent les spans attendus par Trajekt, avec n’importe quel tracer OpenTelemetry. Les arguments des outils comptent : sans eux, les appels répétés ne peuvent pas être détectés.
          </p>
          <Code lang="ts" label="agent.ts">{`
import { trace } from '@opentelemetry/api';
import { traceRun, traceTool } from '@trajekt/core';

const tracer = trace.getTracer('sentry-triage');

await traceRun(tracer, { agent: 'sentry-triage', agentVersion: '1.5.0', promptVersion: 'v8' }, async (run) => {
  const issue = await traceTool(tracer, 'sentry.getIssue', { id }, () => sentry.getIssue(id));
  const ticket = await traceTool(tracer, 'jira.createIssue', { project, summary }, () => jira.createIssue(project, summary));
  run.score('correct', ticket.project === expectedProject); // score de qualité, optionnel
  return ticket;
});
`}</Code>
          <p>
            Appels au modèle : enveloppez le client Anthropic une fois et chaque <C>messages.create</C> est enregistré — modèle, tokens y compris le cache de prompt (tarifé comme tel), raison d’arrêt, et les messages sauf avec <C>{'{ captureContent: false }'}</C>. Autres SDK : <C>{'traceLlm(tracer, { model, input }, () => call())'}</C> lit les réponses Anthropic et OpenAI.
          </p>
          <Code lang="ts">{`
import Anthropic from '@anthropic-ai/sdk';
import { traceAnthropic } from '@trajekt/core';

const anthropic = traceAnthropic(new Anthropic(), tracer);
// le code de l'agent ne change pas :
const msg = await anthropic.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 1024, system, messages, tools });
`}</Code>
          <p>
            <C>traceRun</C> accepte aussi <C>appVersion</C>, <C>environment</C> et <C>scenario</C> (pour les <a href="#eval-suites">runs d’évaluation</a>), et expose <C>run.traceId</C> pour attacher un score plus tard. Une exception qui sort du run le marque en échec ; une exception levée par un outil ne marque que ce step.
          </p>

          <H3 id="send-ai-sdk">Vercel AI SDK</H3>
          <p>Avec un exporteur OpenTelemetry configuré comme ci-dessus, activez la télémétrie à chaque appel. <C>functionId</C> devient le nom de l’agent.</p>
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
            Sans OpenTelemetry, vous pouvez poster l’objet résultat lui-même (la valeur qui contient <C>steps</C>) sur <C>/v1/traces</C>. Il ne porte ni horodatage ni identifiant de trace : chaque envoi est un run distinct, et le nom de l’agent doit venir d’un en-tête.
          </p>

          <H3 id="send-frameworks">LangChain, LlamaIndex, CrewAI…</H3>
          <p>
            Les frameworks Python sont généralement tracés avec <a href="https://github.com/Arize-ai/openinference">OpenInference</a> ou <a href="https://github.com/traceloop/openllmetry">OpenLLMetry</a>. Trajekt lit les deux : modèle, tokens, coût et messages des spans LLM ; nom, arguments et résultat des spans d’outils ; le nom de l’agent depuis le span <C>AGENT</C> ou le nom du workflow. Pointez leur exporteur OTLP vers Trajekt :
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
            Définissez les versions avec des attributs de ressource (<C>OTEL_RESOURCE_ATTRIBUTES=service.version=3.2.0,trajekt.agent.version=1.5.0,trajekt.prompt.version=v8</C>) pour pouvoir les comparer.
          </p>

          <H3 id="send-file">Exports Langfuse et fichiers de trace</H3>
          <p>
            Déjà sur Langfuse ? Importez ses traces, scores compris, sans toucher à votre agent. Lancez l’import à intervalle régulier : il n’ajoute que ce qui est nouveau et ne duplique jamais un run.
          </p>
          <Code label="importer les 7 derniers jours d’un agent">{`
LANGFUSE_HOST=https://cloud.langfuse.com \\
LANGFUSE_PUBLIC_KEY=pk-lf-... LANGFUSE_SECRET_KEY=sk-lf-... \\
pnpm --filter dashboard import-langfuse --since 7d --name sentry-triage
`}</Code>
          <p>
            Les versions viennent de la trace : <C>release</C> devient la version de l’app, <C>version</C> la version de l’agent, <C>metadata.promptVersion</C> la version du prompt. Une trace Langfuse seule — la réponse de <C>GET /api/public/traces/:traceId</C> — peut aussi être postée telle quelle, tout comme un fichier OTLP/JSON.
          </p>
          <Code>{`
curl -X POST http://localhost:3000/v1/traces \\
  -H "Authorization: Bearer tk_live_..." \\
  -H "Content-Type: application/json" \\
  -H "X-Trajekt-Agent: support-bot" \\
  --data @trace.json
`}</Code>
          <p>
            Fichiers d’exemple pour chaque format : <a href="/samples/otlp-sentry-triage.json" download>OTLP</a>, <a href="/samples/langfuse-support-bot.json" download>Langfuse</a>, <a href="/samples/ai-sdk-trip-planner.json" download>Vercel AI SDK</a>.
          </p>

          <H3 id="identity">Agent, versions et modèle</H3>
          <p>
            Chaque run porte cinq étiquettes. Le nom de l’agent regroupe les runs ; les quatre autres sont les dimensions sur lesquelles comparer :
          </p>
          <ul>
            <li><strong>Version de l’app</strong> — la release de l’application qui embarque l’agent (votre service, votre app web).</li>
            <li><strong>Version de l’agent</strong> — l’agent lui-même : son code, ses outils, son orchestration. Par défaut, c’est la version de l’app si vous ne la définissez pas.</li>
            <li><strong>Version du prompt</strong> — la version du prompt système ou du template de prompt.</li>
            <li><strong>Modèle</strong> — lu dans les appels LLM du run (le plus utilisé), rien à définir.</li>
          </ul>
          <p>Pour chaque champ, la première valeur trouvée l’emporte.</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Champ</th><th>OpenTelemetry (span, puis ressource)</th><th>Langfuse</th><th>En-tête de repli</th></tr></thead>
              <tbody>
                <tr><td>Agent</td><td><C>trajekt.agent.name</C>, <C>gen_ai.agent.name</C>, <C>ai.telemetry.functionId</C>, <C>service.name</C></td><td><C>metadata.agentName</C>, nom de la trace</td><td><C>X-Trajekt-Agent</C></td></tr>
                <tr><td>Version de l’app</td><td><C>trajekt.app.version</C>, <C>app.version</C>, <C>ai.telemetry.metadata.appVersion</C>, <C>service.version</C></td><td><C>metadata.appVersion</C>, <C>release</C></td><td><C>X-Trajekt-App-Version</C></td></tr>
                <tr><td>Version de l’agent</td><td><C>trajekt.agent.version</C>, <C>gen_ai.agent.version</C>, <C>ai.telemetry.metadata.agentVersion</C> — sinon la version de l’app</td><td><C>metadata.agentVersion</C>, <C>version</C>, <C>release</C></td><td><C>X-Trajekt-Agent-Version</C></td></tr>
                <tr><td>Version du prompt</td><td><C>trajekt.prompt.version</C>, <C>gen_ai.prompt.version</C>, <C>ai.telemetry.metadata.promptVersion</C></td><td><C>metadata.promptVersion</C>, <C>promptVersion</C> de la génération</td><td><C>X-Trajekt-Prompt-Version</C></td></tr>
                <tr><td>Environnement</td><td><C>trajekt.environment</C>, <C>deployment.environment.name</C></td><td><C>environment</C></td><td><C>X-Trajekt-Environment</C></td></tr>
                <tr><td>Scores</td><td><C>trajekt.score.&lt;nom&gt;</C> (un nombre, plus c’est haut mieux c’est) — voir <a href="#scores">Scores de qualité</a></td><td><C>scores</C> de la trace (numériques et booléens)</td><td><C>POST /v1/scores</C></td></tr>
                <tr><td>Scénario</td><td><C>trajekt.scenario</C>, <C>ai.telemetry.metadata.scenario</C> — marque un run d’évaluation, voir <a href="#eval-suites">Suites d’évaluation</a></td><td><C>metadata.scenario</C></td><td><C>X-Trajekt-Scenario</C></td></tr>
              </tbody>
            </table>
          </div>
          <p>Les en-têtes ne servent que si la trace ne porte aucune valeur. Un run sans nom d’agent est classé sous <C>unknown</C>.</p>
          <Note>
            Si votre app et votre agent sont livrés ensemble, <C>service.version</C> suffit. Définissez <C>trajekt.agent.version</C> et <C>trajekt.prompt.version</C> dès qu’ils évoluent séparément — sinon un changement de prompt ne se distingue pas d’une release de l’app.
          </Note>

          {/* ------------------------------------------------------------ */}
          <H2 id="scores">Scores de qualité</H2>
          <p>
            Coût, durée et échecs disent comment un agent a tourné, pas s’il a fait la bonne chose. Une version moins chère qui crée les tickets dans le mauvais projet a l’air meilleure sur toutes les autres métriques. Les scores comblent ce manque : un nombre par run et par nom, <strong>plus c’est haut, mieux c’est</strong>, idéalement entre 0 et 1 — correct ou non, part des attentes remplies, note d’un juge LLM, pouce levé.
          </p>
          <ul>
            <li><strong>Dans la trace</strong> : un attribut <C>trajekt.score.correct = 1</C> sur n’importe quel span, ou <C>run.score('correct', true)</C> avec <C>traceRun</C>. Les scores Langfuse arrivent avec la trace.</li>
            <li><strong>Après coup</strong>, quand vous savez : le retour de l’utilisateur, la merge request acceptée, une revue. Envoyez-le avec l’identifiant de trace que votre app connaît déjà. Un score envoyé ainsi n’est jamais écrasé par la trace.</li>
          </ul>
          <Code label="POST /v1/scores — clé d’ingestion">{`
curl -X POST https://trajekt.example.com/v1/scores \\
  -H "Authorization: Bearer tk_live_..." -H "Content-Type: application/json" \\
  -d '{ "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "name": "correct", "value": 0, "comment": "mauvais projet Jira" }'
`}</Code>
          <p>
            Il accepte aussi une liste (<C>{'{ "scores": [ … ] }'}</C>, jusqu’à 500) et un <C>runId</C> Trajekt au lieu d’un <C>traceId</C>. Dans les tests, <C>scoreTrajectory(run, expectations)</C> transforme des <a href="#test-assert">vérifications</a> en score (la part des attentes remplies).
          </p>
          <p>
            Les scores sont comparés comme les autres métriques, mais c’est une <em>baisse</em> qui est une régression : en production (au moins −0,05, significative, 20 runs notés de chaque côté — alertes comprises), et dans les <a href="#eval-suites">suites d’évaluation</a>, où ils passent en premier et où un scénario dont le score baisse de 0,5 ou plus fait échouer la suite. Ils s’affichent sur chaque run, dans la liste des runs quand ils sont sous 1, et par version sur la page de l’agent.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="dashboard">Utiliser le dashboard</H2>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Page</th><th>Pour</th></tr></thead>
              <tbody>
                <tr><td><C>/</C> Agents</td><td>Voir quels agents ont régressé. Une carte par agent : runs, taux d’échec, durée médiane et coût moyen sur 24 h, tendance sur 14 jours, et les régressions trouvées.</td></tr>
                <tr><td><C>/agents/:name</C></td><td>Répondre à « est-ce que ça se dégrade, et depuis quand ? ». Comparer les versions métrique par métrique (voir plus bas), les dernières 24 h face aux 7 jours précédents, tendances quotidiennes avec le premier run de chaque version marqué, chemins d’outils par version, runs récents.</td></tr>
                <tr><td><C>/runs</C></td><td>Filtrer les runs par agent, version d’app, version d’agent, version de prompt, modèle, statut, ou « appels d’outils répétés uniquement ».</td></tr>
                <tr><td><C>/runs/:id</C></td><td>Rejouer un run sur une timeline. Les appels répétés (<C>REPEAT #5</C>), les relances (<C>ATTEMPT 2</C>) et les échecs sont signalés ; cliquez sur un step pour voir ses arguments, son résultat, son prompt ou sa sortie.</td></tr>
                <tr><td><C>/runs/:id/compare</C></td><td>Aligner deux runs étape par étape. Par défaut, le run est comparé au dernier run réussi de la version précédente ; ajoutez <C>?with=&lt;id du run&gt;</C> pour en choisir un autre.</td></tr>
                <tr><td><C>/agents/:name/evals</C></td><td>Comparer deux versions sur votre suite d’évaluation, scénario par scénario : PASS ou FAIL, ce qui s’est dégradé, et un diff par scénario. Voir <a href="#eval-suites">Suites d’évaluation</a>.</td></tr>
                <tr><td><C>/explore</C></td><td>Ouvrir un fichier de trace dans le navigateur sans l’envoyer au serveur.</td></tr>
              </tbody>
            </table>
          </div>
          <H3 id="compare-versions">Comparer des versions</H3>
          <p>
            Sur la page d’un agent, <strong>Compare by</strong> choisit la dimension — version d’app, version d’agent, version de prompt ou modèle — et la comparaison suit :
          </p>
          <ul>
            <li><strong>Latest vs previous</strong> : la valeur la plus récente face à la précédente.</li>
            <li><strong>Pick two</strong> : n’importe quels A et B, par exemple le prompt <C>v7</C> face au <C>v8</C>, ou l’app <C>3.1.0</C> face à la <C>3.2.0</C>. Pour les modèles, A est par défaut le plus utilisé : un modèle moins cher à l’essai apparaît en B.</li>
          </ul>
          <p>
            L’URL garde la sélection (<C>/agents/sentry-triage?dim=prompt&amp;compare=ab&amp;a=v7&amp;b=v8</C>) : une comparaison se partage par un lien. Le tableau des versions, les chemins d’outils et les filtres de runs suivent la même dimension.
          </p>
          <Note tone="warn">
            Comparer deux versions d’app compare aussi tout ce qui a été livré avec. Si une nouvelle version d’agent est sortie sur la même période, réduisez la plage de temps — l’API accepte <C>from</C> et <C>to</C> — ou comparez sur la dimension agent.
          </Note>
          <p>Comment les métriques d’un run sont calculées :</p>
          <ul>
            <li><strong>Appel d’outil répété</strong> : le même outil avec les mêmes arguments (ordre des clés ignoré) qu’un appel précédent réussi, sans appel modifiant l’état entre les deux. Relire un fichier après l’avoir modifié, ou relancer les tests après un correctif, n’est pas une boucle ; faire deux fois de suite la même écriture, si. Un outil est considéré comme modifiant l’état d’après son nom (<C>write</C>, <C>edit</C>, <C>create</C>, <C>update</C>, <C>post</C>, <C>run</C>, <C>bash</C>… mais pas <C>get</C>, <C>read</C>, <C>search</C>, <C>list</C>…) ; <C>setMutatingTools()</C> de <C>@trajekt/core</C> remplace cette règle. Les appels sans arguments capturés ne sont jamais comptés.</li>
            <li><strong>Relance</strong> : un appel au même outil ou au même modèle juste après l’échec de cet appel. Une relance n’est pas comptée comme une répétition.</li>
            <li><strong>Statut</strong> : avec un seul span racine, c’est la racine qui décide — les erreurs rattrapées dans le run ne le font pas échouer. Sinon, c’est le dernier step qui n’est pas un span système.</li>
            <li><strong>Coût</strong> : le coût fourni par la source quand il existe (Langfuse), sinon estimé à partir des tokens et affiché avec <C>≈</C>.</li>
            <li><strong>Chemin d’outils</strong> : les outils dans l’ordre ; les relances sont retirées et les répétitions consécutives deviennent <C>×n</C>, par exemple <C>sentry.getIssue → gitlab.searchCode ×3 → jira.createIssue</C>.</li>
          </ul>

          {/* ------------------------------------------------------------ */}
          <H2 id="regressions">Alertes de régression</H2>
          <p>Deux comparaisons tournent pour chaque agent ayant eu des runs dans les dernières 24 h :</p>
          <ul>
            <li>les dernières 24 h face aux 7 jours précédents ;</li>
            <li>les dernières versions d’agent, de prompt et d’app face à la précédente, chacune tant qu’elle a moins de 7 jours — un changement de prompt seul peut déclencher une alerte.</li>
          </ul>
          <p>
            Huit métriques sont comparées — runs en échec, appels d’outils en échec, durée moyenne, coût moyen, steps par run, tokens par run, appels d’outils répétés, part des runs sur un chemin d’outils jamais vu — plus chaque <a href="#scores">score de qualité</a> présent des deux côtés. Une métrique n’est signalée que si les trois conditions sont réunies :
          </p>
          <ul>
            <li>l’écart est statistiquement significatif (test unilatéral, p &lt; 0,01), et le reste après correction pour le nombre de métriques testées en même temps (Holm) — sinon une métrique sur dix crierait au loup par hasard ;</li>
            <li>il est assez grand pour compter : +15 % sur une moyenne, +3 points sur un taux, −0,05 sur un score ;</li>
            <li>il y a au moins 20 runs de chaque côté.</li>
          </ul>
          <p>Lancez la vérification à intervalle régulier. Elle couvre tous les projets ; chaque nouvelle régression est enregistrée et postée sur Slack une fois par agent et par métrique toutes les 24 h. Le même appel purge les anciens runs quand <C>TRAJEKT_RETENTION_DAYS</C> est défini.</p>
          <Code label="crontab — toutes les heures">{`
0 * * * * curl -fsS -X POST https://trajekt.example.com/api/alerts/check -H "Authorization: Bearer $CRON_SECRET"
`}</Code>
          <Code label="ou dans le conteneur">{`
docker compose exec dashboard pnpm check-regressions
`}</Code>

          {/* ------------------------------------------------------------ */}
          <H2 id="projects">Projets et exploitation</H2>
          <p>
            Un projet regroupe des runs et a ses propres clés d’API : un par équipe, produit ou environnement. Créez et ouvrez les projets depuis la page <C>/projects</C> du dashboard — les clés ne sont affichées qu’une fois, à la création — ou en ligne de commande avec <C>pnpm --filter dashboard create-project &lt;nom&gt;</C>. Il y a toujours un seul mot de passe de connexion pour toute l’instance.
          </p>
          <H3 id="redaction">Données sensibles</H3>
          <p>
            Les prompts, les arguments et les résultats d’outils contiennent souvent des données clients. Trajekt les masque <strong>avant tout stockage</strong> — messages, arguments, résultats, erreurs et payload d’origine. Par défaut, il masque les secrets : clés d’API et jetons (Anthropic, OpenAI, GitHub, GitLab, Slack, AWS, Stripe, Google, Trajekt), en-têtes Bearer, JWT, et la valeur des clés comme <C>password</C>, <C>token</C>, <C>api_key</C> ou <C>authorization</C>. Ajoutez ce dont votre domaine a besoin :
          </p>
          <Code label=".env">{`
TRAJEKT_REDACT=secrets,email,iban,card,phone
TRAJEKT_REDACT_PATTERNS=[{"name":"customer","pattern":"CUST-\\\\d{6}"},{"name":"contract","pattern":"CTR-[A-Z0-9]{8}"}]
`}</Code>
          <p>
            Une correspondance devient une marque — <C>[email]</C>, <C>[iban]</C>, <C>[card]</C> (seulement les numéros qui passent le contrôle de Luhn), <C>[customer]</C> — toujours la même pour un même type de valeur : les métriques et la détection des appels répétés fonctionnent toujours. Si la configuration est invalide, l’ingestion refuse la requête (<C>503</C>) plutôt que de stocker des données que vous pensiez masquées. Dans votre code, <C>createRedactor</C> et <C>redactTrajectory</C> de <C>@trajekt/core</C> appliquent les mêmes règles ; avec <C>traceAnthropic</C>, <C>{'{ captureContent: false }'}</C> garde les prompts totalement hors des traces.
          </p>
          <ul>
            <li><strong>Rétention</strong> : <C>TRAJEKT_RETENTION_DAYS=90</C> supprime les runs plus anciens (et leurs scores) à chaque passage du cron ; les alertes sont gardées au moins 90 jours.</li>
            <li><strong>Stockage</strong> : un run stocke chaque step avec son payload d’origine. <C>TRAJEKT_STORE_RAW=false</C> retire le payload et divise la taille par deux environ ; Postgres compresse déjà le reste.</li>
            <li><strong>Limites d’ingestion</strong> : 600 requêtes par minute et par projet (<C>TRAJEKT_INGEST_RATE_PER_MIN</C>), 20 Mo par requête après gzip (<C>TRAJEKT_MAX_BODY_MB</C>). Les exporteurs OpenTelemetry réessaient sur <C>429</C> et respectent <C>Retry-After</C>. La limite est tenue en mémoire, par instance du serveur : un garde-fou, pas un quota.</li>
          </ul>

          {/* ------------------------------------------------------------ */}
          <H2 id="ai">Interroger vos agents (MCP)</H2>
          <p>
            Trajekt est un serveur MCP. Connectez-y Claude, Cursor ou votre propre agent et posez vos questions en langage naturel : <em>« sentry-triage s’est-il dégradé depuis le prompt v8 ? »</em>, <em>« pourquoi ce run a-t-il échoué ? »</em>, <em>« le modèle moins cher est-il assez bon ? »</em>.
          </p>
          <p>
            Les outils renvoient des réponses déjà calculées par Trajekt — verdicts statistiques, résumés de runs, différences — sous forme de texte court et de JSON structuré. Votre agent n’a jamais à lire des milliers de spans : ses réponses restent courtes et fondées sur les chiffres. Tous les outils sont en lecture seule.
          </p>
          <Code label="Claude Code">{`
claude mcp add --transport http trajekt http://localhost:3000/api/mcp \\
  --header "Authorization: Bearer tk_read_..."
`}</Code>
          <Code lang="json" label="n’importe quel client MCP (Streamable HTTP)">{`
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
            Essayez sans rien installer : la <a href={DEMO_URL}>démo en ligne</a> expose son point d’accès MCP sans clé sur <C>{`${DEMO_URL}/api/mcp`}</C>.
          </p>

          <H3 id="read-keys">Clés de lecture</H3>
          <p>
            Les clés ont une portée. Une clé d’ingestion (<C>tk_live_…</C>) ne peut qu’envoyer des traces ; une clé de lecture (<C>tk_read_…</C>) ne peut que lire — le serveur MCP et toutes les routes <C>GET /api/*</C>. Donnez une clé de lecture aux agents, jamais votre clé d’ingestion.
          </p>
          <Code>{`
docker compose exec dashboard pnpm create-read-key claude-desktop
`}</Code>

          <H3 id="mcp-tools">Outils</H3>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Outil</th><th>Répond à</th></tr></thead>
              <tbody>
                <tr><td><C>list_agents</C></td><td>Quels agents existent, leur activité sur 24 h, et lesquels ont régressé. Le point de départ.</td></tr>
                <tr><td><C>list_versions</C></td><td>Versions d’app, versions d’agent, versions de prompt ou modèles d’un agent, avec leurs métriques.</td></tr>
                <tr><td><C>compare</C></td><td>B est-il pire que A ? Deux valeurs de n’importe quelle dimension, la dernière face à la précédente, ou les dernières 24 h face aux 7 jours précédents — un verdict par métrique.</td></tr>
                <tr><td><C>compare_eval_suite</C></td><td>Pour les runs d’évaluation (marqués d’un scénario) : PASS ou FAIL entre deux versions, les verdicts sur la suite, et les scénarios dégradés avec ce qui a changé.</td></tr>
                <tr><td><C>get_regressions</C></td><td>Les régressions détectées maintenant, et les alertes déjà envoyées.</td></tr>
                <tr><td><C>find_runs</C></td><td>Runs récents par agent, statut, versions, modèle, scénario, production ou évaluation, ou appels d’outils répétés.</td></tr>
                <tr><td><C>explain_run</C></td><td>Ce qu’un run a fait : chemin d’outils, et les steps en échec, relancés ou répétés, avec leurs arguments.</td></tr>
                <tr><td><C>diff_runs</C></td><td>Deux runs alignés étape par étape, et la configuration qui a changé entre eux.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Il n’y a volontairement pas d’outil de requête libre : les traces contiennent des données clients, et un agent qui écrit son propre SQL est à la fois fragile et risqué. Un résumé en texte brut de cette doc, destiné aux agents, est disponible sur <a href="/llms.txt">/llms.txt</a> (en anglais).
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="library">@trajekt/core</H2>
          <Note tone="warn">
            <C>@trajekt/core</C> n’est pas encore publié sur npm — la release est prête et sera annoncée ici. D’ici là, compilez-le depuis le dépôt et installez-le par chemin : <C>pnpm --filter @trajekt/core build</C>, puis <C>npm i ../trajekt/packages/core</C> depuis votre projet.
          </Note>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Fonction</th><th>Renvoie</th></tr></thead>
              <tbody>
                <tr><td><C>normalize(trace)</C></td><td>Une <C>Trajectory</C> à partir d’une trace Langfuse, de spans OTLP/JSON, d’un résultat AI SDK ou d’une trajectoire Trajekt. Le format est détecté d’après la forme du JSON.</td></tr>
                <tr><td><C>normalizeAll(payload)</C></td><td>Une <C>Trajectory</C> par <C>traceId</C>, pour les lots OTLP qui mélangent plusieurs traces.</td></tr>
                <tr><td><C>computeMetrics(run)</C></td><td><C>status</C>, <C>durationMs</C>, <C>stepCount</C>, <C>toolCallCount</C>, <C>errorCount</C>, <C>inputTokens</C>, <C>outputTokens</C>, <C>costUsd</C>, <C>costEstimated</C>, <C>redundantToolCalls</C>, <C>retryCount</C>, <C>pathSignature</C>…</td></tr>
                <tr><td><C>annotateSteps(run)</C></td><td>Par step : <C>error</C>, <C>attempt</C>, <C>repeatOf</C>.</td></tr>
                <tr><td><C>diffTrajectories(a, b)</C></td><td>Lignes alignées étape par étape, marquées <C>=</C> <C>≠</C> <C>+</C> <C>−</C>, avec les totaux.</td></tr>
                <tr><td><C>compareWindows(baseline, current)</C></td><td>Un verdict par métrique : <C>regression</C>, <C>improvement</C>, <C>stable</C> ou <C>insufficient</C>.</td></tr>
                <tr><td><C>decodeOtlpProtobuf(bytes)</C></td><td>Une requête OTLP protobuf → sa forme OTLP/JSON, prête pour <C>normalize</C>. Sans dépendance.</td></tr>
                <tr><td><C>traceRun</C>, <C>traceTool</C>, <C>traceLlm</C>, <C>traceAnthropic(client, tracer)</C></td><td>Les spans que lit Trajekt, avec n’importe quel tracer OpenTelemetry ; l’enveloppe du client Anthropic enregistre chaque appel au modèle. Voir <a href="#send-helpers">Instrumenter votre code</a>.</td></tr>
                <tr><td><C>scoreTrajectory(run, expectations)</C></td><td>La part des attentes remplies, à envoyer comme score de qualité.</td></tr>
                <tr><td><C>createRedactor(options)</C>, <C>redactTrajectory(run, options)</C></td><td>Masque emails, IBAN, cartes, téléphones, secrets et vos propres motifs dans n’importe quelle valeur ou run. Voir <a href="#redaction">Données sensibles</a>.</td></tr>
                <tr><td><C>setMutatingTools(rule)</C></td><td>Quels outils modifient l’état (une regex, une liste de noms ou une fonction), pour la détection des appels répétés.</td></tr>
                <tr><td><C>assertTrajectory(run, expectations)</C></td><td>Lève une erreur lisible qui liste chaque attente non remplie (outils appelés, ordre, arguments, budgets). <C>checkTrajectory</C> renvoie la liste à la place.</td></tr>
                <tr><td><C>compareScenarios(a, b)</C></td><td>Comparaison de suites d’évaluation, scénario par scénario : <C>result</C> (<C>pass</C> / <C>fail</C>), <C>reasons</C>, verdicts sur la suite et changements par scénario. <C>scenarioRunOf(run)</C> transforme une trajectoire en entrée.</td></tr>
                <tr><td><C>mergeTrajectories(a, b)</C></td><td>Un run reconstitué à partir de deux lots partiels d’une même trace.</td></tr>
                <tr><td><C>setPricing(prices)</C></td><td>Remplace la table de prix utilisée pour estimer les coûts.</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong id="pricing">Estimation des coûts.</strong> Les spans portent rarement un coût : il est estimé à partir des tokens avec une table de prix publics indicatifs pour les modèles courants d’Anthropic (dont Claude 5.x), OpenAI, Google et Mistral. Les lectures et écritures du cache de prompt sont tarifées à part quand les spans les rapportent. Le préfixe de modèle le plus long l’emporte ; un modèle inconnu n’a pas d’estimation plutôt qu’une estimation fausse. Les prix changent : remplacez-les.
          </p>
          <Code lang="ts">{`
import { setPricing } from '@trajekt/core';
setPricing({ 'my-fine-tune': { input: 1.2, output: 4.8 } }); // USD par million de tokens
`}</Code>
          <Code label="serveur : la même chose par l’environnement">{`
TRAJEKT_PRICING={"my-fine-tune":{"input":1.2,"output":4.8}}
`}</Code>

          {/* ------------------------------------------------------------ */}
          <H2 id="testing">Tester votre agent</H2>
          <p>
            La production vous dit qu’un agent s’est dégradé après coup. Pendant le développement, rejouez un jeu fixe de scénarios — outils et données mockés — à chaque changement, et vérifiez que rien n’a régressé avant la mise en production.
          </p>

          <H3 id="test-assert">Vérifier un run</H3>
          <p>
            Vérifiez ce que l’agent a fait, pas seulement sa réponse finale. Fonctionne avec <C>node:test</C>, vitest ou jest ; l’erreur liste chaque attente non remplie, avec le chemin d’outils du run.
          </p>
          <Code lang="ts" label="triage.test.ts">{`
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalize, assertTrajectory } from '@trajekt/core';

test('npe-checkout : ouvre un ticket PAY, sans boucle, dans le budget', () => {
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
            Également disponibles : <C>calls</C>, <C>maxCallsPerTool</C>, <C>maxToolCalls</C>, <C>maxFailedToolCalls</C>, <C>maxRetries</C>, <C>maxDurationMs</C>, <C>maxTokens</C>. <C>calledWith</C> compare les arguments partiellement (seulement les clés fournies) et lit les arguments sérialisés en JSON.
          </p>

          <H3 id="eval-suites">Suites d’évaluation</H3>
          <p>
            Un seul run ne suffit pas pour juger un changement : le modèle n’est pas déterministe. Jouez chaque scénario quelques fois, sur chaque version, et envoyez les runs à Trajekt avec un attribut <C>trajekt.scenario</C> :
          </p>
          <Code lang="ts" label="eval/run-suite.ts">{`
import { trace } from '@opentelemetry/api';

for (const scenario of scenarios) {          // par ex. 10 à 30 issues Sentry mockées
  for (let i = 0; i < 3; i++) {              // quelques répétitions par scénario
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
            Les runs avec un scénario sont des <strong>runs d’évaluation</strong> : ils sont exclus des métriques de production, des tendances et des alertes, et comparés sur <C>/agents/:name/evals</C>. Chaque scénario est comparé <em>à lui-même</em> entre les deux versions, ce qui est bien plus sensible que de comparer des moyennes :
          </p>
          <ul>
            <li><strong>Sur toute la suite</strong> : un test apparié (Wilcoxon signé, unilatéral, p &lt; 0,05, corrigé par Holm sur l’ensemble des métriques) sur chaque métrique et chaque score de qualité. Durée, coût, steps et tokens sont comparés en ratios : un gros scénario ne pèse pas plus qu’un petit. Une métrique est signalée si l’écart typique est aussi assez grand : +15 %, +5 points sur un taux, −0,05 sur un score. Il faut au moins 8 scénarios.</li>
            <li><strong>Scénario par scénario</strong> : pas de statistiques avec trois runs, des seuils simples à la place — un scénario qui se met à échouer (par ex. 0/3 → 2/3), un score en baisse de 0,25 ou plus, +50 % de durée, de coût, de steps ou de tokens, un appel d’outil répété qui ne l’était pas, un chemin d’outils jamais vu dans la référence.</li>
            <li><strong>Résultat</strong> : <C>fail</C> si une métrique régresse sur la suite, si un scénario se met à échouer, ou si le score d’un scénario baisse de 0,5 ou plus. Un nouveau chemin d’outils est affiché mais ne fait jamais échouer la suite.</li>
          </ul>
          <p>
            Chaque scénario renvoie vers un diff étape par étape des deux versions. Comparez sur n’importe quelle dimension : version d’agent, de prompt, d’app ou modèle.
          </p>

          <H3 id="eval-ci">En CI</H3>
          <p>
            <strong>GitHub Actions.</strong> Enregistrez la suite sur <C>main</C> sous le SHA du commit, rejouez-la à chaque pull request, et laissez l’action comparer les deux. Elle écrit le résultat dans le résumé du job, poste un commentaire sur la pull request (mis à jour à chaque push) avec les scénarios dégradés et un lien vers leur diff, et fait échouer le job en cas de régression.
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
      # Votre suite : outils mockés, quelques runs par scénario, chacun tracé avec
      # trajekt.scenario et trajekt.agent.version=$AGENT_SHA.
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
            Entrées : <C>dimension</C> (<C>agent</C> par défaut ; <C>prompt</C>, <C>app</C> ou <C>model</C> pour comparer sur une autre étiquette), <C>fail-on-regression</C> et <C>comment</C> (tous deux à <C>true</C>). Sorties : <C>result</C> et <C>report-url</C>. Le commit de référence doit avoir été évalué — c’est le rôle du déclencheur <C>push</C> sur <C>main</C>. Toutes les options sont dans le <a href="https://github.com/LeoLR/Trajekt/tree/main/actions/eval-suite">README de l’action</a>.
          </p>
          <p><strong>Toute autre CI</strong> appelle le même point d’accès :</p>
          <Code label="sur une instance Trajekt (clé de lecture)">{`
curl -s -H "Authorization: Bearer $TRAJEKT_READ_KEY" \\
  "$TRAJEKT_URL/api/agents/sentry-triage/evals?dimension=agent&a=$BASE_SHA&b=$GIT_SHA" \\
  | jq -e '.comparison.result == "pass"' || { echo "la suite d'évaluation a régressé"; exit 1; }
`}</Code>
          <p><strong>Sans serveur</strong>, comparez deux exécutions enregistrées de la suite dans le code :</p>
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
            Une version exécutable de tout cela — un agent jouet, des scénarios mockés, des tests de comportement et la comparaison — se trouve dans <a href="https://github.com/LeoLR/Trajekt/tree/main/examples/eval-suite"><C>examples/eval-suite</C></a>. Un agent peut poser la même question par MCP avec <C>compare_eval_suite</C> : « ma branche a-t-elle dégradé sentry-triage ? ».
          </p>

          <H3 id="test-trajekt">Tester Trajekt</H3>
          <Code label="tests de la librairie">{`
pnpm --filter @trajekt/core test
`}</Code>
          <p>
            Les tests du dashboard exécutent le vrai SQL sur une base jetable, créée et supprimée par chaque fichier de test. Il faut un Postgres qui accepte l’utilisateur <C>postgres</C> sans mot de passe :
          </p>
          <Code>{`
docker run -d --name trajekt-test -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
pnpm --filter dashboard test
`}</Code>
          <p>
            <C>TEST_PG_HOST</C>, <C>TEST_PG_PORT</C> et <C>TEST_PG_USER</C> changent la cible (par défaut : <C>127.0.0.1</C>, <C>54329</C>, <C>postgres</C>). <C>pnpm --filter dashboard preview</C> rend chaque page du dashboard avec des données simulées en fichiers HTML statiques, sans Next.js.
          </p>
          <p>
            Les tests de bout en bout lancent l’app compilée (<C>next start</C>) dans un vrai navigateur avec Playwright : connexion, chaque page, création de projet, ingestion en JSON et en protobuf, scores, masquage et MCP. Ils sont dans <C>e2e/</C> ; le workflow de CI montre comment démarrer l’app avant d’y lancer <C>npm test</C>.
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="api">Référence de l’API</H2>
          <p>Les routes de lecture acceptent la session du dashboard ou une clé de lecture : <C>Authorization: Bearer tk_read_…</C>.</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead><tr><th>Point d’accès</th><th>Auth</th><th>Rôle</th></tr></thead>
              <tbody>
                <tr><td><C>POST /v1/traces</C></td><td>clé d’API</td><td>Ingérer de l’OTLP (JSON ou protobuf), une trace Langfuse, un résultat AI SDK ou une trajectoire. Renvoie les runs créés ou complétés.</td></tr>
                <tr><td><C>POST /v1/scores</C></td><td>clé d’API</td><td>Attacher des scores de qualité à des runs, par <C>traceId</C> ou <C>runId</C>.</td></tr>
                <tr><td><C>GET /api/agents</C></td><td>lecture</td><td>Un résumé par agent.</td></tr>
                <tr><td><C>GET /api/agents/:name/timeseries</C></td><td>lecture</td><td><C>from</C>, <C>to</C>, <C>bucket=hour|day</C>, <C>version</C>.</td></tr>
                <tr><td><C>GET /api/agents/:name/versions</C></td><td>lecture</td><td>Métriques par valeur de <C>dimension=app|agent|prompt|model</C> (<C>agent</C> par défaut).</td></tr>
                <tr><td><C>GET /api/agents/:name/compare</C></td><td>lecture</td><td><C>mode=window</C>, <C>mode=version&amp;dimension=…</C>, ou <C>mode=ab&amp;dimension=…&amp;a=…&amp;b=…</C>, avec <C>from</C> et <C>to</C> en option.</td></tr>
                <tr><td><C>GET /api/agents/:name/evals</C></td><td>lecture</td><td>Comparaison de suite d’évaluation : <C>dimension</C>, <C>a</C>, <C>b</C>. <C>comparison.result</C> vaut <C>pass</C> ou <C>fail</C>.</td></tr>
                <tr><td><C>GET /api/runs</C></td><td>lecture</td><td><C>agent</C>, <C>appVersion</C>, <C>version</C>, <C>promptVersion</C>, <C>model</C>, <C>scenario</C>, <C>kind=live|eval</C>, <C>status</C>, <C>loops=1</C>, <C>from</C>, <C>to</C>, <C>limit</C>, <C>cursor</C>.</td></tr>
                <tr><td><C>GET /api/runs/:id</C></td><td>lecture</td><td>Métriques du run et trajectoire complète.</td></tr>
                <tr><td><C>GET /api/alerts</C></td><td>lecture</td><td>Alertes envoyées, les plus récentes d’abord.</td></tr>
                <tr><td><C>POST /api/mcp</C></td><td>clé de lecture</td><td>Serveur MCP (Streamable HTTP, réponses JSON).</td></tr>
                <tr><td><C>POST /api/alerts/check</C></td><td><C>CRON_SECRET</C></td><td>Lancer la détection de régressions sur tous les projets et purger les anciens runs (aussi en <C>GET</C>, pour Vercel Cron).</td></tr>
                <tr><td><C>GET</C> / <C>POST /api/projects</C></td><td>session</td><td>Lister les projets, ou en créer un (renvoie ses clés d’ingestion et de lecture, une seule fois).</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Les erreurs ont toujours la forme <C>{'{ "error": { "code", "message" } }'}</C>. Le contrat complet est dans <a href={`${REPO_URL}/blob/main/docs/api-contract.md`}>docs/api-contract.md</a> (en anglais).
          </p>

          {/* ------------------------------------------------------------ */}
          <H2 id="troubleshooting">Dépannage</H2>
          <dl className="doc-faq">
            <dt>L’exporteur n’arrive pas à se connecter, ou utilise le port 4317</dt>
            <dd>C’est du gRPC, que Trajekt n’accepte pas. Utilisez OTLP sur HTTP : <C>OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf</C> (ou <C>http/json</C>) et l’URL du dashboard.</dd>
            <dt><C>429 RATE_LIMITED</C> ou <C>413 PAYLOAD_TOO_LARGE</C></dt>
            <dd>Trop de requêtes par minute pour ce projet, ou un lot trop gros. Les exporteurs réessaient sur 429 ; pour 413, réduisez la taille des lots (<C>OTEL_BSP_MAX_EXPORT_BATCH_SIZE</C>) ou augmentez <C>TRAJEKT_MAX_BODY_MB</C>.</dd>
            <dt><C>422 UNKNOWN_FORMAT</C></dt>
            <dd>Le JSON est valide mais ne correspond à aucune des formes supportées. Le message liste les clés de premier niveau trouvées.</dd>
            <dt><C>401 UNAUTHORIZED</C></dt>
            <dd>L’en-tête <C>Authorization</C> manque, ou la clé n’appartient à aucun projet. Les clés commencent par <C>tk_live_</C>.</dd>
            <dt>Les runs apparaissent sous <C>unknown</C></dt>
            <dd>Aucun nom d’agent n’a été trouvé. Définissez <C>OTEL_SERVICE_NAME</C> (la valeur par défaut du SDK, <C>unknown_service</C>, est ignorée) ou envoyez <C>X-Trajekt-Agent</C>.</dd>
            <dt>Le coût affiche <C>—</C></dt>
            <dd>Le modèle n’est pas dans la table de prix, ou les spans ne portent pas de nombre de tokens. Ajoutez le modèle avec <C>TRAJEKT_PRICING</C>.</dd>
            <dt>Chaque métrique indique « not enough data »</dt>
            <dd>Une comparaison en production demande au moins 20 runs de chaque côté, une suite d’évaluation au moins 8 scénarios.</dd>
            <dt>Une métrique a beaucoup bougé mais reste « stable »</dt>
            <dd>L’écart n’est pas significatif une fois corrigé pour le nombre de métriques testées, ou il est sous l’effet minimal. Survolez le verdict pour voir pourquoi.</dd>
            <dt>La page de connexion indique que la connexion est désactivée</dt>
            <dd>Définissez <C>DASHBOARD_PASSWORD</C> et <C>DASHBOARD_SESSION_SECRET</C> (16 caractères ou plus) et redémarrez.</dd>
          </dl>

          <p className="doc-end muted">Il manque quelque chose ? <a href={`${REPO_URL}/issues`}>Ouvrez une issue</a>.</p>
        </article>
      </div>
    </Page>
  );
}
