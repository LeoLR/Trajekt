# Architecture — Lib de trajectory testing pour agents IA (TypeScript)

## Vision

Une lib de test qui couvre le cycle complet : **simuler** des situations → **exécuter** l'agent → **asserter** sur la trajectoire → **rapporter** en CI. La partie assertion/replay existe déjà dans ton scaffold ; le simulateur devient la seconde moitié du produit.

Découpage commercial : tout ce qui tourne en local/CI est open source (MIT). La génération intelligente de scénarios, la banque de cas adversariaux et le dashboard hébergé sont la couche payante.

---

## 1. Vue d'ensemble des packages (monorepo pnpm)

```
packages/
├── core/                  # Types partagés, modèle de Trajectory, EventBus
├── providers/
│   ├── langfuse/          # TraceProvider Langfuse (existant)
│   ├── otel/              # TraceProvider OpenTelemetry (existant)
│   └── inmemory/          # Provider mémoire pour tests unitaires
├── replay/                # ReplayEngine + MockToolbox (existant)
├── assert/                # expectTrajectory() — API fluente (existant)
├── simulate/              # ⭐ NOUVEAU — Simulator interface + scénarios manuels
├── runner/                # Orchestrateur : simulate → run → assert
├── report/                # Générateur HTML pour artefacts CI (existant)
└── cli/                   # CLI : `agenttest run`, `agenttest report`
```

**Principe clé** : `core` ne dépend de rien. Tout le reste dépend de `core` uniquement. Les providers sont des plugins — un utilisateur n'installe que ce qu'il utilise.

---

## 2. Le modèle central : `Trajectory`

Tout le système converge vers une structure normalisée, indépendante de la source (trace Langfuse réelle, replay, ou simulation) :

```typescript
interface Trajectory {
  id: string;
  source: 'live' | 'replay' | 'simulation';
  steps: TrajectoryStep[];
  metadata: {
    agentVersion?: string;
    promptVersion?: string;
    scenario?: ScenarioRef;   // renseigné si source = simulation
    costUsd?: number;
    durationMs?: number;
  };
}

type TrajectoryStep =
  | { type: 'llm_call'; input: Message[]; output: Message; model: string; usage: TokenUsage }
  | { type: 'tool_call'; name: string; args: unknown; result: unknown; error?: string }
  | { type: 'decision'; branch: string; reason?: string }
  | { type: 'user_message'; content: string; persona?: string };  // ⭐ pour la simulation
```

C'est ce modèle qui permet au simulateur, au replay et aux traces live de partager la même API d'assertion.

---

## 3. Le nouveau package : `simulate`

### Interface publique (open source)

```typescript
interface Simulator {
  /** Génère le prochain message utilisateur selon l'état de la conversation */
  nextUserTurn(history: Trajectory): Promise<UserTurn | 'done'>;
}

interface Scenario {
  name: string;
  persona: Persona;
  goal: string;                    // ce que l'utilisateur simulé cherche à obtenir
  constraints?: string[];          // ex: "ne donne jamais son email"
  maxTurns?: number;
  successCriteria?: (t: Trajectory) => boolean;
}

interface Persona {
  name: string;
  traits: string[];                // ["impatient", "vague", "hors-sujet fréquent"]
  language?: string;
  adversarial?: AdversarialConfig; // injections, jailbreaks, données malformées
}
```

### Deux implémentations

1. **`ScriptedSimulator` (OSS)** — l'utilisateur écrit ses scénarios à la main en TS : séquences de messages, branchements conditionnels simples. Zéro coût LLM, déterministe, parfait pour la CI.

2. **`LLMSimulator` (OSS, BYOK)** — un LLM joue la persona. L'utilisateur apporte sa clé API. La lib fournit le moteur ; **la valeur payante n'est pas ici**.

### La couche payante (hors lib, service hébergé)

- Banque de scénarios maintenue : injections connues, utilisateurs hostiles, edge cases par domaine (support client, fintech, e-commerce)
- Génération automatique de personas à partir de vraies traces Langfuse ("génère 20 variantes des conversations qui ont échoué le mois dernier")
- Dashboard : historique des runs, comparaison entre versions de prompts, alerting de régression

---

## 4. Le `runner` : orchestration

```typescript
const result = await runSimulation({
  agent: myAgentAdapter,          // wrapper autour de TON agent
  scenario: impatientUserScenario,
  simulator: new LLMSimulator({ model: 'claude-haiku-4-5' }),
  toolbox: new MockToolbox({      // réutilise le replay existant
    'search_jira': mockJiraResults,
    'send_slack': captureOnly(),
  }),
});

expectTrajectory(result.trajectory)
  .toCallTool('search_jira')
  .before('send_slack')
  .toNeverCallTool('delete_ticket')
  .toCompleteWithin({ turns: 6, costUsd: 0.05 })
  .toSatisfy(scenario.successCriteria);
```

**Point d'intégration critique** : `AgentAdapter` — l'interface que l'utilisateur implémente pour brancher son agent. C'est LE point de friction d'adoption, donc il faut fournir des adaptateurs prêts pour Vercel AI SDK, Mastra, LangGraph.js dès la v0.1.

```typescript
interface AgentAdapter {
  invoke(input: UserTurn, context: ConversationContext): Promise<AgentTurn>;
}
```

---

## 5. Intégration CI (le workflow cible)

```yaml
# .gitlab-ci.yml
agent-tests:
  script:
    - pnpm agenttest run --suite ./scenarios --reporter html
  artifacts:
    paths: [agenttest-report/]
```

Le rapport HTML (ton générateur existant) affiche : scénarios passés/échoués, diff de trajectoires entre deux versions, coût total du run, timeline de chaque conversation simulée.

---

## 6. Roadmap de build (aligné sur ton plan 6 mois)

| Phase | Contenu | Durée |
|---|---|---|
| **v0.1** | `core` + normalisation Trajectory, providers existants migrés, `assert` + `report` publiés, `ScriptedSimulator` | 3-4 sem |
| **v0.2** | `LLMSimulator` BYOK, adaptateurs Vercel AI SDK + Mastra, CLI | 3-4 sem |
| **Lancement** | Article + README avec waitlist "scenario bank & dashboard — coming soon" | — |
| **v0.3 / beta payante** | Selon signal waitlist : banque de scénarios + dashboard hébergé | mois 4-6 |

## 7. Décisions à trancher tôt

1. **Nom du package npm** — vérifier la dispo, il structure tout le branding.
2. **Sérialisation des trajectoires** — format JSON versionné dès la v0.1 (les rapports et le futur dashboard en dépendent ; une migration après coup est douloureuse).
3. **Sandbox des tool calls simulés** — MockToolbox par défaut obligatoire ? (recommandé : oui, avec opt-in explicite `allowRealTools: true` pour éviter qu'un scénario adversarial déclenche de vrais side effects).
4. **Déterminisme** — seed + temperature 0 par défaut pour le LLMSimulator, sinon la CI devient flaky.
