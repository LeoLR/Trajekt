# Trajekt — pitch interne

**Format suggéré : 15-20 min, démo live au centre.** Pas un pitch de
vente — une présentation exploratoire de type "j'ai creusé un problème
qu'on a tous, voilà où j'en suis."

**Titre de la session :** *"Voir ce qu'un agent a vraiment fait — sans
lire du JSON"*

---

## 1. Accroche (1 min)

> "On a un agent en prod — Sentry → Jira → GitLab → Slack — et Langfuse
> pour l'observability. Question simple : combien de temps il vous
> faut pour comprendre ce qu'un run a fait, juste en le regardant ?"

Laisser la question flotter 5 secondes. Tout le monde a vécu le
"je scrolle du JSON dans l'UI Langfuse pour comprendre une régression."

---

## 2. Le problème, ancré dans CE qu'on construit déjà (2-3 min)

- On converge sur LiteLLM (proxy) + Langfuse (observability) + Grafana
  (dashboard d'usage agrégé) pour la gouvernance IA.
- Le Grafana répond à *"qui utilise quoi, combien ça coûte"* — la
  question méta. Il ne répond pas à *"qu'est-ce que CET agent a décidé
  de faire, étape par étape"* — la question de debug/review du
  quotidien.
- Aujourd'hui cette question se répond en lisant des traces brutes.
  Fonctionnel, mais rien qu'on screenshot pour un post-mortem ou une
  review de PR.

C'est le trou que j'ai exploré.

---

## 3. La démo — le cœur de la session (8-10 min)

Faire tourner le visualiseur en live, idéalement sur **une vraie trace
du pipeline Sentry→Jira**, pas juste l'exemple pré-chargé — c'est ce qui
transforme "joli prototype" en "ça marche sur nos données."

Script suggéré :

1. Montrer la trajectoire pré-chargée (le pipeline Sentry→Jira→Slack) —
   cliquer les nœuds, montrer coût/durée par step.
2. **Le moment fort** : drag & drop un vrai export Langfuse de leur
   instance dessus, en direct. Le badge de format détecté
   automatiquement apparaît sans qu'on ait touché à rien — zéro
   config, zéro adaptateur à écrire.
3. Mentionner en une phrase ce qui tourne dessous (`@trajekt/core`,
   MIT, normalise Langfuse/OTLP/AI SDK vers un modèle unique) — sans
   s'attarder, la démo parle plus que le code.

---

## 4. Ce que c'est — et ce que ce n'est PAS (2 min)

Être précis ici évite deux mauvaises lectures : "il veut remplacer
Langfuse" ou "c'est juste un gadget visuel."

- **Ce n'est pas** un remplacement de Langfuse — le stockage,
  l'analytics long terme, ça reste leur job.
- **C'est** une couche de visualisation + normalisation qui peut lire
  ce que Langfuse (ou n'importe quel export OTel) produit déjà, sans
  rien reconfigurer.
- Détail utile vu le contexte : l'auto-hébergement vise volontairement
  un seul Postgres, pas la stack à 4 services (Postgres + ClickHouse +
  Redis + S3) que Langfuse impose en prod — pertinent si le sujet
  "self-host Langfuse sur GCP" revient sur la table.

---

## 5. Pourquoi c'est pertinent pour l'équipe, pas juste pour moi (1-2 min)

- Ça rend l'initiative de gouvernance IA plus **démontrable** — un
  Grafana de métriques d'usage se pitch mal à la direction, un
  visualiseur de trajectoire se démontre en 30 secondes.
- Utile en review de PR : un lien vers une trajectoire visuelle au lieu
  d'un dump de logs dans un commentaire.
- Zéro lock-in : c'est un format ouvert (MIT), pas une dépendance de
  plus à gérer.

---

## 6. Ce que je demande (30 sec — ton bas-key, pas de vente)

- Pas un "adoptez ça." Plutôt : *"Est-ce que ça vous parle ? Vous
  auriez ce réflexe de debug aussi ?"*
- Proposition concrète si l'accueil est bon : le brancher en lecture
  seule sur une portion des traces du pipeline Sentry→Jira, pour voir
  si l'usage réel confirme l'intuition.

---

## Après la session

Si l'accueil interne est bon, c'est le signal pour l'article public —
et un bon test avant publication : les objections soulevées en interne
(un collègue qui demande "et la sécu des données ?", "et si Langfuse
suffit déjà ?") sont exactement celles qu'un lecteur externe aura. Les
avoir entendues une fois évite de les découvrir dans les commentaires.
