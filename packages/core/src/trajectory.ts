/**
 * trajekt/core — Le modèle central.
 *
 * Tout converge vers `Trajectory` : traces Langfuse, spans OTel,
 * steps du Vercel AI SDK, replays, simulations. Une seule structure,
 * une seule API d'assertion.
 *
 * Le schéma est VERSIONNÉ dès le jour 1 : les rapports HTML, le cache
 * de replay et le futur dashboard sérialisent des trajectoires sur disque.
 * Sans version, toute évolution du modèle casse silencieusement
 * les données existantes.
 */

export const SCHEMA_VERSION = 1 as const;

/** Source d'une trajectoire — d'où viennent les steps. */
export type TrajectorySource =
  | 'live'        // trace réelle importée (Langfuse, OTel...)
  | 'replay'      // trace rejouée contre une nouvelle version de l'agent
  | 'simulation'; // conversation générée par un Simulator

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Payload brut du framework d'origine, préservé sans interprétation. */
  raw?: unknown;
}

/**
 * Les steps sont une union discriminée : chaque événement observable
 * d'un run d'agent est un step. Les champs `raw` préservent toujours
 * le payload d'origine — la normalisation ne détruit jamais d'information.
 */
export type TrajectoryStep =
  | LlmCallStep
  | ToolCallStep
  | UserMessageStep
  | AgentMessageStep
  | DecisionStep
  | CustomStep;

export interface BaseStep {
  /** Position dans la trajectoire (0-indexé, ordre chronologique). */
  index: number;
  /**
   * Identifiant stable du step dans sa source (spanId OTel, id
   * d'observation Langfuse). Sert à fusionner sans doublon les lots
   * d'une même trace qui arrivent en plusieurs envois.
   */
  id?: string;
  /** Identifiant du step parent si la source fournit un arbre. */
  parentId?: string;
  /** Horodatage ISO 8601 si connu. */
  timestamp?: string;
  /** Durée du step en millisecondes si connue. */
  durationMs?: number;
  /** Payload d'origine, jamais transformé. */
  raw?: unknown;
}

export interface LlmCallStep extends BaseStep {
  type: 'llm_call';
  model?: string;
  input: Message[];
  output?: Message;
  usage?: TokenUsage;
  costUsd?: number;
  error?: string;
}

export interface ToolCallStep extends BaseStep {
  type: 'tool_call';
  name: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface UserMessageStep extends BaseStep {
  type: 'user_message';
  content: string;
  /** Nom de la persona si le message vient d'un Simulator. */
  persona?: string;
}

export interface AgentMessageStep extends BaseStep {
  type: 'agent_message';
  content: string;
}

export interface DecisionStep extends BaseStep {
  type: 'decision';
  branch: string;
  reason?: string;
}

/** Échappatoire typée : événements propres à un framework. */
export interface CustomStep extends BaseStep {
  type: 'custom';
  kind: string;
  data?: unknown;
  error?: string;
}

export type RunStatus = 'ok' | 'error';

export interface TrajectoryMetadata {
  /**
   * Identifiant de trace de la source (traceId OTel, id Langfuse).
   * Clé de fusion à l'ingestion : deux envois du même traceId = un run.
   */
  traceId?: string;
  /** Nom de l'agent — l'axe principal de suivi dans le temps. */
  agentName?: string;
  /**
   * Version de l'application qui embarque l'agent (le service déployé).
   * Distincte de agentVersion quand l'agent évolue à son propre rythme.
   */
  appVersion?: string;
  /** Version de l'agent lui-même (code, outils, orchestration). */
  agentVersion?: string;
  environment?: string;
  /**
   * Issue du run quand la source la donne explicitement (statut du span
   * racine OTel, niveau ERROR Langfuse). Sinon déduite par computeMetrics.
   */
  status?: RunStatus;
  promptVersion?: string;
  scenario?: { name: string; persona?: string };
  totalCostUsd?: number;
  totalDurationMs?: number;
  /** Format d'origine détecté par la normalisation. */
  sourceFormat?: string;
  /** Métadonnées libres du projet hôte. */
  [key: string]: unknown;
}

export interface Trajectory {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  source: TrajectorySource;
  steps: TrajectoryStep[];
  metadata: TrajectoryMetadata;
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/* Sérialisation versionnée                                            */
/* ------------------------------------------------------------------ */

export class SchemaVersionError extends Error {
  constructor(found: unknown) {
    super(
      `Trajectory uses schema v${String(found)}; this version of @trajekt/core ` +
        `reads schema v${SCHEMA_VERSION}. Upgrade @trajekt/core or ` +
        `normalize the original trace again.`,
    );
    this.name = 'SchemaVersionError';
  }
}

export function serializeTrajectory(t: Trajectory): string {
  return JSON.stringify(t);
}

export function deserializeTrajectory(json: string): Trajectory {
  const parsed = JSON.parse(json) as Partial<Trajectory>;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    // Point d'extension : quand SCHEMA_VERSION passera à 2, les
    // migrations v1 → v2 s'enregistreront ici au lieu de casser.
    throw new SchemaVersionError(parsed.schemaVersion);
  }
  return parsed as Trajectory;
}

/* ------------------------------------------------------------------ */
/* Helpers de lecture                                                  */
/* ------------------------------------------------------------------ */

export function toolCalls(t: Trajectory): ToolCallStep[] {
  return t.steps.filter((s): s is ToolCallStep => s.type === 'tool_call');
}

export function llmCalls(t: Trajectory): LlmCallStep[] {
  return t.steps.filter((s): s is LlmCallStep => s.type === 'llm_call');
}

export function turns(t: Trajectory): number {
  return t.steps.filter((s) => s.type === 'user_message').length;
}

export function totalCostUsd(t: Trajectory): number {
  return llmCalls(t).reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
}
