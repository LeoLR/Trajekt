import { Shell } from '../components/ui';

/** Affiché tant qu'aucun projet n'existe. */
export function SetupView() {
  return (
    <Shell>
      <div className="panel empty">
        <h2 style={{ marginBottom: 6 }}>No project yet</h2>
        <p style={{ margin: 0 }}>Create one to get an ingestion API key:</p>
        <pre className="code">pnpm --filter dashboard create-project my-project</pre>
      </div>
    </Shell>
  );
}
