import { LogoMark } from '../components/ui';

export function LoginView({ error, next, configured }: { error: boolean; next: string; configured: boolean }) {
  return (
    <main className="center">
      <div className="login panel panel-pad">
        <div className="logo" style={{ fontSize: 18 }}><LogoMark size={22} />Trajekt</div>
        <p className="dim" style={{ margin: '8px 0 0' }}>The flight recorder for AI agents.</p>
        {!configured ? (
          <div className="alert-err" style={{ marginTop: 20 }}>
            Sign-in is disabled: set <span className="mono">DASHBOARD_PASSWORD</span> and <span className="mono">DASHBOARD_SESSION_SECRET</span>.
          </div>
        ) : (
          <form method="post" action="/api/session">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="password" className="faint" style={{ fontSize: 13 }}>Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            {error && <div className="alert-err" role="alert">Wrong password.</div>}
            <button className="btn btn-amber" type="submit">Sign in</button>
          </form>
        )}
      </div>
    </main>
  );
}
