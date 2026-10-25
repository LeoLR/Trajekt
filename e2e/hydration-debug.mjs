// Diagnostic temporaire : visite les pages plusieurs fois (next dev) et
// remonte le texte complet des erreurs d'hydratation en annotations.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const pages = ['/', '/agents/sentry-triage', '/agents/sentry-triage?dim=model&compare=ab', '/agents/sentry-triage/evals', '/runs', '/projects', '/explore'];
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console (${page.url()}): ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror (${page.url()}): ${e.message}`));
await page.goto(BASE + '/login');
await page.fill('input[name="password"]', process.env.DASHBOARD_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(BASE + '/');
for (let round = 0; round < 4; round++) {
  for (const p of pages) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
  }
}
await browser.close();
const unique = [...new Set(errors.map((e) => e.slice(0, 4000)))];
console.log(`${errors.length} errors, ${unique.length} unique`);
for (const e of unique.slice(0, 5)) console.log(`::error title=hydration::${e.replace(/\r?\n/g, '%0A')}`);
