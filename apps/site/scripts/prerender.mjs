// Injecte le HTML rendu côté serveur dans dist/index.html : la page est
// lisible (et indexable) sans JavaScript, React ne fait qu'hydrater.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { render } from '../dist-ssr/entry-server.js';

const file = new URL('../dist/index.html', import.meta.url);
const html = await readFile(file, 'utf8');
await writeFile(file, html.replace('<!--app-->', render()));
await rm(new URL('../dist-ssr', import.meta.url), { recursive: true, force: true });
console.log('Prerendered dist/index.html');
