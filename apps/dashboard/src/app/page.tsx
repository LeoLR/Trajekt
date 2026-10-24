export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h1>trajekt</h1>
      <p style={{ color: '#7E8494' }}>
        Phase 1 — l'API d'ingestion et de lecture est en place.
        Le dashboard (liste des runs + visualiseur) arrive en phase 2.
      </p>
      <p style={{ color: '#7E8494', fontSize: 13 }}>
        Endpoints disponibles : <code>POST /v1/traces</code>,{' '}
        <code>GET /api/trajectories</code>, <code>GET /api/trajectories/:id</code>,{' '}
        <code>GET /api/stats</code>.
      </p>
    </main>
  );
}
