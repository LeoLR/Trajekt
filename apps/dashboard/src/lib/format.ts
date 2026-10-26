/** Mise en forme partagée par l'interface et les alertes Slack. */

import type { AnyMetricKey, TrajectoryStep } from '@trajekt-ai/core';

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

export function formatCost(usd: number | null | undefined, estimated = false): string {
  if (usd == null) return '—';
  const v = usd === 0 ? '$0' : usd < 0.01 ? `$${usd.toFixed(4)}` : usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  return estimated ? `≈${v}` : v;
}

export function formatPercent(r: number | null | undefined, digits = 1): string {
  if (r == null) return '—';
  return `${(r * 100).toFixed(digits)}%`;
}

export function formatNumber(v: number | null | undefined, digits = 1): string {
  if (v == null) return '—';
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

/** Un score de qualité : deux décimales (échelle 0–1 en général). */
export function formatScore(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2);
}

export function formatMetric(metric: AnyMetricKey, v: number | null | undefined): string {
  if (metric.startsWith('score:')) return formatScore(v);
  switch (metric) {
    case 'errorRate':
    case 'toolErrorRate':
    case 'newPathShare':
      return formatPercent(v);
    case 'durationMs':
      return formatDuration(v);
    case 'costUsd':
      return formatCost(v);
    case 'totalTokens':
      return formatNumber(v == null ? v : Math.round(v));
    default:
      return formatNumber(v, 2);
  }
}

/** "+33%" ou "+12 pts" pour un taux. */
export function formatDelta(metric: AnyMetricKey, delta: number | null, relDelta: number | null): string {
  if (delta == null) return '—';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  if (metric.startsWith('score:')) return `${sign}${Math.abs(delta).toFixed(2)}`;
  if (metric === 'errorRate' || metric === 'toolErrorRate' || metric === 'newPathShare') {
    return `${sign}${Math.abs(delta * 100).toFixed(1)} pts`;
  }
  if (relDelta == null) return `${sign}${formatMetric(metric, Math.abs(delta))}`;
  return `${sign}${Math.abs(relDelta * 100).toFixed(0)}%`;
}

export function formatRelativeTime(isoDate: string, now = new Date()): string {
  const diff = now.getTime() - new Date(isoDate).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

/** Libellé court d'un step (nom de l'outil, modèle…). */
export function stepTitle(s: TrajectoryStep): string {
  switch (s.type) {
    case 'llm_call': return s.model ?? 'llm call';
    case 'tool_call': return s.name;
    case 'custom': return s.kind;
    case 'decision': return s.branch;
    case 'user_message': return 'user';
    case 'agent_message': return 'agent';
  }
}
