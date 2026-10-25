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

export { decodeOtlpProtobuf } from './otlp-proto.js';

export {
  computeMetrics,
  annotateSteps,
  stableStringify,
  isMutatingTool,
  setMutatingTools,
  type StepAnnotation,
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
  holmAdjust,
  metricLabel,
  isScoreKey,
  type ScoreKey,
  type AnyMetricKey,
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

export {
  diffTrajectories,
  type DiffMark,
  type DiffRow,
  type TrajectoryDiff,
} from './diff.js';

export {
  compareScenarios,
  scenarioRunOf,
  signedRankPValues,
  type ScenarioRun,
  type ScenarioAggregate,
  type ScenarioChange,
  type ScenarioDiff,
  type SuiteComparison,
  type SuiteCompareOptions,
} from './suite.js';

export {
  checkTrajectory,
  assertTrajectory,
  scoreTrajectory,
  countExpectations,
  type ExpectationScore,
  matchesPartially,
  TrajectoryAssertionError,
  type TrajectoryExpectations,
  type ExpectationFailure,
} from './expect.js';

export {
  traceRun,
  traceTool,
  traceLlm,
  traceAnthropic,
  type LlmCallInfo,
  runAttributes,
  type RunLabels,
  type RunHandle,
  type SpanLike,
  type TracerLike,
} from './instrument.js';

export {
  createRedactor,
  redactTrajectory,
  type RedactionOptions,
  type RedactionPattern,
  type BuiltInRedaction,
} from './redact.js';
