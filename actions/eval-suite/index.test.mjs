import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report, pct } from './index.mjs';

const data = {
  agent: 'sentry-triage', dimension: 'prompt', a: 'v7', b: 'v8',
  values: [{ value: 'v8' }, { value: 'v7' }],
  sampleRuns: { 'refund-rounding': { a: 'run-a', b: 'run-b' } },
  comparison: {
    result: 'fail', paired: 12, onlyBaseline: ['old-case'], onlyCurrent: [],
    reasons: ['refund-rounding: 0/3 → 2/3 failed'],
    metrics: [
      { metric: 'costUsd', label: 'Mean cost', baseline: 0.0468, current: 0.0606, delta: 0.0138, relDelta: 0.263, verdict: 'regression' },
      { metric: 'errorRate', label: 'Failed runs', baseline: 0.028, current: 0.056, delta: 0.028, relDelta: 1, verdict: 'stable' },
      { metric: 'newPathShare', label: 'Runs on a new tool path', baseline: 0, current: 0.5, delta: 0.5, relDelta: null, verdict: 'regression' },
    ],
    scenarios: [
      { scenario: 'refund-rounding', verdict: 'regression', changes: [
        { metric: 'errorRate', label: 'Fails more often', detail: '0/3 → 2/3 failed', relDelta: null, direction: 'worse' },
        { metric: 'costUsd', label: 'Mean cost', relDelta: 0.83, direction: 'worse' },
        { metric: 'newPathShare', label: 'Tool path changed', relDelta: null, direction: 'changed' },
      ] },
      { scenario: 'payment-timeout', verdict: 'stable', changes: [] },
    ],
  },
};

test('rapport : verdict, tableau, scénarios et liens', () => {
  const { markdown, page } = report(data, { url: 'https://trajekt.example.com/', agent: 'sentry-triage', marker: '<!-- m -->' });
  assert.ok(markdown.startsWith('<!-- m -->\n### ❌ Trajekt eval suite — `sentry-triage` FAIL'));
  assert.match(markdown, /Prompt version `v8` vs `v7` · 12 scenarios compared/);
  assert.match(markdown, /\| Mean cost \| \$0\.047 \| \$0\.061 \| \+26% \| 🔴 regression \|/);
  assert.match(markdown, /\| Failed runs \| 2\.8% \| 5\.6% \| \+2\.8 pts \| stable \|/);
  assert.match(markdown, /\| Runs on a new tool path \| — \| 50\.0% \|  \| ⚠️ changed \|/);
  assert.match(markdown, /- `refund-rounding` — \*\*Fails more often\*\* \(0\/3 → 2\/3 failed\), Mean cost \+83%, tool path changed · \[diff\]\(https:\/\/trajekt\.example\.com\/runs\/run-b\/compare\?with=run-a\)/);
  assert.match(markdown, /Only in A \(not compared\): `old-case`/);
  assert.equal(page, 'https://trajekt.example.com/agents/sentry-triage/evals?dim=prompt&a=v7&b=v8');
  assert.equal(pct(-0.25), '−25%');
});
