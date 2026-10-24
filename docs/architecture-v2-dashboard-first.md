# Trajekt — Architecture v2 : dashboard-first

## Ce qui change par rapport au plan initial

Le plan v1 partait d'une lib de test avec un dashboard hébergé en option
payante, en bout de roadmap. Ce plan l'inverse :

- **Le dashboard est le produit.** C'est lui qui se démontre, qui se vend,
  qui convertit un curieux en utilisateur en 30 secondes.
- **`core` reste le moteur, inchangé** — il a déjà fait ses preuves
  (normalisation zéro-config, 4 formats). Rien à jeter.
- **`assert` (testing) redescend en fonctionnalité seconde**, un
  companion CI pour les équipes déjà convaincues par le dashboard —
  plus la porte d'entrée.
- **Nouvelle pièce : l'infra d'ingestion + stockage**, absente du plan v1
  parce qu'une lib n'en a pas besoin, un produit visuel oui.

## Positionnement

> Un flight recorder pour agents IA : vois exactement ce que ton agent a
> fait, sans le budget ops que ça implique d'habitude.

Le "sans le budget ops" n'est pas du remplissage marketing — c'est une
vraie différenciation face à Langfuse, qu'on a chiffrée ensemble : leur
stack v3 impose Postgres + ClickHouse + Redis + S3 dès la prod, avec un
setup de 8-16h et des incidents ClickHouse à déboguer. Trajekt vise
**un seul Postgres** pour le MVP et une bonne partie de la vie du produit.
Le JSONB encaisse très bien le volume d'un side project ou d'une petite
équipe ; ClickHouse ne devient une conversation légitime qu'à un volume
que 95% des utilisateurs n'atteindront jamais.

---

## Les couches du système

```
┌─────────────────────────────────────────────────────────────┐
│  1. INSTRUMENTATION (côté agent de l'utilisateur)             │
│     OTel SDK standard → export OTLP                           │
│     (le même otel-setup.ts qu'on a écrit, mais pointé vers     │
│      l'ingestion Trajekt au lieu d'un collector local)        │
├─────────────────────────────────────────────────────────────┤
│  2. INGESTION API                                              │
│     POST /v1/traces — accepte de l'OTLP brut, tel quel         │
│     Auth par clé API de projet (header Authorization)          │
│     → normalize() (trajekt/core, INCHANGÉ)                     │
│     → persiste en base                                         │
├─────────────────────────────────────────────────────────────┤
│  3. STOCKAGE — Postgres, une seule base                        │
│     table trajectories (JSONB pour les steps + colonnes        │
│     indexées pour trier/filtrer sans parser le JSON à chaque   │
│     requête)                                                   │
├─────────────────────────────────────────────────────────────┤
│  4. API DASHBOARD                                               │
│     GET /api/trajectories (liste, pagination, filtres)         │
│     GET /api/trajectories/:id (détail complet)                 │
│     GET /api/stats (agrégats — coût total, tendances)          │
├─────────────────────────────────────────────────────────────┤
│  5. DASHBOARD (web)                                             │
│     Liste des runs (table triable/filtrable)                   │
│     Vue trajectoire = LE VISUALISEUR déjà construit,            │
│     branché sur des données réelles au lieu d'un fichier        │
│     déposé à la main                                            │
│     Comparaison de runs (v2 de cette couche)                   │
├─────────────────────────────────────────────────────────────┤
│  6. ASSERT / CI (secondaire, phase 4+)                          │
│     expectTrajectory() consomme les mêmes Trajectory           │
│     Pousse ses résultats pass/fail vers le dashboard en         │
│     annotation optionnelle                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Schéma de base (Postgres)

```sql
create table projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  api_key_hash  text not null unique,
  created_at    timestamptz not null default now()
);

create table trajectories (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id),
  schema_version     int not null,
  source             text not null,        -- 'live' | 'replay' | 'simulation'
  source_format      text,                 -- 'otlp' | 'langfuse' | 'ai-sdk' | 'trajekt'
  steps              jsonb not null,       -- fidélité complète, ce que lit le visualiseur
  metadata           jsonb not null default '{}',
  total_cost_usd     numeric,              -- dénormalisé, pour trier/filtrer vite
  total_duration_ms  int,
  step_count         int not null,
  created_at         timestamptz not null default now()
);

create index on trajectories (project_id, created_at desc);
create index on trajectories (project_id, total_cost_usd);
```

Le `steps` en JSONB garde la fidélité complète (c'est ce que le
visualiseur consomme directement, sans transformation). Les colonnes
dénormalisées (`total_cost_usd`, `total_duration_ms`, `step_count`)
évitent de parser le JSON à chaque tri de la liste — le seul détail de
perf qui compte vraiment à cette échelle.

---

## Stack technique proposée

| Couche | Choix | Pourquoi |
|---|---|---|
| Dashboard + API | Next.js (App Router) | Un seul déploiement pour l'UI et les routes API — pas de repo séparé à orchestrer |
| ORM | Drizzle | Léger, TypeScript-natif, migrations lisibles |
| Base | Postgres (Neon en hébergé, ou Docker en self-host) | Voir plus haut — le choix qui évite la facture ops de Langfuse |
| Déploiement hébergé | Vercel (app) + Neon (DB) | Zéro serveur à gérer, tier gratuit suffisant pour valider |
| Déploiement self-host | Docker Compose, 2 containers (Next.js + Postgres) | Contraste volontaire avec les 4 services de Langfuse v3 |
| Visualiseur | Le composant React déjà construit | Zéro travail perdu — il devient la vue détail du dashboard |

---

## Roadmap révisée (objectif 6 mois)

| Phase | Contenu | Durée estimée |
|---|---|---|
| **0 — fait** | `core` (normalize, Trajectory), démo visualiseur client-side | — |
| **1** | Ingestion API (`POST /v1/traces`, auth par clé projet) + schéma Postgres + `normalize()` branché | 2-3 sem |
| **2** | Dashboard MVP déployé : liste des runs + vue trajectoire (réutilise le visualiseur), stats agrégées en header | 2-3 sem |
| **3** | Historique + comparaison de deux runs (diff visuel) | 2 sem |
| **4** | `assert` en companion CI, annotations poussées vers le dashboard | selon signal utilisateur |
| **5 — monétisation** | Self-host gratuit (MIT) vs hébergé payant (le playbook Langfuse, mais sans leur ardoise ops) ; le dashboard sert de preuve de compétence pour les audits consulting | continu |

La phase 2 est le jalon qui compte : c'est le moment où Trajekt devient
démontrable en 30 secondes à un prospect ou sur LinkedIn — l'objectif
"drop & wow" devient réel, pas juste une maquette locale.

---

## Décisions à trancher avant la phase 1

1. **Ingestion OTLP brute vs SDK dédié** — recommandation : accepter de
   l'OTLP standard dès le départ (n'importe quel exporter OTel pointe
   dessus sans code custom, on réutilise le normalizer déjà écrit). Un
   SDK `@trajekt/sdk` plus ergonomique peut venir après, en sucre.
2. **Auth minimale phase 1** — une clé API par projet suffit pour
   l'ingestion ; l'accès au dashboard lui-même (login) peut rester très
   simple (un seul compte) tant qu'il n'y a pas de multi-utilisateur à
   gérer.
3. **Rétention** — pas de politique de suppression automatique en phase
   1 (inutile de complexifier avant d'avoir du volume réel).
