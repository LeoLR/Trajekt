/** Petits composants partagés, sans état (rendables côté serveur). */

import type { ReactNode } from 'react';
import { isDemo } from '../lib/demo';
import type { Comparison } from '@trajekt/core';
import { coreText, getLang, type Lang } from '../lib/i18n';

/** Lien vers l'autre langue (cookie posé par /api/lang, retour sur la page). */
export function LangSwitch({ lang = getLang() }: { lang?: Lang }) {
  const other: Lang = lang === 'fr' ? 'en' : 'fr';
  return (
    <a className="lang-switch mono" href={`/api/lang?to=${other}`} hrefLang={other} lang={other}
      aria-label={other === 'fr' ? 'Afficher en français' : 'Switch to English'}>{other.toUpperCase()}</a>
  );
}

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

export function Shell({ active, lang: langProp, children }: { active?: 'agents' | 'runs' | 'explore' | 'projects'; lang?: Lang; children: ReactNode }) {
  // Les vues client (ExploreView) passent la langue ; les vues serveur la lisent de la requête.
  const lang = langProp ?? getLang();
  const fr = lang === 'fr';
  const nav: Array<[typeof active, string, string]> = [
    ['agents', '/', 'Agents'],
    ['runs', '/runs', 'Runs'],
    ['explore', '/explore', fr ? 'Ouvrir une trace' : 'Open a trace'],
    ...(isDemo() ? [] : [['projects', '/projects', fr ? 'Projets' : 'Projects'] as [typeof active, string, string]]),
  ];
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <a href="/" aria-label={fr ? 'Accueil Trajekt' : 'Trajekt home'}><Logo /></a>
          <nav className="nav" aria-label={fr ? 'Principal' : 'Main'}>
            {nav.map(([key, href, label]) => (
              <a key={href} href={href} aria-current={active === key ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
          <LangSwitch lang={lang} />
          {isDemo() ? (
            <a className="signout" href={fr ? 'https://trajekt-eight.vercel.app/fr/docs/#quickstart' : 'https://trajekt-eight.vercel.app/docs/#quickstart'}>{fr ? 'L’auto-héberger' : 'Self-host it'}</a>
          ) : (
            <form action="/logout" method="post">
              <button className="signout" type="submit">{fr ? 'Déconnexion' : 'Sign out'}</button>
            </form>
          )}
        </div>
      </header>
      {isDemo() && (
        <div className="demo-banner" role="note">
          <span className="demo-hatch" aria-hidden="true" />
          {fr
            ? <span><strong>Démo</strong> — traces simulées de deux agents. <code className="mono">sentry-triage</code> a régressé à la sortie de l’agent 1.5.0 et du prompt v8 ; <code className="mono">support-bot</code> va bien. Lecture seule.</span>
            : <span><strong>Live demo</strong> — simulated traces from two agents. <code className="mono">sentry-triage</code> regressed when agent 1.5.0 and prompt v8 shipped; <code className="mono">support-bot</code> is healthy. Read-only.</span>}
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
    : <span className="chip chip-err"><StatusDot status="error" />{getLang() === 'fr' ? 'échec' : 'failed'}</span>;
}

export function VerdictChip({ c }: { c: Comparison }) {
  const fr = getLang() === 'fr';
  if (c.verdict === 'regression') {
    return <span className={c.severity === 'critical' ? 'chip chip-err' : 'chip chip-amber'}>{c.severity === 'critical' ? (fr ? 'critique' : 'critical') : (fr ? 'régression' : 'regression')}</span>;
  }
  if (c.verdict === 'improvement') return <span className="chip chip-ok">{fr ? 'mieux' : 'better'}</span>;
  if (c.verdict === 'insufficient') return <span className="chip" title={coreText(c.detail)}>{fr ? 'pas assez de données' : 'not enough data'}</span>;
  return <span className="chip" title={coreText(c.detail)}>stable</span>;
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
