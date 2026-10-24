/**
 * trajekt/core — Normalisation universelle.
 *
 * C'est ici que se joue le "zéro bidouille" : l'utilisateur jette
 * n'importe quelle trace dans `normalize()` et reçoit une Trajectory.
 * La détection de format est automatique par inspection structurelle —
 * pas de config, pas de flag, pas de mapping à écrire.
 *
 * Formats détectés nativement :
 *   - trajekt   : déjà normalisé (round-trip gratuit)
 *   - langfuse  : trace avec observations[] (GENERATION / SPAN / EVENT)
 *   - otlp      : export OpenTelemetry JSON (resourceSpans) — couvre
 *                 Mastra, Vercel AI SDK via OTel, LangGraph, etc.
 *   - ai-sdk    : résultat generateText/streamText du Vercel AI SDK
 *                 (steps[] avec toolCalls/toolResults)
 *
 * Pour les cas exotiques, `registerNormalizer()` permet d'en brancher
 * un custom — mais c'est l'exception, pas le parcours normal.
 */

import {
  SCHEMA_VERSION,
  Trajectory,
  TrajectoryStep,
  Message,
} from './trajectory.js';

/* ------------------------------------------------------------------ */
/* API publique                                                        */
/* ------------------------------------------------------------------ */

export type KnownFormat = 'trajekt' | 'langfuse' | 'otlp' | 'ai-sdk';

export interface Normalizer {
  format: string;
  /** Inspection structurelle : ce payload est-il de ce format ? */
  detect(input: unknown): boolean;
  normalize(input: unknown): Trajectory;
}

const registry: Normalizer[] = [];

/** Brancher un format custom (prioritaire sur les formats natifs). */
export function registerNormalizer(n: Normalizer): void {
  registry.unshift(n);
}

export function detectFormat(input: unknown): string | undefined {
  return allNormalizers().find((n) => n.detect(input))?.format;
}

export class UnknownFormatError extends Error {
  constructor(hint: string) {
    super(
      `Format de trace non reconnu (${hint}). Formats natifs : trajekt, ` +
        `langfuse, otlp, ai-sdk. Pour un format custom : registerNormalizer().`,
    );
    this.name = 'UnknownFormatError';
  }
}

/**
 * Point d'entrée universel : n'importe quelle trace → Trajectory.
 * Accepte l'objet parsé ou la string JSON brute.
 *
 * ATTENTION : pour le format OTLP, ceci traite TOUT le payload comme
 * une seule trajectoire. C'est correct pour un payload déjà scindé par
 * trace (le cas de la démo/du drop de fichier), mais FAUX pour un
 * export brut d'un batch exporter OTel, qui multiplexe couramment
 * plusieurs traces dans un seul envoi. Pour l'ingestion en prod,
 * utiliser normalizeAll() ci-dessous.
 */
export function normalize(input: unknown): Trajectory {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  const normalizer = allNormalizers().find((n) => n.detect(value));
  if (!normalizer) throw new UnknownFormatError(describeShape(value));
  const trajectory = normalizer.normalize(value);
  trajectory.metadata.sourceFormat = normalizer.format;
  return trajectory;
}

/**
 * Point d'entrée sûr pour l'ingestion : gère le cas où un payload OTLP
 * contient les spans de plusieurs traces (le comportement par défaut
 * du batching des exporters OTel — pas un cas exotique). Renvoie
 * toujours un tableau, une Trajectory par traceId distinct. Pour les
 * autres formats, un payload = un run = un tableau à un élément.
 */
export function normalizeAll(input: unknown): Trajectory[] {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  const format = detectFormat(value);
  if (format === 'otlp') return normalizeOtlpGrouped(value as any);
  if (!format) throw new UnknownFormatError(describeShape(value));
  return [normalize(value)];
}

function normalizeOtlpGrouped(v: any): Trajectory[] {
  const allSpans: any[] = (v.resourceSpans ?? [])
    .flatMap((rs: any) => rs.scopeSpans ?? [])
    .flatMap((ss: any) => ss.spans ?? []);

  const groups = new Map<string, any[]>();
  for (const span of allSpans) {
    const key = span.traceId ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(span);
  }

  return Array.from(groups.values()).map((spans) => {
    const trajectory = otlpNormalizer.normalize({ resourceSpans: [{ scopeSpans: [{ spans }] }] });
    trajectory.metadata.sourceFormat = 'otlp';
    return trajectory;
  });
}

/* ------------------------------------------------------------------ */
/* Détection & normalisation par format                                */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const trajektNormalizer: Normalizer = {
  format: 'trajekt',
  detect: (v) =>
    isObj(v) && 'schemaVersion' in v && Array.isArray((v as any).steps),
  normalize: (v) => v as Trajectory,
};

const langfuseNormalizer: Normalizer = {
  format: 'langfuse',
  detect: (v) =>
    isObj(v) &&
    Array.isArray((v as any).observations) &&
    (v as any).observations.every(
      (o: unknown) => isObj(o) && 'type' in o && 'startTime' in o,
    ),
  normalize: (v) => {
    const trace = v as any;
    const obs = [...trace.observations].sort(
      (a: any, b: any) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    const steps: TrajectoryStep[] = [];
    for (const o of obs) {
      const base = {
        index: steps.length,
        timestamp: o.startTime,
        durationMs: o.endTime
          ? new Date(o.endTime).getTime() - new Date(o.startTime).getTime()
          : undefined,
        raw: o,
      };
      if (o.type === 'GENERATION') {
        steps.push({
          ...base,
          type: 'llm_call',
          model: o.model ?? undefined,
          input: toMessages(o.input),
          output: toMessages(o.output)[0],
          usage: o.usage
            ? {
                inputTokens: o.usage.input ?? o.usage.promptTokens,
                outputTokens: o.usage.output ?? o.usage.completionTokens,
                totalTokens: o.usage.total ?? o.usage.totalTokens,
              }
            : undefined,
          costUsd: o.calculatedTotalCost ?? undefined,
          error: o.statusMessage ?? undefined,
        });
      } else if (o.type === 'SPAN' && looksLikeToolSpan(o)) {
        steps.push({
          ...base,
          type: 'tool_call',
          name: o.name,
          args: o.input,
          result: o.output,
          error: o.statusMessage ?? undefined,
        });
      } else {
        steps.push({ ...base, type: 'custom', kind: o.type, data: o });
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      id: trace.id ?? cryptoRandomId(),
      source: 'live',
      steps,
      metadata: { name: trace.name },
      createdAt: trace.timestamp,
    };
  },
};

const otlpNormalizer: Normalizer = {
  format: 'otlp',
  detect: (v) => isObj(v) && Array.isArray((v as any).resourceSpans),
  normalize: (v) => {
    const spans: any[] = (v as any).resourceSpans
      .flatMap((rs: any) => rs.scopeSpans ?? [])
      .flatMap((ss: any) => ss.spans ?? [])
      .sort((a: any, b: any) => Number(a.startTimeUnixNano) - Number(b.startTimeUnixNano));

    const steps: TrajectoryStep[] = spans.map((span, index) => {
      const attrs = attrMap(span.attributes);
      const base = {
        index,
        timestamp: nanoToIso(span.startTimeUnixNano),
        durationMs:
          (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6,
        raw: span,
      };
      // Conventions sémantiques GenAI d'OpenTelemetry (gen_ai.*),
      // utilisées par Mastra, le Vercel AI SDK, LangGraph...
      if (attrs['gen_ai.operation.name'] === 'chat' || attrs['gen_ai.request.model']) {
        return {
          ...base,
          type: 'llm_call' as const,
          model: str(attrs['gen_ai.request.model'] ?? attrs['gen_ai.response.model']),
          input: [],
          usage: {
            inputTokens: num(attrs['gen_ai.usage.input_tokens']),
            outputTokens: num(attrs['gen_ai.usage.output_tokens']),
          },
        };
      }
      if (attrs['gen_ai.tool.name'] || attrs['ai.toolCall.name']) {
        return {
          ...base,
          type: 'tool_call' as const,
          name: str(attrs['gen_ai.tool.name'] ?? attrs['ai.toolCall.name']) ?? span.name,
          args: attrs['ai.toolCall.args'],
          result: attrs['ai.toolCall.result'],
        };
      }
      return { ...base, type: 'custom' as const, kind: span.name, data: attrs };
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      id: spans[0]?.traceId ?? cryptoRandomId(),
      source: 'live',
      steps,
      metadata: {},
    };
  },
};

const aiSdkNormalizer: Normalizer = {
  format: 'ai-sdk',
  detect: (v) =>
    isObj(v) &&
    Array.isArray((v as any).steps) &&
    (v as any).steps.every(
      (s: unknown) =>
        isObj(s) && ('toolCalls' in s || 'text' in s || 'stepType' in s),
    ),
  normalize: (v) => {
    const result = v as any;
    const steps: TrajectoryStep[] = [];
    for (const s of result.steps) {
      steps.push({
        index: steps.length,
        type: 'llm_call',
        input: [],
        output: s.text ? { role: 'assistant', content: s.text } : undefined,
        usage: s.usage
          ? {
              inputTokens: s.usage.promptTokens ?? s.usage.inputTokens,
              outputTokens: s.usage.completionTokens ?? s.usage.outputTokens,
            }
          : undefined,
        raw: s,
      });
      for (const tc of s.toolCalls ?? []) {
        const match = (s.toolResults ?? []).find(
          (tr: any) => tr.toolCallId === tc.toolCallId,
        );
        steps.push({
          index: steps.length,
          type: 'tool_call',
          name: tc.toolName,
          args: tc.args ?? tc.input,
          result: match?.result ?? match?.output,
          raw: tc,
        });
      }
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      id: cryptoRandomId(),
      source: 'live',
      steps,
      metadata: {},
    };
  },
};

function allNormalizers(): Normalizer[] {
  return [
    ...registry,
    trajektNormalizer,
    langfuseNormalizer,
    otlpNormalizer,
    aiSdkNormalizer,
  ];
}

/* ------------------------------------------------------------------ */
/* Utilitaires internes                                                */
/* ------------------------------------------------------------------ */

function toMessages(io: unknown): Message[] {
  if (Array.isArray(io)) {
    return io
      .filter(isObj)
      .map((m: any) => ({
        role: m.role ?? 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        raw: m,
      }));
  }
  if (typeof io === 'string') return [{ role: 'user', content: io }];
  if (isObj(io)) return toMessages([io]);
  return [];
}

function looksLikeToolSpan(o: any): boolean {
  return /tool|function/i.test(o.name ?? '') || o.metadata?.tool === true;
}

function attrMap(attributes: any[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attributes) {
    out[a.key] =
      a.value?.stringValue ??
      a.value?.intValue ??
      a.value?.doubleValue ??
      a.value?.boolValue ??
      a.value;
  }
  return out;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : v == null ? undefined : String(v);
const num = (v: unknown): number | undefined =>
  v == null ? undefined : Number(v);

function nanoToIso(nano: unknown): string | undefined {
  const n = Number(nano);
  return Number.isFinite(n) ? new Date(n / 1e6).toISOString() : undefined;
}

function describeShape(v: unknown): string {
  if (!isObj(v)) return `type ${typeof v}`;
  return `clés racine : ${Object.keys(v).slice(0, 8).join(', ') || 'aucune'}`;
}

function cryptoRandomId(): string {
  return `traj_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
