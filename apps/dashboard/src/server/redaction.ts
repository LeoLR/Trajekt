/**
 * Masquage à l'ingestion, configuré par l'environnement :
 *   TRAJEKT_REDACT=secrets,email,iban,card,phone,ip   (défaut : secrets ; none pour désactiver)
 *   TRAJEKT_REDACT_PATTERNS=[{"name":"customer","pattern":"CUST-\\d{6}"}]
 * Une configuration invalide bloque l'ingestion plutôt que de laisser passer
 * des données qu'on croyait masquées.
 */

import { createRedactor, type BuiltInRedaction, type RedactionPattern } from '@trajekt/core';

const KNOWN: BuiltInRedaction[] = ['secrets', 'email', 'iban', 'card', 'phone', 'ip'];

export class RedactionConfigError extends Error {}

let cached: { key: string; redact: ((v: unknown) => unknown) | null } | null = null;

export function redactorFromEnv(env = process.env): ((v: unknown) => unknown) | null {
  const key = `${env.TRAJEKT_REDACT ?? ''}|${env.TRAJEKT_REDACT_PATTERNS ?? ''}`;
  if (cached?.key === key) return cached.redact;
  const list = (env.TRAJEKT_REDACT ?? 'secrets').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let patterns: RedactionPattern[] = [];
  if (env.TRAJEKT_REDACT_PATTERNS) {
    try {
      patterns = JSON.parse(env.TRAJEKT_REDACT_PATTERNS);
      if (!Array.isArray(patterns)) throw new Error('not an array');
      for (const p of patterns) {
        if (typeof p?.name !== 'string' || typeof p?.pattern !== 'string') throw new Error('each entry needs "name" and "pattern"');
        new RegExp(p.pattern, 'g');
      }
    } catch (e) {
      throw new RedactionConfigError(`Invalid TRAJEKT_REDACT_PATTERNS: ${(e as Error).message}`);
    }
  }
  const unknown = list.filter((x) => x !== 'none' && !KNOWN.includes(x as BuiltInRedaction));
  if (unknown.length) throw new RedactionConfigError(`Unknown TRAJEKT_REDACT value(s): ${unknown.join(', ')} (use ${KNOWN.join(', ')} or none)`);
  const builtIn = list.includes('none') ? [] : (list as BuiltInRedaction[]);
  const redact = builtIn.length || patterns.length ? createRedactor({ builtIn, patterns }) : null;
  cached = { key, redact };
  return redact;
}
