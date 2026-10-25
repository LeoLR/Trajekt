# Example: an eval suite for an agent

A toy triage agent, eight mocked Sentry issues, and the two ways Trajekt checks a change before it ships.

```bash
# Behaviour tests — one test per scenario, with assertTrajectory
AGENT_VERSION=v1 npx tsx --test examples/eval-suite/suite.test.ts   # passes
AGENT_VERSION=v2 npx tsx --test examples/eval-suite/suite.test.ts   # fails on the ambiguous issues

# Suite comparison — every scenario run 3 times on each version, compared scenario by scenario
npx tsx examples/eval-suite/compare.ts v1 v2   # FAIL, exit code 1
npx tsx examples/eval-suite/compare.ts v2 v1   # PASS
```

`v2` imitates a common regression: when the code search returns several files, it runs the same search again instead of reading the right file — and sometimes reads the wrong one. Each run carries a quality score, `correct` (did it read the file of the issue?), so the suite fails on the scenario where `v2` goes wrong (`correct` 1.00 → 0.33) even though only four scenarios out of eight changed — too few for a verdict across the suite.

In your project:

- `agent.ts` is your real agent, with a real model, wired to mocked tools. Its trajectory comes from your OpenTelemetry instrumentation (`normalize`) or your framework.
- Imports become `@trajekt/core` (here they point at the source of the repository).
- To see the suites in the dashboard, send the runs to Trajekt with a `trajekt.scenario` attribute and the version under test (`trajekt.agent.version`, `trajekt.prompt.version`…), then open `/agents/<name>/evals`. See [Testing your agent](https://trajekt-eight.vercel.app/docs/#testing).
