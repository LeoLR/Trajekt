'use client';

import { useState } from 'react';

/** Crée un projet et affiche ses clés une seule fois. */
export function NewProjectForm() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ project: { name: string }; ingestKey: string; readKey: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      setCreated(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="panel panel-pad">
        <p style={{ marginTop: 0 }}><strong>{created.project.name}</strong> is created and now open. Copy its keys: they are shown only once.</p>
        <div className="code-label">Ingestion key — send traces (POST /v1/traces, /v1/scores)</div>
        <pre className="code">{created.ingestKey}</pre>
        <div className="code-label" style={{ marginTop: 10 }}>Read key — API, MCP, CI</div>
        <pre className="code">{created.readKey}</pre>
        <a className="btn btn-ghost" style={{ marginTop: 12 }} href="/">Go to the project</a>
      </div>
    );
  }
  return (
    <form className="filters" onSubmit={submit}>
      <label>Name <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="checkout-agents" maxLength={80} required /></label>
      <button className="btn btn-ghost" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
      {error && <span className="alert-err">{error}</span>}
    </form>
  );
}
