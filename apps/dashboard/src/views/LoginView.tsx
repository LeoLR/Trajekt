import { LogoMark, LangSwitch } from '../components/ui';
import { tr } from '../lib/i18n';

export function LoginView({ error, next, configured }: { error: boolean; next: string; configured: boolean }) {
  return (
    <main className="center">
      <div className="login panel panel-pad">
        <div className="logo" style={{ fontSize: 18 }}><LogoMark size={22} />Trajekt</div>
        <p className="dim" style={{ margin: '8px 0 0' }}>{tr('The flight recorder for AI agents.', 'La boîte noire de vos agents IA.')}</p>
        {!configured ? (
          <div className="alert-err" style={{ marginTop: 20 }}>
            {tr('Sign-in is disabled: set', 'Connexion désactivée : définissez')} <span className="mono">DASHBOARD_PASSWORD</span> {tr('and', 'et')} <span className="mono">DASHBOARD_SESSION_SECRET</span>.
          </div>
        ) : (
          <form method="post" action="/api/session">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="password" className="faint" style={{ fontSize: 13 }}>{tr('Password', 'Mot de passe')}</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            {error && <div className="alert-err" role="alert">{tr('Wrong password.', 'Mot de passe incorrect.')}</div>}
            <button className="btn btn-amber" type="submit">{tr('Sign in', 'Se connecter')}</button>
          </form>
        )}
        <div style={{ marginTop: 16, textAlign: 'right' }}><LangSwitch /></div>
      </div>
    </main>
  );
}
