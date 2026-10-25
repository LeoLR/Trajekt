/**
 * Tests de comportement : chaque scénario doit ouvrir le bon ticket,
 * dans le bon ordre, sans boucler et dans le budget.
 *
 *   AGENT_VERSION=v1 npx tsx --test examples/eval-suite/suite.test.ts   # passe
 *   AGENT_VERSION=v2 npx tsx --test examples/eval-suite/suite.test.ts   # échoue sur les tickets ambigus
 */
import { test } from 'node:test';
import { assertTrajectory } from '../../packages/core/src/index.js';
import { SCENARIOS } from './scenarios.js';
import { runAgent, type AgentVersion } from './agent.js';

const version = (process.env.AGENT_VERSION ?? 'v1') as AgentVersion;

for (const scenario of SCENARIOS) {
  test(`${scenario.name} (${version})`, () => {
    assertTrajectory(runAgent(scenario, version, 0), {
      order: ['sentry.getIssue', 'gitlab.readFile', 'jira.createIssue'],
      calledWith: [
        { tool: 'gitlab.readFile', args: { path: scenario.issue.file } },
        { tool: 'jira.createIssue', args: { project: scenario.expectedProject } },
      ],
      notCalls: ['gitlab.createMergeRequest'],
      maxRepeatedToolCalls: 0,
      maxSteps: 10,
      maxCostUsd: 0.06,
    });
  });
}
