// Injecte le HTML rendu côté serveur dans chaque page de dist/ : les pages
// sont lisibles (et indexables) sans JavaScript, React ne fait qu'hydrater.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { render } from '../dist-ssr/entry-server.js';

const pages = [
  ['home', '../dist/index.html'],
  ['docs', '../dist/docs/index.html'],
  ['fr-home', '../dist/fr/index.html'],
  ['fr-docs', '../dist/fr/docs/index.html'],
];
for (const [page, path] of pages) {
  const file = new URL(path, import.meta.url);
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('<!--app-->', render(page)));
  console.log(`Prerendered ${path.replace('../', '')}`);
}
await rm(new URL('../dist-ssr', import.meta.url), { recursive: true, force: true });
