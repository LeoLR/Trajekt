/**
 * Langue de l'interface : anglais ou français.
 *
 * Choisie par le cookie trajekt_lang (sélecteur EN/FR de l'en-tête), sinon
 * par Accept-Language. Les pages serveur la fixent une fois par requête
 * (requestLang, dans app/context.ts) ; les vues la lisent avec getLang() / tr(). Hors d'une
 * requête Next (tests, preview, alertes Slack, MCP), c'est l'anglais.
 *
 * Les libellés produits par @trajekt-ai/core (métriques, raisons d'un verdict)
 * sont traduits ici, à partir de leurs modèles anglais.
 */

import { cache } from 'react';
import type { AnyMetricKey, MetricKey } from '@trajekt-ai/core';

export type Lang = 'en' | 'fr';
export const LANG_COOKIE = 'trajekt_lang';

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'fr';
}

/** Cookie d'abord, puis la première langue reconnue de Accept-Language. */
export function pickLang(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.trim().split(';')[0].toLowerCase();
    if (tag.startsWith('fr')) return 'fr';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

// Une valeur par requête (cache de React côté serveur) ; ailleurs (scripts,
// tests), un objet neuf à chaque appel, initialisé avec la langue par défaut.
let defaultLang: Lang = 'en';
const store = cache((): { lang: Lang } => ({ lang: defaultLang }));

/** Langue hors requête (scripts : preview, tests). Jamais dans le serveur. */
export function setDefaultLang(lang: Lang): void {
  defaultLang = lang;
}

/** Fixe la langue des vues pour la requête en cours (voir app/context.ts). */
export function setLang(lang: Lang): void {
  store().lang = lang;
}

export function getLang(): Lang {
  return store().lang;
}

/** Le texte dans la langue de la requête. */
export function tr(en: string, fr: string): string {
  return getLang() === 'fr' ? fr : en;
}

/* ------------------------------------------------------------------ */
/* Libellés de @trajekt-ai/core                                            */
/* ------------------------------------------------------------------ */

const METRIC_FR: Record<MetricKey, string> = {
  errorRate: 'Runs en échec',
  toolErrorRate: 'Appels d’outils en échec',
  durationMs: 'Durée moyenne',
  costUsd: 'Coût moyen',
  stepCount: 'Steps par run',
  totalTokens: 'Tokens par run',
  redundantToolCalls: 'Appels d’outils répétés',
  newPathShare: 'Runs sur un nouveau chemin d’outils',
};

const METRIC_EN: Record<MetricKey, string> = {
  errorRate: 'Failed runs',
  toolErrorRate: 'Failed tool calls',
  durationMs: 'Mean duration',
  costUsd: 'Mean cost',
  stepCount: 'Steps per run',
  totalTokens: 'Tokens per run',
  redundantToolCalls: 'Repeated tool calls',
  newPathShare: 'Runs on a new tool path',
};

/** metricLabel de @trajekt-ai/core, dans la langue demandée. */
export function metricName(k: AnyMetricKey, lang: Lang = getLang()): string {
  if (k.startsWith('score:')) return `Score · ${k.slice(6)}`;
  return (lang === 'fr' ? METRIC_FR : METRIC_EN)[k as MetricKey];
}

/** Libellés anglais de core → français (métriques et libellés de changement par scénario). */
function labelFr(label: string): string {
  const key = (Object.keys(METRIC_EN) as MetricKey[]).find((k) => METRIC_EN[k] === label);
  if (key) return METRIC_FR[key];
  switch (label) {
    case 'Fails more often': return 'Échoue plus souvent';
    case 'Fails less often': return 'Échoue moins souvent';
    case 'Tool path changed': return 'Chemin d’outils modifié';
    default: return label;
  }
}

export function coreLabel(label: string, lang: Lang = getLang()): string {
  return lang === 'fr' ? labelFr(label) : label;
}

const PATTERNS: Array<[RegExp, (...m: string[]) => string]> = [
  [/^(\d+) vs (\d+) — need at least (\d+) on each side$/, (a, b, n) => `${a} contre ${b} — il en faut au moins ${n} de chaque côté`],
  [/^(\d+) vs (\d+) runs — need at least (\d+) on each side$/, (a, b, n) => `${a} contre ${b} runs — il en faut au moins ${n} de chaque côté`],
  [/^(\d+) vs (\d+) scored runs — need at least (\d+) on each side$/, (a, b, n) => `${a} contre ${b} runs notés — il en faut au moins ${n} de chaque côté`],
  [/^Most common new path: (.+) \((\d+) runs\)$/, (p, n) => `Nouveau chemin le plus fréquent : ${p} (${n} runs)`],
  [/^Not significant once corrected for the (\d+) metrics tested at once \(p = (.+)\)$/, (m, p) => `Non significatif une fois corrigé pour les ${m} métriques testées en même temps (p = ${p})`],
  [/^(\d+) paired scenarios? — need at least (\d+)$/, (n, min) => `${n} scénario${Number(n) > 1 ? 's' : ''} apparié${Number(n) > 1 ? 's' : ''} — il en faut au moins ${min}`],
  [/^Typical change per scenario \(geometric mean of the ratios\)$/, () => 'Écart typique par scénario (moyenne géométrique des ratios)'],
  [/^(\d+) of (\d+) scenarios now take a tool path never seen in the baseline$/, (a, b) => `${a} scénario${Number(a) > 1 ? 's' : ''} sur ${b} prennent désormais un chemin d’outils jamais vu dans la référence`],
  [/^(\d+\/\d+) → (\d+\/\d+) failed$/, (a, b) => `${a} → ${b} en échec`],
  [/^was (.+) · now (.+)$/, (a, b) => `avant ${a} · maintenant ${b}`],
  [/^previous (\d+) days$/, (n) => `${n} jours précédents`],
  [/^last (\d+) h$/, (n) => `dernières ${n} h`],
  [/^(.+) regressed across the suite$/, (l) => `${labelFr(l)} : régression sur l’ensemble de la suite`],
];

/** Un détail ou une raison produits par @trajekt-ai/core, dans la langue demandée. */
export function coreText(text: string | undefined, lang: Lang = getLang()): string | undefined {
  if (text === undefined || lang === 'en') return text;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(text);
    if (m) return fn(...m.slice(1));
  }
  // « scénario: détail » (raisons d'échec d'une suite).
  const colon = /^([^:]+): (.+)$/.exec(text);
  if (colon) {
    const inner = coreText(colon[2], lang)!;
    if (inner !== colon[2]) return `${colon[1]} : ${inner}`;
    const score = /^(Score · .+) (-?\d+\.\d+) → (-?\d+\.\d+)$/.exec(colon[2]);
    if (score) return `${colon[1]} : ${score[1]} ${score[2]} → ${score[3]}`;
  }
  return text;
}

/** « il y a 5 min » / « 5 min ago ». */
export function relativeTime(isoDate: string, now = new Date(), lang: Lang = getLang()): string {
  const diff = now.getTime() - new Date(isoDate).getTime();
  const min = Math.round(diff / 60_000);
  const fr = lang === 'fr';
  if (min < 1) return fr ? 'à l’instant' : 'just now';
  if (min < 60) return fr ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return fr ? `il y a ${h} h` : `${h} h ago`;
  return fr ? `il y a ${Math.round(h / 24)} j` : `${Math.round(h / 24)} d ago`;
}

/** « last 24 h vs previous 7 days » → « dernières 24 h vs 7 jours précédents ». */
export function scopeText(scope: string, lang: Lang = getLang()): string {
  return lang === 'en' ? scope : scope.split(' vs ').map((x) => coreText(x, lang)).join(' vs ');
}

export type DimensionKey = 'app' | 'agent' | 'prompt' | 'model';

export function dimShort(d: DimensionKey): string {
  return {
    app: tr('App version', 'Version d’app'),
    agent: tr('Agent version', 'Version d’agent'),
    prompt: tr('Prompt version', 'Version de prompt'),
    model: tr('Model', 'Modèle'),
  }[d];
}

export function dimPlural(d: DimensionKey): string {
  return {
    app: tr('App versions', 'Versions d’app'),
    agent: tr('Agent versions', 'Versions d’agent'),
    prompt: tr('Prompt versions', 'Versions de prompt'),
    model: tr('Models', 'Modèles'),
  }[d];
}
