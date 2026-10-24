import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, index } from 'drizzle-orm/pg-core';

/**
 * Un projet = une clé API. En phase 1, l'utilisateur n'a besoin
 * que d'un seul projet — pas de multi-tenant à gérer tout de suite.
 */
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `steps` garde la fidélité complète (JSONB) — c'est ce que le
 * visualiseur consomme tel quel. Les colonnes dénormalisées
 * (totalCostUsd, totalDurationMs, stepCount) évitent de parser le
 * JSON à chaque tri/filtre de la liste.
 */
export const trajectories = pgTable(
  'trajectories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    schemaVersion: integer('schema_version').notNull(),
    source: text('source').notNull(), // 'live' | 'replay' | 'simulation'
    sourceFormat: text('source_format'), // 'otlp' | 'langfuse' | 'ai-sdk' | 'trajekt'
    steps: jsonb('steps').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    totalCostUsd: numeric('total_cost_usd', { precision: 12, scale: 6 }),
    totalDurationMs: integer('total_duration_ms'),
    stepCount: integer('step_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index('trajectories_project_created_idx').on(table.projectId, table.createdAt),
    projectCostIdx: index('trajectories_project_cost_idx').on(table.projectId, table.totalCostUsd),
  }),
);
