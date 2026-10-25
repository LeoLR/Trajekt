# Trajekt dashboard

Next.js app: ingestion (`POST /v1/traces`), the read API and the dashboard. One Postgres, nothing else.

## Run it

```bash
cp .env.example .env            # DATABASE_URL, DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET
pnpm migrate
pnpm create-project my-project  # prints the API key once
pnpm seed                       # optional: two weeks of simulated runs
pnpm dev                        # http://localhost:3000
```

## Pages

| Path | What it answers |
|---|---|
| `/` | Which agents are regressing? One card per agent: last 24 h, 14-day trend, regressions found. |
| `/agents/:name` | Is it getting worse, and since when? Compare by app version, agent version, prompt version or model — latest vs previous, or any two values (`?dim=prompt&compare=ab&a=v7&b=v8`) — or the last 24 h vs the previous 7 days. Daily trends with deploys marked, tool paths, values table, recent runs. |
| `/runs` | Runs filtered by agent, app version, agent version, prompt version, model, status, or "repeated tool calls only". |
| `/runs/:id` | The run on a timeline, with repeats, retries and failures flagged, and the detail of each step. |
| `/runs/:id/compare` | Two runs aligned step by step, and what changed between them (version, prompt version, model). |
| `/explore` | Drop a trace file and see it — parsed in the browser, nothing is uploaded. |

## API

See [`docs/api-contract.md`](../../docs/api-contract.md). In short:

- `POST /v1/traces` — API key (`Authorization: Bearer tk_live_…`). Optional headers `X-Trajekt-Agent`, `X-Trajekt-App-Version`, `X-Trajekt-Agent-Version`, `X-Trajekt-Prompt-Version`, `X-Trajekt-Environment` are used when the trace carries no identity.
- `GET /api/agents`, `/api/agents/:name/timeseries`, `/versions?dimension=`, `/compare?mode=window|version|ab&dimension=app|agent|prompt|model`
- `GET /api/runs`, `/api/runs/:id`, `/api/alerts`, `/api/stats`
- `POST /api/alerts/check` — `Authorization: Bearer $CRON_SECRET`, for a cron. Posts new regressions to `SLACK_WEBHOOK_URL`.

## How regressions are decided

For each metric (failed runs, failed tool calls, mean duration, cost, steps, tokens, repeated tool calls, runs on a new tool path), the change is flagged only if it is statistically significant (one-sided test, p < 0.01), large enough to matter (+15% on a mean, +3 points on a rate) and measured on at least 20 runs on each side. An alert is sent once per agent and metric every 24 h.

## Tests and previews

```bash
pnpm test        # needs a Postgres reachable with trust auth (TEST_PG_HOST / TEST_PG_PORT / TEST_PG_USER)
pnpm preview     # renders every page with simulated data into ./preview/*.html, without Next.js
```
