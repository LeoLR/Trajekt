/**
 * trajekt/core — Les deux points de branchement.
 *
 * 1. TraceProvider : d'où viennent les traces (Langfuse, OTel, fichiers).
 *    Les providers retournent du BRUT ; la normalisation est centralisée
 *    dans core. Écrire un provider = écrire fetch(), rien d'autre.
 *
 * 2. AgentAdapter : comment invoquer l'agent de l'utilisateur.
 *    Réduit à UNE fonction. C'est le minimum incompressible du
 *    "zéro bidouille" : on ne peut pas deviner comment appeler un agent,
 *    mais on peut faire en sorte qu'une seule ligne suffise.
 */

import { Trajectory } from './trajectory.js';
import { normalize } from './normalize.js';

/* ------------------------------------------------------------------ */
/* TraceProvider                                                       */
/* ------------------------------------------------------------------ */

export interface TraceFilter {
  /** Traces créées après cette date (ISO 8601). */
  from?: string;
  /** Traces créées avant cette date (ISO 8601). */
  to?: string;
  /** Filtre par nom/tag selon les capacités du backend. */
  name?: string;
  limit?: number;
}

export interface TraceProvider {
  readonly name: string;
  /** Récupère une trace par id, au format BRUT du backend. */
  fetchRaw(traceId: string): Promise<unknown>;
  /** Liste des ids de traces correspondant au filtre. */
  listTraceIds(filter?: TraceFilter): Promise<string[]>;
}

/** Récupère et normalise en un geste — l'API que les gens utilisent. */
export async function fetchTrajectory(
  provider: TraceProvider,
  traceId: string,
): Promise<Trajectory> {
  return normalize(await provider.fetchRaw(traceId));
}

/* ------------------------------------------------------------------ */
/* AgentAdapter                                                        */
/* ------------------------------------------------------------------ */

export interface AgentTurnResult {
  /** Réponse textuelle de l'agent pour ce tour. */
  content: string;
  /**
   * Trace du tour si l'agent peut la fournir (résultat AI SDK, spans...).
   * Passée telle quelle à normalize() — n'importe quel format connu marche.
   */
  trace?: unknown;
}

export interface ConversationContext {
  /** Historique des tours précédents (rôle + contenu). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** État libre persistant entre les tours d'un même run. */
  state: Record<string, unknown>;
}

/**
 * LE point d'intégration. Une fonction.
 *
 *   const adapter: AgentAdapter = (input, ctx) => myAgent.run(input);
 *
 * Les packages runner/simulate consomment ça ; les adaptateurs prêts
 * (`trajekt/adapters/ai-sdk`, `trajekt/adapters/mastra`) ne sont que
 * des implémentations pré-écrites de cette signature.
 */
export type AgentAdapter = (
  input: string,
  context: ConversationContext,
) => Promise<AgentTurnResult | string>;
