/**
 * trajekt/core — Masquage des données sensibles.
 *
 * Les prompts, les arguments et les résultats d'outils contiennent souvent
 * des données clients. On les masque AVANT stockage : emails, IBAN, numéros
 * de carte, téléphones, secrets (clés d'API, jetons, JWT, mots de passe).
 * Le remplacement est déterministe (même valeur → même marque), donc la
 * détection des appels répétés fonctionne toujours.
 */

import type { Trajectory, TrajectoryStep } from './trajectory.js';

export type BuiltInRedaction = 'email' | 'iban' | 'card' | 'phone' | 'secrets' | 'ip';

export interface RedactionPattern {
  name: string;
  /** Expression régulière (chaîne ou RegExp) ; le drapeau g est ajouté. */
  pattern: string | RegExp;
  /** Texte de remplacement (défaut : [name]). */
  replacement?: string;
}

export interface RedactionOptions {
  /** Masquages fournis (défaut : ['secrets']). */
  builtIn?: BuiltInRedaction[];
  /** Masquages propres à votre domaine (identifiants clients, numéros de contrat…). */
  patterns?: RedactionPattern[];
  /**
   * Clés d'objet dont la valeur est toujours masquée, en entier (insensible
   * à la casse). Défaut avec 'secrets' : password, token, secret, api_key,
   * authorization, cookie…
   */
  sensitiveKeys?: string[];
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

type Rule = { re: RegExp; replace: (match: string) => string };

const BUILT_IN: Record<BuiltInRedaction, Rule[]> = {
  email: [{ re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replace: () => '[email]' }],
  // IBAN : 2 lettres, 2 chiffres, 11 à 30 alphanumériques, espaces par groupes de 4 tolérés.
  iban: [{ re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g, replace: () => '[iban]' }],
  card: [{
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[card]' : m;
    },
  }],
  // Téléphones au format international ou français (06 12 34 56 78, +33 6…).
  phone: [{ re: /(?:\+\d{1,3}[ .-]?\(?\d{1,4}\)?(?:[ .-]?\d{2,4}){2,4}|\b0[1-9](?:[ .-]?\d{2}){4}\b)/g, replace: () => '[phone]' }],
  secrets: [
    { re: /\bBearer\s+[A-Za-z0-9._~+\/=-]{12,}/g, replace: () => 'Bearer [secret]' },
    { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replace: () => '[jwt]' },
    {
      // Préfixes de clés connus : Anthropic, OpenAI, Trajekt, GitHub, GitLab, Slack, AWS, Stripe, Google.
      re: /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|tk_(?:live|read)_[a-f0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,})\b/g,
      replace: () => '[secret]',
    },
  ],
  ip: [{ re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, replace: () => '[ip]' }],
};

/** Champs techniques laissés tels quels (un horodatage en nanosecondes ressemble à un numéro de carte). */
const STRUCTURAL = /(UnixNano|^timestamp|^startTime|^endTime|^createdAt|^index|^durationMs|^spanId|^traceId|^parentSpanId|^parentId|^id)$/i;

const DEFAULT_SENSITIVE_KEYS = [
  'password', 'passwd', 'pwd', 'secret', 'client_secret', 'token', 'access_token', 'refresh_token',
  'id_token', 'api_key', 'apikey', 'x-api-key', 'authorization', 'cookie', 'set-cookie', 'private_key',
];

/** Un masqueur prêt à l'emploi : redact(valeur) renvoie une copie masquée. */
export function createRedactor(o: RedactionOptions = {}): (value: unknown) => unknown {
  const builtIn = o.builtIn ?? ['secrets'];
  // Ordre : secrets d'abord (un JWT contient des chiffres), puis le reste.
  const order: BuiltInRedaction[] = ['secrets', 'email', 'iban', 'card', 'phone', 'ip'];
  const rules: Rule[] = [
    ...order.filter((k) => builtIn.includes(k)).flatMap((k) => BUILT_IN[k]),
    ...(o.patterns ?? []).map((p) => {
      const re = p.pattern instanceof RegExp
        ? new RegExp(p.pattern.source, p.pattern.flags.includes('g') ? p.pattern.flags : p.pattern.flags + 'g')
        : new RegExp(p.pattern, 'g');
      const replacement = p.replacement ?? `[${p.name}]`;
      return { re, replace: () => replacement };
    }),
  ];
  const keys = new Set((o.sensitiveKeys ?? (builtIn.includes('secrets') ? DEFAULT_SENSITIVE_KEYS : [])).map((k) => k.toLowerCase()));

  const str = (s: string): string => {
    let out = s;
    for (const r of rules) {
      r.re.lastIndex = 0;
      out = out.replace(r.re, r.replace);
    }
    return out;
  };
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') {
      // Une chaîne JSON (arguments d'outil sérialisés) : masquer aussi par clé.
      if (keys.size && v.length > 1 && (v[0] === '{' || v[0] === '[')) {
        try {
          return JSON.stringify(walk(JSON.parse(v), depth + 1));
        } catch {
          /* pas du JSON */
        }
      }
      return str(v);
    }
    if (depth > 40 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (STRUCTURAL.test(k)) out[k] = x; // horodatages et identifiants : jamais des données clients
      else out[k] = keys.has(k.toLowerCase()) && x !== null && x !== undefined && x !== '' ? '[redacted]' : walk(x, depth + 1);
    }
    // Attributs OTLP : { key: 'authorization', value: { stringValue } }.
    if (typeof out.key === 'string' && keys.has(out.key.toLowerCase()) && out.value && typeof out.value === 'object') {
      out.value = { stringValue: '[redacted]' };
    }
    return out;
  };
  return (value) => walk(value, 0);
}

/**
 * Copie de la trajectoire avec les données sensibles masquées partout où
 * elles peuvent apparaître : messages, arguments et résultats d'outils,
 * erreurs, données des steps et payloads d'origine.
 */
export function redactTrajectory(t: Trajectory, options: RedactionOptions | ((v: unknown) => unknown) = {}): Trajectory {
  const redact = typeof options === 'function' ? options : createRedactor(options);
  return { ...t, steps: t.steps.map((s) => redact(s) as TrajectoryStep) };
}
