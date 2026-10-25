-- Scores de qualité d'un run (plus haut = mieux) : exactitude, assertions
-- respectées, jugement d'un LLM, retour utilisateur. Ils viennent de la
-- trace (attributs trajekt.score.*, scores Langfuse) ou arrivent après
-- coup (POST /v1/scores). Un score envoyé par l'API n'est jamais écrasé
-- par la trace.

create table if not exists run_scores (
  trajectory_id uuid not null references trajectories(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  value         double precision not null,
  source        text not null check (source in ('trace', 'api')),
  comment       text,
  created_at    timestamptz not null default now(),
  primary key (trajectory_id, name)
);

create index if not exists run_scores_project_name_idx on run_scores (project_id, name);
