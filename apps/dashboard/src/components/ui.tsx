/** Petits composants partagés, sans état (rendables côté serveur). */

import type { ReactNode } from 'react';
import { isDemo } from '../lib/demo';
import type { Comparison } from '@trajekt/core';

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFB224" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M3 15h18" />
      <path d="M14 8l7 7" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-word">Trajekt</span>
    </span>
  );
}

export function Shell({ active, children }: { active?: 'agents' | 'runs' | 'explore' | 'projects'; children: ReactNode }) {
  const nav: Array<[typeof active, string, string]> = [
    ['agents', '/', 'Agents'],
    ['runs', '/runs', 'Runs'],
    ['explore', '/explore', 'Open a trace'],
    ...(isDemo() ? [] : [['projects', '/projects', 'Projects'] as [typeof active, string, string]]),
  ];
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <a href="/" aria-label="Trajekt home"><Logo /></a>
          <nav className="nav" aria-label="Main">
            {nav.map(([key, href, label]) => (
              <a key={href} href={href} aria-current={active === key ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
          {isDemo() ? (
            <a className="signout" href="https://trajekt-eight.vercel.app/docs/#quickstart">Self-host it</a>
          ) : (
            <form action="/logout" method="post">
              <button className="signout" type="submit">Sign out</button>
            </form>
          )}
        </div>
      </header>
      {isDemo() && (
        <div className="demo-banner" role="note">
          <span className="demo-hatch" aria-hidden="true" />
          <span><strong>Live demo</strong> — simulated traces from two agents. <code className="mono">sentry-triage</code> regressed when agent 1.5.0 and prompt v8 shipped; <code className="mono">support-bot</code> is healthy. Read-only.</span>
        </div>
      )}
      <main className="page">{children}</main>
    </>
  );
}

export function StatusDot({ status }: { status: 'ok' | 'error' | 'regressed' | 'idle' }) {
  const cls = { ok: 'dot-ok', error: 'dot-err', regressed: 'dot-amber', idle: 'dot-idle' }[status];
  return <span className={`dot ${cls}`} aria-hidden="true" />;
}

export function RunStatus({ status }: { status: 'ok' | 'error' }) {
  return status === 'ok'
    ? <span className="chip chip-ok"><StatusDot status="ok" />ok</span>
    : <span className="chip chip-err"><StatusDot status="error" />failed</span>;
}

export function VerdictChip({ c }: { c: Comparison }) {
  if (c.verdict === 'regression') {
    return <span className={c.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{c.severity === 'critical' ? 'critical' : 'regression'}</span>;
  }
  if (c.verdict === 'improvement') return <span className="chip chip-ok">better</span>;
  if (c.verdict === 'insufficient') return <span className="chip" title={c.detail}>not enough data</span>;
  return <span className="chip" title={c.detail}>stable</span>;
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub !== undefined && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Hatch({ width = 28, height = 10 }: { width?: number; height?: number }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width, height, background: 'var(--hatch)', borderRadius: 2 }} />;
}
