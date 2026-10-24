/**
 * Rend les vues du dashboard en HTML statique avec des données simulées,
 * sans lancer Next.js — pour les captures d'écran de la doc et pour
 * vérifier l'interface en CI.
 *
 *   TEST_PG_PORT=5432 tsx --tsconfig tsconfig.test.json scripts/preview.tsx out/
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { freshDb } from '../test/setup';
import { createProject } from '../src/server/auth';
import { ingestPayload } from '../src/server/ingest';
import { simulateTraffic } from '../src/server/simulate';
import { checkRegressions } from '../src/server/alerts';
import { listRuns } from '../src/server/queries';
import { loadAgentPage, loadAgentsPage, loadRunPage, loadRunsPage } from '../src/server/pages';
import { AgentsView } from '../src/views/AgentsView';
import { AgentView } from '../src/views/AgentView';
import { RunsView } from '../src/views/RunsView';
import { RunView } from '../src/views/RunView';
import { LoginView } from '../src/views/LoginView';

const out = process.argv[2] ?? 'preview';
const now = new Date();

async function main() {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'app', 'globals.css'), 'utf8');
  const page = (el: ReactElement) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${renderToStaticMarkup(el)}</body></html>`;

  const ctx = await freshDb();
  try {
    const { project } = await createProject(ctx.db, 'demo');
    for (const p of simulateTraffic(now.getTime(), { days: 14, runsPerDay: 40, deployDaysAgo: 2 })) {
      await ingestPayload(ctx.db, project.id, p.payload);
    }
    await checkRegressions(ctx.db, project.id, { now });

    await mkdir(out, { recursive: true });
    const write = (name: string, el: ReactElement) => writeFile(path.join(out, `${name}.html`), page(el));

    await write('agents', <AgentsView data={await loadAgentsPage(ctx.db, project.id, now)} />);
    await write('agent', <AgentView data={(await loadAgentPage(ctx.db, project.id, 'sentry-triage', { now }))!} />);
    await write('agent-window', <AgentView data={(await loadAgentPage(ctx.db, project.id, 'sentry-triage', { now, mode: 'window' }))!} />);
    await write('agent-healthy', <AgentView data={(await loadAgentPage(ctx.db, project.id, 'support-bot', { now }))!} />);
    await write('runs', <RunsView data={await loadRunsPage(ctx.db, project.id, { agent: 'sentry-triage' })} now={now.toISOString()} nextHref="/runs?cursor=x" />);

    // Le run le plus parlant : boucle + retry, de la v1.5.0.
    const loops = await listRuns(ctx.db, project.id, { agent: 'sentry-triage', version: '1.5.0', loopsOnly: true, limit: 200 });
    const best = [...loops.items].sort((a, b) => (b.redundantToolCalls + b.retryCount + (b.status === 'error' ? 2 : 0)) - (a.redundantToolCalls + a.retryCount + (a.status === 'error' ? 2 : 0)))[0];
    await write('run', <RunView data={(await loadRunPage(ctx.db, project.id, best.id))!} />);
    const healthy = (await listRuns(ctx.db, project.id, { agent: 'support-bot', limit: 1 })).items[0];
    await write('run-langfuse', <RunView data={(await loadRunPage(ctx.db, project.id, healthy.id))!} />);
    await write('login', <LoginView error={true} next="/" configured={true} />);
    console.log(`preview written to ${out}/`);
  } finally {
    await ctx.drop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
