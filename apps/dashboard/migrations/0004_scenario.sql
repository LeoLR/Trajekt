-- Runs d'évaluation : un run rattaché à un scénario (attribut
-- trajekt.scenario) vient d'une suite de tests, pas de la prod. Les
-- vues de prod l'ignorent ; les suites se comparent scénario par scénario.

alter table trajectories add column if not exists scenario text;

update trajectories
   set scenario = metadata->'scenario'->>'name'
 where scenario is null and metadata ? 'scenario';

create index if not exists trajectories_agent_scenario_idx
  on trajectories (project_id, agent_name, scenario) where scenario is not null;
