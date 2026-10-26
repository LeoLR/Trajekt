/**
 * trajekt/core — Instrumenter un agent en quelques lignes.
 *
 * Aucune dépendance : on passe un tracer OpenTelemetry (celui de
 * @opentelemetry/api), et ces helpers posent les attributs que Trajekt
 * lit — conventions GenAI d'OpenTelemetry plus les quelques clés trajekt.*.
 *
 *   import { trace } from '@opentelemetry/api';
 *   import { traceRun, traceTool } from '@trajekt-ai/core';
 *   const tracer = trace.getTracer('my-agent');
 *
 *   await traceRun(tracer, { agent: 'sentry-triage', agentVersion: '1.5.0', promptVersion: 'v8' }, async (run) => {
 *     const issue = await traceTool(tracer, 'sentry.getIssue', { id }, () => sentry.getIssue(id));
 *     …
 *     run.score('correct', ticketIsRight ? 1 : 0);
 *   });
 */

export interface RunLabels {
  /** Nom de l'agent — l'axe de suivi. */
  agent: string;
  appVersion?: string;
  agentVersion?: string;
  promptVersion?: string;
  environment?: string;
  /** Pour un run d'évaluation (suite de tests, données mockées). */
  scenario?: string;
}

/** Les attributs OpenTelemetry qui portent ces étiquettes. */
export function runAttributes(l: RunLabels): Record<string, string> {
  const a: Record<string, string> = {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': l.agent,
  };
  if (l.appVersion) a['trajekt.app.version'] = l.appVersion;
  if (l.agentVersion) a['trajekt.agent.version'] = l.agentVersion;
  if (l.promptVersion) a['trajekt.prompt.version'] = l.promptVersion;
  if (l.environment) a['trajekt.environment'] = l.environment;
  if (l.scenario) a['trajekt.scenario'] = l.scenario;
  return a;
}

/** Ce que ces helpers utilisent d'un span OpenTelemetry. */
export interface SpanLike {
  setAttribute(key: string, value: string | number | boolean): unknown;
  setAttributes(attrs: Record<string, string | number | boolean>): unknown;
  setStatus(status: { code: number; message?: string }): unknown;
  recordException?(e: unknown): unknown;
  spanContext?(): { traceId: string };
  end(): void;
}

/** Ce que ces helpers utilisent d'un tracer OpenTelemetry (trace.getTracer(...)). */
export interface TracerLike {
  startActiveSpan<F extends (span: any) => any>(name: string, fn: F): ReturnType<F>;
}

const STATUS_ERROR = 2;

export interface RunHandle {
  span: SpanLike;
  /** traceId du run : la clé pour envoyer un score plus tard (POST /v1/scores). */
  traceId?: string;
  /** Score de qualité du run, plus haut = mieux (de préférence entre 0 et 1). */
  score(name: string, value: number | boolean): void;
}

async function inSpan<T>(tracer: TracerLike, name: string, attrs: Record<string, string>, fn: (span: SpanLike) => Promise<T> | T): Promise<T> {
  return tracer.startActiveSpan(name, async (span: SpanLike) => {
    span.setAttributes(attrs);
    try {
      return await fn(span);
    } catch (e) {
      span.recordException?.(e);
      span.setStatus({ code: STATUS_ERROR, message: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      span.end();
    }
  });
}

/**
 * Enregistre un run de l'agent : un span racine avec son nom, ses versions
 * et, pour une suite de tests, son scénario. Une exception marque le run en échec.
 */
export function traceRun<T>(tracer: TracerLike, labels: RunLabels, fn: (run: RunHandle) => Promise<T> | T): Promise<T> {
  return inSpan(tracer, `invoke_agent ${labels.agent}`, runAttributes(labels), (span) =>
    fn({
      span,
      traceId: span.spanContext?.().traceId,
      score: (name, value) => span.setAttribute(`trajekt.score.${name}`, typeof value === 'boolean' ? Number(value) : value),
    }),
  );
}

function json(v: unknown): string {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 16_000 ? s.slice(0, 16_000) : s;
  } catch {
    return String(v);
  }
}

/**
 * Enregistre un appel d'outil, avec ses arguments et son résultat. Les
 * arguments servent à repérer les appels répétés : sans eux, Trajekt ne
 * conclut rien. Une exception marque l'appel en échec (et sera rejouée).
 */
export function traceTool<T>(tracer: TracerLike, name: string, args: unknown, fn: () => Promise<T> | T, opts: { captureResult?: boolean } = {}): Promise<T> {
  return inSpan(tracer, `execute_tool ${name}`, {
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.tool.name': name,
    'gen_ai.tool.call.arguments': json(args),
  }, async (span) => {
    const result = await fn();
    if (opts.captureResult !== false && result !== undefined) span.setAttribute('gen_ai.tool.call.result', json(result));
    return result;
  });
}

/* ------------------------------------------------------------------ */
/* Appels au modèle                                                     */
/* ------------------------------------------------------------------ */

export interface LlmCallInfo {
  model: string;
  /** anthropic, openai… (gen_ai.system). */
  system?: string;
  /** Les messages envoyés, enregistrés si captureContent (défaut : oui). */
  input?: unknown;
  captureContent?: boolean;
}

/** Lit l'usage d'une réponse Anthropic ou OpenAI. */
function usageOf(r: any): Record<string, number> {
  const u = r?.usage;
  if (!u || typeof u !== 'object') return {};
  const out: Record<string, number> = {};
  const set = (k: string, v: unknown) => typeof v === 'number' && Number.isFinite(v) && (out[k] = v);
  // Anthropic : input_tokens exclut le cache, compté à part.
  set('gen_ai.usage.input_tokens', u.input_tokens ?? u.prompt_tokens);
  set('gen_ai.usage.output_tokens', u.output_tokens ?? u.completion_tokens);
  set('gen_ai.usage.cache_read.input_tokens', u.cache_read_input_tokens);
  set('gen_ai.usage.cache_creation.input_tokens', u.cache_creation_input_tokens);
  // OpenAI : prompt_tokens inclut le cache ; on sépare pour le coût.
  const cached = u.prompt_tokens_details?.cached_tokens;
  if (typeof cached === 'number' && cached > 0 && typeof u.prompt_tokens === 'number') {
    out['gen_ai.usage.input_tokens'] = u.prompt_tokens - cached;
    out['gen_ai.usage.cache_read.input_tokens'] = cached;
  }
  return out;
}

function outputOf(r: any): unknown {
  if (Array.isArray(r?.content)) return [{ role: 'assistant', content: r.content }]; // Anthropic
  if (Array.isArray(r?.choices)) return r.choices.map((c: any) => c.message).filter(Boolean); // OpenAI
  return undefined;
}

/**
 * Enregistre un appel au modèle : modèle, tokens (cache compris), raison
 * d'arrêt et, sauf captureContent: false, les messages. Le coût est
 * estimé par Trajekt à partir des tokens. Comprend les réponses de
 * l'API Anthropic (messages.create) et OpenAI (chat.completions.create).
 */
export function traceLlm<T>(tracer: TracerLike, info: LlmCallInfo, fn: () => Promise<T> | T): Promise<T> {
  const attrs: Record<string, string> = {
    'gen_ai.operation.name': 'chat',
    'gen_ai.request.model': info.model,
  };
  if (info.system) attrs['gen_ai.system'] = info.system;
  const capture = info.captureContent !== false;
  if (capture && info.input !== undefined) attrs['gen_ai.input.messages'] = json(info.input);
  return inSpan(tracer, `chat ${info.model}`, attrs, async (span) => {
    const result: any = await fn();
    if (result && typeof result === 'object') {
      for (const [k, v] of Object.entries(usageOf(result))) span.setAttribute(k, v);
      if (typeof result.model === 'string') span.setAttribute('gen_ai.response.model', result.model);
      const stop = result.stop_reason ?? result.choices?.[0]?.finish_reason;
      if (typeof stop === 'string') span.setAttribute('gen_ai.response.finish_reasons', stop);
      const out = outputOf(result);
      if (capture && out !== undefined) span.setAttribute('gen_ai.output.messages', json(out));
    }
    return result as T;
  });
}

/**
 * Enveloppe un client du SDK Anthropic : chaque client.messages.create
 * (hors streaming) devient un appel au modèle tracé, sans rien changer
 * d'autre au code de l'agent.
 *
 *   const anthropic = traceAnthropic(new Anthropic(), tracer);
 *   const msg = await anthropic.messages.create({ model: 'claude-sonnet-5-5', … });
 */
export function traceAnthropic<C extends { messages: { create: (...args: any[]) => any } }>(
  client: C, tracer: TracerLike, opts: { captureContent?: boolean } = {},
): C {
  const messages = new Proxy(client.messages, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== 'create' || typeof value !== 'function') return value;
      return (params: any, ...rest: any[]) => {
        // Le streaming renvoie un flux, pas une réponse : on le laisse passer tel quel.
        if (params?.stream) return value.call(target, params, ...rest);
        const input = params?.system !== undefined ? [{ role: 'system', content: params.system }, ...(params.messages ?? [])] : params?.messages;
        return traceLlm(tracer, { model: String(params?.model ?? 'unknown'), system: 'anthropic', input, captureContent: opts.captureContent }, () => value.call(target, params, ...rest));
      };
    },
  });
  return new Proxy(client, {
    get(target, prop, receiver) {
      return prop === 'messages' ? messages : Reflect.get(target, prop, receiver);
    },
  });
}
