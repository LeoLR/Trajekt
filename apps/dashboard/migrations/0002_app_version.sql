-- Version de l'application qui embarque l'agent, distincte de la version
-- de l'agent. Les runs existants la récupèrent depuis leurs métadonnées.

alter table trajectories add column if not exists app_version text;

update trajectories
   set app_version = metadata->>'appVersion'
 where app_version is null and metadata ? 'appVersion';

create index if not exists trajectories_agent_app_version_idx
  on trajectories (project_id, agent_name, app_version);
create index if not exists trajectories_agent_prompt_version_idx
  on trajectories (project_id, agent_name, prompt_version);
create index if not exists trajectories_agent_model_idx
  on trajectories (project_id, agent_name, primary_model);
