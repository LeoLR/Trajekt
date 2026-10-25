/**
 * Limite de débit de l'ingestion, par projet, en mémoire : une fenêtre
 * d'une minute. Protège la base d'un exporter qui s'emballe. Par instance
 * du serveur : derrière plusieurs instances (serverless), la limite réelle
 * est multipliée d'autant — c'est un garde-fou, pas un quota.
 */

const windows = new Map<string, { start: number; count: number }>();

export function ingestRatePerMinute(env = process.env): number {
  const v = Number(env.TRAJEKT_INGEST_RATE_PER_MIN);
  return Number.isFinite(v) && v > 0 ? v : 600;
}

export function takeToken(key: string, limit = ingestRatePerMinute(), now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start >= 60_000) windows.delete(k);
    }
    return { ok: true };
  }
  if (w.count >= limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + 60_000 - now) / 1000)) };
  w.count++;
  return { ok: true };
}

/** Taille maximale d'un corps de requête d'ingestion, décompressé (TRAJEKT_MAX_BODY_MB, 20 par défaut). */
export function maxBodyBytes(env = process.env): number {
  const v = Number(env.TRAJEKT_MAX_BODY_MB);
  return (Number.isFinite(v) && v > 0 ? v : 20) * 1024 * 1024;
}
