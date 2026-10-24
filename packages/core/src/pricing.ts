/**
 * trajekt/core — Estimation du coût des appels LLM.
 *
 * Les spans OTel ne portent presque jamais de coût : sans estimation,
 * la courbe de coût d'un agent instrumenté en OTel serait vide. On
 * estime donc à partir des tokens et d'une table de prix.
 *
 * Les prix ci-dessous sont des PRIX PUBLICS INDICATIFS (USD par million
 * de tokens) relevés à la main : ils vieillissent. Ils sont faits pour
 * être surchargés (setPricing, ou la variable TRAJEKT_PRICING côté
 * dashboard). Un coût fourni par la source (Langfuse) prime toujours
 * sur l'estimation, et une estimation est toujours signalée comme telle.
 */

export interface ModelPrice {
  /** USD par million de tokens en entrée. */
  input: number;
  /** USD par million de tokens en sortie. */
  output: number;
}

/** Clé = préfixe d'identifiant de modèle ; le préfixe le plus long l'emporte. */
export const DEFAULT_PRICING: Record<string, ModelPrice> = {
  // Anthropic
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-opus-4': { input: 5, output: 25 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-haiku-4': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  // OpenAI
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'o4-mini': { input: 1.1, output: 4.4 },
  o3: { input: 2, output: 8 },
  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  // Mistral
  'mistral-large': { input: 2, output: 6 },
  'mistral-small': { input: 0.1, output: 0.3 },
};

let pricing: Record<string, ModelPrice> = { ...DEFAULT_PRICING };

/** Remplace ou complète la table de prix (fusion par clé). */
export function setPricing(overrides: Record<string, ModelPrice>, replace = false): void {
  pricing = replace ? { ...overrides } : { ...pricing, ...overrides };
}

export function getPricing(): Record<string, ModelPrice> {
  return pricing;
}

/** "anthropic/claude-sonnet-4-5" ou "openai:gpt-4o" → "claude-sonnet-4-5", "gpt-4o". */
function canonicalModel(model: string): string {
  const lower = model.trim().toLowerCase();
  const parts = lower.split(/[/:]/);
  return parts[parts.length - 1] ?? lower;
}

export function priceFor(model: string | undefined): ModelPrice | undefined {
  if (!model) return undefined;
  const m = canonicalModel(model);
  let best: string | undefined;
  for (const prefix of Object.keys(pricing)) {
    if (m.startsWith(prefix) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best ? pricing[best] : undefined;
}

/** Coût estimé d'un appel, ou undefined si modèle inconnu / tokens absents. */
export function estimateCostUsd(
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | undefined {
  const price = priceFor(model);
  if (!price || (inputTokens == null && outputTokens == null)) return undefined;
  return ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) / 1e6;
}
