import { useState, type ReactNode } from 'react';

export const REPO_URL = 'https://github.com/LeoLR/trajekt';
export const DOCS_URL = '/docs/';
export const QUICKSTART_URL = '/docs/#quickstart';
export const DEMO_URL = 'https://trajekt-demo.vercel.app';
export const CHANGELOG_URL = `${REPO_URL}/commits/main`;
export const LICENSE = 'MIT';

export function Logo() {
  return (
    <span className="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFB224" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d="M3 15h18" />
        <path d="M14 8l7 7" />
      </svg>
      Trajekt
    </span>
  );
}

export function Hatch({ w = 22, h = 8 }: { w?: number; h?: number }) {
  return <span className="hatch" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Bouton copier, réutilisé par la commande du hero et les blocs de code. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <button type="button" className="copy" onClick={copy} aria-label={copied ? 'Copied' : label}>
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </>
  );
}

/** En-tête commun. Sur la page de doc, les ancres de la landing pointent vers "/". */
export function Header({ page }: { page: 'home' | 'docs' }) {
  const [open, setOpen] = useState(false);
  const home = page === 'home' ? '' : '/';
  const links: Array<[string, string, boolean]> = [
    [`${home}#how`, 'How it works', false],
    [`${home}#try`, 'Try it', false],
    [DEMO_URL, 'Live demo', false],
    [DOCS_URL, 'Docs', page === 'docs'],
    [REPO_URL, 'GitHub', false],
  ];
  const close = () => setOpen(false);
  return (
    <header className="header">
      <div className="container header-inner">
        <a href="/" aria-label="Trajekt home"><Logo /></a>
        <nav className="header-nav" aria-label="Main">
          {links.map(([href, label, current]) => (
            <a key={label} href={href} aria-current={current ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
        <a className="btn btn-amber header-cta" href={QUICKSTART_URL}>Get started</a>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <nav id="mobile-menu" className="mobile-menu" aria-label="Main (mobile)" hidden={!open}>
        <div className="container">
          {links.map(([href, label, current]) => (
            <a key={label} href={href} onClick={close} aria-current={current ? 'page' : undefined}>{label}</a>
          ))}
          <a className="btn btn-amber" href={QUICKSTART_URL} onClick={close}>Get started</a>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-left">
          <Logo />
          <span className="muted">{LICENSE} license · © {year}</span>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          <a href={DOCS_URL}>Docs</a>
          <a href={DEMO_URL}>Live demo</a>
          <a href={REPO_URL}>GitHub</a>
          <a href={CHANGELOG_URL}>Changelog</a>
        </nav>
      </div>
    </footer>
  );
}

export function Page({ page, children }: { page: 'home' | 'docs'; children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header page={page} />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
