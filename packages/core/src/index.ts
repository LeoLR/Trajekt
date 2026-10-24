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
