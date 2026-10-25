import type { AgentsPageData, Health } from '../server/pages';
import { Shell, StatusDot } from '../components/ui';
import { Sparkline } from '../components/charts';
import { formatCost, formatDelta, formatDuration, formatMetric, formatPercent } from '../lib/format';
import { coreText, metricName, relativeTime as formatRelativeTime, scopeText, tr } from '../lib/i18n';

const HEALTH_LABEL = (): Record<Health, string> => ({
  regressed: tr('Regressed', 'En régression'),
  healthy: tr('Healthy', 'En bonne santé'),
  insufficient: tr('Not enough runs to compare', 'Pas assez de runs pour comparer'),
  idle: tr('No runs in 24 h', 'Aucun run en 24 h'),
});

export function AgentsView({ data }: { data: AgentsPageData }) {
  const now = new Date(data.now);
  const regressed = data.agents.filter((a) => a.health === 'regressed').length;

  return (
    <Shell active="agents">
      <div className="page-head">
        <div>
          <div className="eyebrow">{tr('Overview', 'Vue d’ensemble')}</div>
          <h1>Agents</h1>
        </div>
        <div className="row dim">
          {data.agents.length > 0 && (
            regressed > 0
              ? <span className="chip chip-amber">{regressed} agent{regressed > 1 ? 's' : ''} {tr('regressed', regressed > 1 ? 'en régression' : 'en régression')}</span>
              : <span className="chip chip-ok">{tr('no regression detected', 'aucune régression détectée')}</span>
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
                {HEALTH_LABEL()[health]}
              </div>

              <div className="agent-stats">
                <Stat label={tr('Runs · 24 h', 'Runs · 24 h')} value={String(agent.runs24h)} />
                <Stat label={tr('Failed', 'En échec')} value={formatPercent(agent.errorRate24h)} />
                <Stat label={tr('p50 duration', 'Durée p50')} value={formatDuration(agent.p50DurationMs24h)} />
                <Stat label={tr('Mean cost', 'Coût moyen')} value={formatCost(agent.avgCostUsd24h)} />
              </div>

              <div className="row" style={{ marginTop: 14, gap: 18 }}>
                <span className="faint" style={{ fontSize: 11.5, width: 64 }}>{tr('14 days', '14 jours')}</span>
                <span className="row" style={{ gap: 6 }}>
                  {/* Le jour en cours est incomplet : l'exclure évite une fausse chute du volume. */}
                  <Sparkline label={tr(`${agent.name} runs per day`, `${agent.name} : runs par jour`)} values={agent.daily.slice(0, -1).map((d) => d.runs)} />
                  <span className="faint" style={{ fontSize: 11.5 }}>runs</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <Sparkline label={tr(`${agent.name} mean cost per day`, `${agent.name} : coût moyen par jour`)} values={agent.daily.map((d) => d.avgCostUsd)} color={health === 'regressed' ? '#FFB224' : '#A9AFB8'} />
                  <span className="faint" style={{ fontSize: 11.5 }}>{tr('cost', 'coût')}</span>
                </span>
              </div>

              {findings.length > 0 && (
                <div className="agent-findings">
                  {findings.slice(0, 4).map((f) => (
                    <div className="finding" key={f.metric}>
                      <span className={f.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{formatDelta(f.metric, f.delta, f.relDelta)}</span>
                      <span>{metricName(f.metric)}</span>
                      <span className="mono faint" style={{ fontSize: 12 }}>
                        {formatMetric(f.metric, f.baseline)} → {formatMetric(f.metric, f.current)} · {scopeText(f.scope)}
                      </span>
                    </div>
                  ))}
                  {findings.length > 4 && <div className="faint" style={{ fontSize: 12.5 }}>+{findings.length - 4} {tr('more', 'autres')}</div>}
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {data.evals.length > 0 && (
        <section className="section">
          <h2>{tr('Eval suites', 'Suites d’évaluation')}</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr><th>Agent</th><th>{tr('Latest vs previous', 'Dernière vs précédente')}</th><th>{tr('Result', 'Résultat')}</th><th className="num">{tr('Scenarios', 'Scénarios')}</th><th>{tr('Last run', 'Dernier run')}</th></tr>
              </thead>
              <tbody>
                {data.evals.map((e) => (
                  <tr key={e.name} className={e.result === 'fail' ? 'is-regression' : undefined}>
                    <td className="mono"><a href={`/agents/${encodeURIComponent(e.name)}/evals`}>{e.name}</a></td>
                    <td className="mono">{e.b && e.a ? `${e.b} vs ${e.a}` : e.latestVersion ?? '—'}</td>
                    <td>
                      {e.result === 'fail' && <span className="chip chip-err" title={e.reasons.map((r) => coreText(r)).join('\n')}>fail</span>}
                      {e.result === 'pass' && <span className="chip chip-ok">pass</span>}
                      {e.result === null && <span className="faint">{tr('one version so far', 'une seule version pour l’instant')}</span>}
                      {e.worse > 0 && <span className="faint" style={{ fontSize: 12.5, marginLeft: 8 }}>{e.worse} {tr(`scenario${e.worse > 1 ? 's' : ''} worse`, `scénario${e.worse > 1 ? 's' : ''} dégradé${e.worse > 1 ? 's' : ''}`)}</span>}
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
          <h2>{tr('Recent alerts', 'Alertes récentes')}</h2>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr><th>{tr('When', 'Quand')}</th><th>Agent</th><th>{tr('Metric', 'Métrique')}</th><th className="num">{tr('Before', 'Avant')}</th><th className="num">{tr('After', 'Après')}</th><th>{tr('Compared', 'Comparé')}</th></tr>
              </thead>
              <tbody>
                {data.alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="faint">{formatRelativeTime(a.createdAt, now)}</td>
                    <td className="mono"><a href={`/agents/${encodeURIComponent(a.agentName)}`}>{a.agentName}</a></td>
                    <td><span className={a.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{a.severity === 'critical' ? tr('critical', 'critique') : tr('warning', 'alerte')}</span> {metricName(a.metric)}</td>
                    <td className="num">{formatMetric(a.metric, a.baseline)}</td>
                    <td className="num">{formatMetric(a.metric, a.current)}</td>
                    <td className="faint mono" style={{ fontSize: 12 }}>{scopeText(`${a.currentLabel} vs ${a.baselineLabel}`)}</td>
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
      <h2 style={{ marginBottom: 6 }}>{tr('No runs recorded yet', 'Aucun run enregistré pour l’instant')}</h2>
      <p style={{ margin: 0 }}>{tr('Point any OpenTelemetry exporter at this instance, or send a Langfuse export.', 'Pointez n’importe quel exporteur OpenTelemetry vers cette instance, ou envoyez un export Langfuse.')}</p>
      <pre className="code">{`OTEL_EXPORTER_OTLP_ENDPOINT=${tr('<this instance URL>', '<URL de cette instance>')}
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer tk_live_..."`}</pre>
    </div>
  );
}
