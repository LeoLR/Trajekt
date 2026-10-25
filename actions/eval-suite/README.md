# Trajekt eval suite — GitHub Action

Compares two versions of an agent on its eval suite, scenario by scenario, with your Trajekt instance. It writes the result to the job summary, comments it on the pull request (one comment, updated on each push), and fails the job when the suite regresses.

```yaml
- uses: LeoLR/Trajekt/actions/eval-suite@main
  with:
    url: ${{ vars.TRAJEKT_URL }}
    read-key: ${{ secrets.TRAJEKT_READ_KEY }}
    agent: sentry-triage
    baseline: ${{ github.event.pull_request.base.sha }}
    candidate: ${{ github.event.pull_request.head.sha }}
```

The runs must already be in Trajekt: tagged with `trajekt.scenario` and with the version under test (`trajekt.agent.version` by default — see `dimension`). A complete workflow, which records the baseline on `main` and compares on each pull request, is in [`examples/eval-suite/github-workflow.yml`](../../examples/eval-suite/github-workflow.yml).

| Input | Default | |
|---|---|---|
| `url` | — | Your Trajekt instance |
| `read-key` | — | A read key (`tk_read_…`), as a secret |
| `agent` | — | Agent name |
| `dimension` | `agent` | `agent`, `prompt`, `app` or `model` |
| `baseline` | previous value evaluated | A |
| `candidate` | latest value evaluated | B |
| `fail-on-regression` | `true` | Fail the job when the result is `fail` |
| `comment` | `true` | Comment on the pull request (needs `pull-requests: write`) |
| `github-token` | `github.token` | Token used to comment |

Outputs: `result` (`pass` or `fail`) and `report-url` (the comparison in the dashboard).

The suite fails when a metric regresses across the suite (paired test, at least 8 scenarios), when a scenario starts failing, or when a scenario's quality score drops by 0.5 or more. A new tool path is reported but never fails it. Details: [Testing your agent](https://trajekt-eight.vercel.app/docs/#eval-ci).

No dependency: plain Node 24 and `fetch`.
