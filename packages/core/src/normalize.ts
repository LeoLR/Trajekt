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
      `Unrecognized trace format (${hint}). Supported: Langfuse trace export, ` +
        `OTLP/JSON, Vercel AI SDK result, Trajekt trajectory. ` +
        `For a custom format, use registerNormalizer().`,
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
  // On aplatit en gardant pour chaque span les attributs de sa
  // ressource (service.name, service.version...) : c'est là que vit
  // l'identité de l'agent, et un même envoi peut mélanger plusieurs
  // services.
  const groups = new Map<string, any[]>();
  for (const rs of v.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const key = span.traceId ?? 'unknown';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ resource: rs.resource, span });
      }
    }
  }

  return Array.from(groups.values()).map((entries) => {
    const trajectory = otlpFromEntries(entries);
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
    let promptVersion: string | undefined;
    for (const o of obs) {
      // Langfuse distingue le niveau (DEBUG..ERROR) du message de statut :
      // un statusMessage seul peut être informatif, ce n'est pas une erreur.
      const error =
        o.level === 'ERROR' ? (o.statusMessage ?? 'error') : undefined;
      const base = {
        index: steps.length,
        id: o.id ?? undefined,
        parentId: o.parentObservationId ?? undefined,
        timestamp: o.startTime,
        durationMs: o.endTime
          ? new Date(o.endTime).getTime() - new Date(o.startTime).getTime()
          : undefined,
        raw: o,
      };
      if (o.type === 'GENERATION') {
        if (promptVersion === undefined && o.promptVersion != null) {
          promptVersion = String(o.promptVersion);
        }
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
          error,
        });
      } else if (o.type === 'TOOL' || (o.type === 'SPAN' && looksLikeToolSpan(o))) {
        steps.push({
          ...base,
          type: 'tool_call',
          name: o.name,
          args: o.input,
          result: o.output,
          error,
        });
      } else {
        steps.push({ ...base, type: 'custom', kind: o.type, data: o, error });
      }
    }
    const meta = isObj(trace.metadata) ? (trace.metadata as Record<string, unknown>) : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      id: trace.id ?? cryptoRandomId(),
      source: 'live',
      steps,
      metadata: {
        name: trace.name,
        traceId: trace.id ?? undefined,
        agentName: str(meta.agentName) ?? trace.name ?? undefined,
        appVersion: str(meta.appVersion) ?? trace.release ?? undefined,
        agentVersion: str(meta.agentVersion) ?? trace.version ?? trace.release ?? undefined,
        promptVersion: str(meta.promptVersion) ?? promptVersion,
        environment: trace.environment ?? undefined,
      },
      createdAt: trace.timestamp,
    };
  },
};

const otlpNormalizer: Normalizer = {
  format: 'otlp',
  detect: (v) => isObj(v) && Array.isArray((v as any).resourceSpans),
  normalize: (v) => {
    const entries: OtlpEntry[] = [];
    for (const rs of (v as any).resourceSpans) {
      for (const ss of rs.scopeSpans ?? []) {
        for (const span of ss.spans ?? []) entries.push({ resource: rs.resource, span });
      }
    }
    return otlpFromEntries(entries);
  },
};

interface OtlpEntry {
  resource?: { attributes?: any[] };
  span: any;
}

/** Opérations GenAI (semconv OTel) qui correspondent à un appel de modèle. */
const LLM_OPERATIONS = new Set(['chat', 'text_completion', 'generate_content', 'completion']);

function otlpFromEntries(entries: OtlpEntry[]): Trajectory {
  const sorted = [...entries].sort(
    (a, b) => Number(a.span.startTimeUnixNano) - Number(b.span.startTimeUnixNano),
  );

  const spanAttrs = sorted.map((e) => attrMap(e.span.attributes));
  const resourceAttrs = sorted.map((e) => attrMap(e.resource?.attributes));

  const steps: TrajectoryStep[] = sorted.map(({ span }, index) => {
    const attrs = spanAttrs[index];
    const base = {
      index,
      id: span.spanId || undefined,
      parentId: span.parentSpanId || undefined,
      timestamp: nanoToIso(span.startTimeUnixNano),
      durationMs: durationMs(span),
      raw: span,
    };
    const error = spanError(span);
    const op = str(attrs['gen_ai.operation.name']);

    const isLlm =
      (op !== undefined && LLM_OPERATIONS.has(op)) ||
      attrs['gen_ai.request.model'] !== undefined ||
      // Vercel AI SDK : seuls les spans *.doGenerate / *.doStream sont
      // de vrais appels au fournisseur ; le span parent les englobe.
      (attrs['ai.model.id'] !== undefined && /\.do(Generate|Stream)$/.test(span.name ?? ''));
    const toolName = str(
      attrs['gen_ai.tool.name'] ?? attrs['ai.toolCall.name'] ??
        (op === 'execute_tool' ? span.name : undefined),
    );

    if (toolName !== undefined) {
      return {
        ...base,
        type: 'tool_call' as const,
        name: toolName,
        args: maybeJson(attrs['gen_ai.tool.call.arguments'] ?? attrs['ai.toolCall.args']),
        result: maybeJson(attrs['gen_ai.tool.call.result'] ?? attrs['ai.toolCall.result']),
        error,
      };
    }
    if (isLlm) {
      const inputTokens = num(
        attrs['gen_ai.usage.input_tokens'] ?? attrs['gen_ai.usage.prompt_tokens'] ??
          attrs['ai.usage.promptTokens'] ?? attrs['ai.usage.inputTokens'],
      );
      const outputTokens = num(
        attrs['gen_ai.usage.output_tokens'] ?? attrs['gen_ai.usage.completion_tokens'] ??
          attrs['ai.usage.completionTokens'] ?? attrs['ai.usage.outputTokens'],
      );
      // Messages : conventions GenAI récentes (gen_ai.input/output.messages)
      // et Vercel AI SDK (ai.prompt.messages, ai.response.text). Présents
      // seulement si l'instrumentation capture le contenu.
      const input = toMessages(
        maybeJson(attrs['gen_ai.input.messages'] ?? attrs['ai.prompt.messages'] ?? attrs['ai.prompt']),
      ).map(({ role, content }) => ({ role, content: content.slice(0, 8000) }));
      const outMessages = toMessages(maybeJson(attrs['gen_ai.output.messages']));
      const text = str(attrs['ai.response.text']) ?? outMessages[0]?.content;
      return {
        ...base,
        type: 'llm_call' as const,
        model: str(
          attrs['gen_ai.response.model'] ?? attrs['gen_ai.request.model'] ?? attrs['ai.model.id'],
        ),
        input,
        output: text ? { role: 'assistant' as const, content: text.slice(0, 8000) } : undefined,
        usage:
          inputTokens !== undefined || outputTokens !== undefined
            ? { inputTokens, outputTokens }
            : undefined,
        costUsd: num(attrs['gen_ai.usage.cost'] ?? attrs['trajekt.cost_usd']),
        error,
      };
    }
    return { ...base, type: 'custom' as const, kind: span.name, data: attrs, error };
  });

  // Identité : le span racine d'abord, puis n'importe quel span, puis la
  // ressource. Les clés trajekt.* permettent de forcer une valeur.
  const rootIdx = sorted.findIndex((e) => !e.span.parentSpanId);
  const ordered = rootIdx >= 0
    ? [spanAttrs[rootIdx], ...spanAttrs.filter((_, i) => i !== rootIdx)]
    : spanAttrs;
  const pick = (keys: string[], fromResource: string[] = []) => {
    for (const k of keys) {
      for (const a of ordered) if (a[k] !== undefined && a[k] !== '') return str(a[k]);
    }
    for (const k of fromResource) {
      for (const a of resourceAttrs) if (a[k] !== undefined && a[k] !== '') return str(a[k]);
    }
    return undefined;
  };
  let serviceName = pick([], ['service.name']);
  if (serviceName?.startsWith('unknown_service')) serviceName = undefined;

  const traceId: string | undefined = sorted[0]?.span.traceId || undefined;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: traceId ?? cryptoRandomId(),
    source: 'live',
    steps,
    metadata: {
      traceId,
      agentName:
        pick(['trajekt.agent.name', 'gen_ai.agent.name', 'ai.telemetry.functionId']) ?? serviceName,
      // service.version décrit le service déployé : c'est la version de
      // l'appli. La version d'agent n'est renseignée que si elle est
      // explicite — le repli sur la version d'appli se fait au stockage,
      // sinon un lot sans racine écraserait la vraie valeur à la fusion.
      appVersion: pick(
        ['trajekt.app.version', 'app.version', 'ai.telemetry.metadata.appVersion'],
        ['trajekt.app.version', 'app.version', 'service.version'],
      ),
      agentVersion: pick(
        ['trajekt.agent.version', 'gen_ai.agent.version', 'ai.telemetry.metadata.agentVersion'],
        ['trajekt.agent.version'],
      ),
      promptVersion: pick(
        ['trajekt.prompt.version', 'gen_ai.prompt.version', 'ai.telemetry.metadata.promptVersion'],
        ['trajekt.prompt.version'],
      ),
      environment: pick(
        ['trajekt.environment'],
        ['deployment.environment.name', 'deployment.environment'],
      ),
    },
  };
}

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
        model: s.response?.modelId ?? s.modelId ?? result.response?.modelId ?? undefined,
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

function contentText(c: unknown): string {
  if (typeof c === 'string') return c;
  // Contenu en "parts" ([{type:'text', text|content}, ...]) : AI SDK, semconv GenAI.
  if (Array.isArray(c)) {
    const texts = c
      .map((p: any) => (typeof p === 'string' ? p : p?.text ?? (typeof p?.content === 'string' ? p.content : undefined)))
      .filter((t): t is string => typeof t === 'string');
    if (texts.length) return texts.join('\n');
  }
  return JSON.stringify(c);
}

function toMessages(io: unknown): Message[] {
  if (isObj(io) && Array.isArray((io as any).messages)) return toMessages((io as any).messages);
  if (Array.isArray(io)) {
    return io
      .filter(isObj)
      .map((m: any) => ({
        role: m.role ?? 'user',
        content: contentText(m.content ?? m.parts),
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
  for (const a of attributes ?? []) {
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
const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function durationMs(span: any): number | undefined {
  const start = Number(span.startTimeUnixNano);
  const end = Number(span.endTimeUnixNano);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? (end - start) / 1e6
    : undefined;
}

/**
 * Un span est en erreur si son statut vaut ERROR (code 2, ou la forme
 * texte de certains exporters), ou s'il porte un événement "exception"
 * (recordException sans setStatus, oubli fréquent).
 */
function spanError(span: any): string | undefined {
  const code = span.status?.code;
  const isError = code === 2 || code === 'STATUS_CODE_ERROR' || code === 'ERROR';
  const exception = (span.events ?? []).find((e: any) => e?.name === 'exception');
  if (!isError && !exception) return undefined;
  const excMsg = exception ? str(attrMap(exception.attributes)['exception.message']) : undefined;
  return str(span.status?.message) || excMsg || 'error';
}

function maybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}

function nanoToIso(nano: unknown): string | undefined {
  if (nano == null || nano === '') return undefined;
  const n = Number(nano);
  return Number.isFinite(n) && n > 0 ? new Date(n / 1e6).toISOString() : undefined;
}

function describeShape(v: unknown): string {
  if (!isObj(v)) return `got ${Array.isArray(v) ? 'an array' : typeof v}`;
  return `top-level keys: ${Object.keys(v).slice(0, 8).join(', ') || 'none'}`;
}

function cryptoRandomId(): string {
  return `traj_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
