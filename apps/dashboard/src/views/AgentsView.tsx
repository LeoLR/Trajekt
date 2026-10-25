import { METRIC_LABELS } from '@trajekt/core';
import type { AgentsPageData, Health } from '../server/pages';
import { Shell, StatusDot } from '../components/ui';
import { Sparkline } from '../components/charts';
import { formatCost, formatDelta, formatDuration, formatMetric, formatPercent, formatRelativeTime } from '../lib/format';

const HEALTH_LABEL: Record<Health, string> = {
  regressed: 'Regressed',
  healthy: 'Healthy',
  insufficient: 'Not enough runs to compare',
  idle: 'No runs in 24 h',
};

export function AgentsView({ data }: { data: AgentsPageData }) {
  const now = new Date(data.now);
  const regressed = data.agents.filter((a) => a.health === 'regressed').length;

  return (
    <Shell active="agents">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Agents</h1>
        </div>
        <div className="row dim">
          {data.agents.length > 0 && (
            regressed > 0
              ? <span className="chip chip-amber">{regressed} agent{regressed > 1 ? 's' : ''} regressed</span>
              : <span className="chip chip-ok">no regression detected</span>
          )}
        </div>
      </div>

      {data.agents.length === 0 ? (data.evals.length === 0 && <EmptyState />) : (
        <div className="grid">
          {data.agents.map(({ agent, health, findings }) => (
            <a key={agent.name} href={`/agents/${encodeURIComponent(agent.name)}`}
              className={`panel agent-card${health === 'regressed' ? ' regressed' : ''}`}>
              <div className="row">
                <StatusDot status={health === 'regressed' ? 'regressed' : health === 'healthy' ? 'ok' : 'idle'} />
                <span className="agent-name">{agent.name}</span>
                {agent.latestVersion && <span className="chip">{agent.latestVersion}</span>}
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 12 }}>{formatRelativeTime(agent.lastSeen, now)}</span>
              </div>
              <div className={health === 'regressed' ? '' : 'faint'} style={{ marginTop: 6, fontSize: 13, color: health === 'regressed' ? 'var(--amber)' : undefined }}>
                {HEALTH_LABEL[health]}
              </div>

              <div className="agent-stats">
                <Stat label="Runs · 24 h" value={String(agent.runs24h)} />
                <Stat label="Failed" value={formatPercent(agent.errorRate24h)} />
                <Stat label="p50 duration" value={formatDuration(agent.p50DurationMs24h)} />
                <Stat label="Mean cost" value={formatCost(agent.avgCostUsd24h)} />
              </div>

              <div className="row" style={{ marginTop: 14, gap: 18 }}>
                <span className="faint" style={{ fontSize: 11.5, width: 64 }}>14 days</span>
                <span className="row" style={{ gap: 6 }}>
                  {/* Le jour en cours est incomplet : l'exclure évite une fausse chute du volume. */}
                  <Sparkline label={`${agent.name} runs per day`} values={agent.daily.slice(0, -1).map((d) => d.runs)} />
                  <span className="faint" style={{ fontSize: 11.5 }}>runs</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <Sparkline label={`${agent.name} mean cost per day`} values={agent.daily.map((d) => d.avgCostUsd)} color={health === 'regressed' ? '#FFB224' : '#A9AFB8'} />
                  <span className="faint" style={{ fontSize: 11.5 }}>cost</span>
                </span>
              </div>

              {findings.length > 0 && (
                <div className="agent-findings">
                  {findings.slice(0, 4).map((f) => (
                    <div className="finding" key={f.metric}>
                      <span className={f.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{formatDelta(f.metric, f.delta, f.relDelta)}</span>
                      <span>{METRIC_LABELS[f.metric]}</span>
                      <span className="mono faint" style={{ fontSize: 12 }}>
                        {formatMetric(f.metric, f.baseline)} → {formatMetric(f.metric, f.current)} · {f.scope}
                      </span>
                    </div>
                  ))}
                  {findings.length > 4 && <div className="faint" style={{ fontSize: 12.5 }}>+{findings.length - 4} more</div>}
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {data.evals.length > 0 && (
        <section className="section">
          <h2>Eval suites</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr><th>Agent</th><th>Latest vs previous</th><th>Result</th><th className="num">Scenarios</th><th>Last run</th></tr>
              </thead>
              <tbody>
                {data.evals.map((e) => (
                  <tr key={e.name} className={e.result === 'fail' ? 'is-regression' : undefined}>
                    <td className="mono"><a href={`/agents/${encodeURIComponent(e.name)}/evals`}>{e.name}</a></td>
                    <td className="mono">{e.b && e.a ? `${e.b} vs ${e.a}` : e.latestVersion ?? '—'}</td>
                    <td>
                      {e.result === 'fail' && <span className="chip chip-err" title={e.reasons.join('\n')}>fail</span>}
                      {e.result === 'pass' && <span className="chip chip-ok">pass</span>}
                      {e.result === null && <span className="faint">one version so far</span>}
                      {e.worse > 0 && <span className="faint" style={{ fontSize: 12.5, marginLeft: 8 }}>{e.worse} scenario{e.worse > 1 ? 's' : ''} worse</span>}
                    </td>
                    <td className="num">{e.scenarios}</td>
                    <td className="faint">{formatRelativeTime(e.lastRun, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.alerts.length > 0 && (
        <section className="section">
          <h2>Recent alerts</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr><th>When</th><th>Agent</th><th>Metric</th><th className="num">Before</th><th className="num">After</th><th>Compared</th></tr>
              </thead>
              <tbody>
                {data.alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="faint">{formatRelativeTime(a.createdAt, now)}</td>
                    <td className="mono"><a href={`/agents/${encodeURIComponent(a.agentName)}`}>{a.agentName}</a></td>
                    <td><span className={a.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{a.severity}</span> {METRIC_LABELS[a.metric]}</td>
                    <td className="num">{formatMetric(a.metric, a.baseline)}</td>
                    <td className="num">{formatMetric(a.metric, a.current)}</td>
                    <td className="faint mono" style={{ fontSize: 12 }}>{a.currentLabel} vs {a.baselineLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="agent-stat-label">{label}</div>
      <div className="agent-stat-value">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel empty">
      <h2 style={{ marginBottom: 6 }}>No runs recorded yet</h2>
      <p style={{ margin: 0 }}>Point any OpenTelemetry exporter at this instance, or send a Langfuse export.</p>
      <pre className="code">{`OTEL_EXPORTER_OTLP_ENDPOINT=<this instance URL>
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."`}</pre>
    </div>
  );
}
