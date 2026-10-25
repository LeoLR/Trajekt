import { createContext, useContext, useState, type ReactNode } from 'react';

export const REPO_URL = 'https://github.com/LeoLR/trajekt';
export const DOCS_URL = '/docs/';
export const QUICKSTART_URL = '/docs/#quickstart';
export const DEMO_URL = 'https://trajekt-demo.vercel.app';
export const CHANGELOG_URL = `${REPO_URL}/commits/main`;
export const LICENSE = 'MIT';

export type Lang = 'en' | 'fr';
const LangContext = createContext<Lang>('en');
/** Langue de la page en cours (fournie par <Page>). */
export const useLang = () => useContext(LangContext);
/** Préfixe des URL du site pour une langue : '' ou '/fr'. */
export const base = (lang: Lang) => (lang === 'fr' ? '/fr' : '');
export const docsUrl = (lang: Lang) => `${base(lang)}/docs/`;
export const quickstartUrl = (lang: Lang) => `${base(lang)}/docs/#quickstart`;

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
  const fr = useLang() === 'fr';
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
      <button type="button" className="copy" onClick={copy} aria-label={copied ? (fr ? 'Copié' : 'Copied') : label}>
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? (fr ? 'Copié dans le presse-papiers' : 'Copied to clipboard') : ''}</span>
    </>
  );
}

/** En-tête commun. Sur la page de doc, les ancres de la landing pointent vers l'accueil. */
export function Header({ page }: { page: 'home' | 'docs' }) {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  const fr = lang === 'fr';
  const homeUrl = `${base(lang)}/`;
  const home = page === 'home' ? '' : homeUrl;
  const links: Array<[string, string, boolean]> = [
    [`${home}#how`, fr ? 'Fonctionnement' : 'How it works', false],
    [`${home}#try`, fr ? 'Essayer' : 'Try it', false],
    [DEMO_URL, fr ? 'Démo' : 'Live demo', false],
    [docsUrl(lang), 'Docs', page === 'docs'],
    [REPO_URL, 'GitHub', false],
  ];
  // Même page dans l'autre langue.
  const other: Lang = fr ? 'en' : 'fr';
  const switchHref = page === 'docs' ? docsUrl(other) : `${base(other)}/`;
  const switchLink = (onClick?: () => void) => (
    <a className="lang-switch mono" href={switchHref} hrefLang={other} lang={other} onClick={onClick}
      aria-label={fr ? 'Read in English' : 'Lire en français'}>{fr ? 'EN' : 'FR'}</a>
  );
  const cta = fr ? 'Commencer' : 'Get started';
  const close = () => setOpen(false);
  return (
    <header className="header">
      <div className="container header-inner">
        <a href={homeUrl} aria-label={fr ? 'Accueil Trajekt' : 'Trajekt home'}><Logo /></a>
        <nav className="header-nav" aria-label={fr ? 'Principal' : 'Main'}>
          {links.map(([href, label, current]) => (
            <a key={label} href={href} aria-current={current ? 'page' : undefined}>{label}</a>
          ))}
          {switchLink()}
        </nav>
        <a className="btn btn-amber header-cta" href={quickstartUrl(lang)}>{cta}</a>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? (fr ? 'Fermer le menu' : 'Close menu') : (fr ? 'Ouvrir le menu' : 'Open menu')}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <nav id="mobile-menu" className="mobile-menu" aria-label={fr ? 'Principal (mobile)' : 'Main (mobile)'} hidden={!open}>
        <div className="container">
          {links.map(([href, label, current]) => (
            <a key={label} href={href} onClick={close} aria-current={current ? 'page' : undefined}>{label}</a>
          ))}
          {switchLink(close)}
          <a className="btn btn-amber" href={quickstartUrl(lang)} onClick={close}>{cta}</a>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  const lang = useLang();
  const fr = lang === 'fr';
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-left">
          <Logo />
          <span className="muted">{fr ? `Licence ${LICENSE}` : `${LICENSE} license`} · © {year}</span>
        </div>
        <nav className="footer-nav" aria-label={fr ? 'Pied de page' : 'Footer'}>
          <a href={docsUrl(lang)}>Docs</a>
          <a href={DEMO_URL}>{fr ? 'Démo' : 'Live demo'}</a>
          <a href={REPO_URL}>GitHub</a>
          <a href={CHANGELOG_URL}>{fr ? 'Historique' : 'Changelog'}</a>
        </nav>
      </div>
    </footer>
  );
}

export function Page({ page, lang = 'en', children }: { page: 'home' | 'docs'; lang?: Lang; children: ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <a className="skip" href="#main">{lang === 'fr' ? 'Aller au contenu' : 'Skip to content'}</a>
      <Header page={page} />
      <main id="main">{children}</main>
      <Footer />
    </LangContext.Provider>
  );
}
