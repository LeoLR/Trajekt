/**
 * trajekt/core — Fusion de trajectoires partielles.
 *
 * Un exporter OTel (BatchSpanProcessor) envoie les spans au fil de leur
 * fin : une même trace arrive couramment en 2, 3 ou 10 envois, les
 * enfants avant la racine. Sans fusion, chaque envoi devient un "run"
 * et toutes les métriques (durée, nombre de steps, statut) sont fausses.
 *
 * La fusion est idempotente : renvoyer deux fois le même lot ne crée
 * pas de doublon (clé = id du step quand la source en fournit un).
 */

import { Trajectory, TrajectoryStep } from './trajectory.js';

function stepKey(s: TrajectoryStep, fallbackIndex: number): string {
  if (s.id) return `id:${s.id}`;
  return `anon:${s.type}:${s.timestamp ?? ''}:${fallbackIndex}`;
}

/** Trie par horodatage (les steps sans horodatage gardent leur ordre relatif) et réindexe. */
export function sortAndReindex(steps: TrajectoryStep[]): TrajectoryStep[] {
  const decorated = steps.map((s, i) => ({ s, i, t: s.timestamp ? Date.parse(s.timestamp) : NaN }));
  decorated.sort((a, b) => {
    const ta = a.t, tb = b.t;
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
    return a.i - b.i;
  });
  return decorated.map(({ s }, index) => ({ ...s, index }));
}

/**
 * Fusionne `incoming` dans `existing`. Un step déjà connu (même id) est
 * remplacé par sa nouvelle version ; les métadonnées définies dans
 * `incoming` priment, les autres sont conservées.
 */
export function mergeTrajectories(existing: Trajectory, incoming: Trajectory): Trajectory {
  const byKey = new Map<string, TrajectoryStep>();
  existing.steps.forEach((s, i) => byKey.set(stepKey(s, i), s));
  const offset = existing.steps.length;
  incoming.steps.forEach((s, i) => byKey.set(stepKey(s, offset + i), s));

  const metadata = { ...existing.metadata };
  for (const [k, v] of Object.entries(incoming.metadata)) {
    if (v !== undefined && v !== null && v !== '') metadata[k] = v;
  }
  // Les scores arrivent parfois par lots différents : on les cumule par nom.
  if (existing.metadata.scores || incoming.metadata.scores) {
    metadata.scores = { ...existing.metadata.scores, ...incoming.metadata.scores };
  }

  const createdAt = [existing.createdAt, incoming.createdAt]
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return {
    ...existing,
    steps: sortAndReindex(Array.from(byKey.values())),
    metadata,
    createdAt,
  };
}
