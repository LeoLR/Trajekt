/**
 * trajekt/core — point d'entrée public.
 *
 * Usage minimal, zéro config :
 *
 *   import { normalize } from '@trajekt/core';
 *   const trajectory = normalize(anyTraceJson); // Langfuse, OTLP, AI SDK...
 */

export {
  SCHEMA_VERSION,
  type Trajectory,
  type TrajectoryStep,
  type TrajectorySource,
  type TrajectoryMetadata,
  type RunStatus,
  type LlmCallStep,
  type ToolCallStep,
  type UserMessageStep,
  type AgentMessageStep,
  type DecisionStep,
  type CustomStep,
  type Message,
  type TokenUsage,
  serializeTrajectory,
  deserializeTrajectory,
  SchemaVersionError,
  toolCalls,
  llmCalls,
  turns,
  totalCostUsd,
} from './trajectory.js';

export {
  normalize,
  normalizeAll,
  detectFormat,
  registerNormalizer,
  type Normalizer,
  type KnownFormat,
  UnknownFormatError,
} from './normalize.js';

export {
  fetchTrajectory,
  type TraceProvider,
  type TraceFilter,
  type AgentAdapter,
  type AgentTurnResult,
  type ConversationContext,
} from './provider.js';

export { mergeTrajectories, sortAndReindex } from './merge.js';

export {
  computeMetrics,
  stableStringify,
  NO_TOOL_PATH,
  type RunMetrics,
} from './metrics.js';

export {
  DEFAULT_PRICING,
  setPricing,
  getPricing,
  priceFor,
  estimateCostUsd,
  type ModelPrice,
} from './pricing.js';

export {
  compareWindows,
  regressionsOnly,
  normalCdf,
  proportionIncreasePValue,
  meanIncreasePValue,
  METRIC_LABELS,
  type MetricKey,
  type Moments,
  type WindowStats,
  type Comparison,
  type CompareOptions,
  type Verdict,
  type Severity,
} from './regression.js';
