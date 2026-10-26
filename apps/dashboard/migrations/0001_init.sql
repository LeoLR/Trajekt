-- Trajekt — schéma initial.
--
-- Un seul Postgres, pas de ClickHouse : les colonnes dénormalisées
-- ci-dessous rendent les séries temporelles et les comparaisons de
-- versions calculables en SQL simple, sans parser le JSONB des steps.

create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  api_key_hash  text not null unique,
  created_at    timestamptz not null default now()
);

create table if not exists trajectories (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,

  -- Clé de fusion : les lots successifs d'une même trace OTel
  -- (ou les ré-envois d'une trace Langfuse) mettent à jour la même ligne.
  trace_id             text,

  -- Identité : l'axe de suivi dans le temps.
  agent_name           text not null default 'unknown',
  agent_version        text,
  prompt_version       text,
  environment          text,
  primary_model        text,

  schema_version       int  not null,
  source               text not null,               -- live | replay | simulation
  source_format        text,                        -- otlp | langfuse | ai-sdk | trajekt

  -- Métriques du run (computeMetrics de @trajekt-ai/core).
  status               text not null check (status in ('ok', 'error')),
  started_at           timestamptz not null,
  duration_ms          int,
  step_count           int  not null,
  llm_call_count       int  not null default 0,
  tool_call_count      int  not null default 0,
  error_count          int  not null default 0,
  tool_error_count     int  not null default 0,
  input_tokens         int  not null default 0,
  output_tokens        int  not null default 0,
  cost_usd             numeric(16, 8),
  cost_estimated       boolean not null default false,
  redundant_tool_calls int  not null default 0,
  retry_count          int  not null default 0,
  path_signature       text not null,

  -- Fidélité complète : ce que lit le visualiseur.
  steps                jsonb not null,
  metadata             jsonb not null default '{}',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists trajectories_project_trace_uidx
  on trajectories (project_id, trace_id) where trace_id is not null;
create index if not exists trajectories_project_started_idx
  on trajectories (project_id, started_at desc, id desc);
create index if not exists trajectories_agent_started_idx
  on trajectories (project_id, agent_name, started_at desc);
create index if not exists trajectories_agent_version_idx
  on trajectories (project_id, agent_name, agent_version);

-- Alertes de régression déjà émises : sert à ne pas renvoyer la même
-- alerte à chaque passage du check (cooldown par agent + métrique).
create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  agent_name   text not null,
  mode         text not null check (mode in ('window', 'version')),
  metric       text not null,
  severity     text not null check (severity in ('warning', 'critical')),
  baseline     double precision,
  current      double precision,
  rel_delta    double precision,
  detail       text,
  context      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

create index if not exists alerts_lookup_idx
  on alerts (project_id, agent_name, metric, mode, created_at desc);
