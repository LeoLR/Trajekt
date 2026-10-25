-- Clés d'API avec un périmètre : 'ingest' (envoyer des traces) ou 'read'
-- (lire les données : API, serveur MCP). Une clé de lecture ne peut pas
-- écrire, une clé d'ingestion ne peut pas lire. La clé historique de
-- projects.api_key_hash reste une clé d'ingestion.

create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  name          text not null,
  scope         text not null check (scope in ('ingest', 'read')),
  key_hash      text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists api_keys_project_idx on api_keys (project_id);
