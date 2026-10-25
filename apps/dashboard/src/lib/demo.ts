/**
 * Mode démo (TRAJEKT_DEMO=1) : instance publique en lecture seule, avec
 * des données simulées.
 *   - pas de connexion, pas d'ingestion ;
 *   - « maintenant » = juste après le dernier run : les données semblent
 *     toujours fraîches, quel que soit le temps écoulé depuis le seed.
 * Ce fichier ne dépend que de process.env : utilisable partout (Edge,
 * composants client via NEXT_PUBLIC_TRAJEKT_DEMO inliné au build).
 */

export function isDemo(): boolean {
  return process.env.TRAJEKT_DEMO === '1' || process.env.NEXT_PUBLIC_TRAJEKT_DEMO === '1';
}
