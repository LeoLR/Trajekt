// pnpm check-regressions — même chose que POST /api/alerts/check, depuis un cron système.
import 'dotenv/config';
import { getDb } from '../src/server/db';
import { getDefaultProject } from '../src/server/auth';
import { checkRegressions, slackNotifier } from '../src/server/alerts';

const db = getDb();
const project = await getDefaultProject(db);
if (!project) throw new Error('No project yet — run pnpm create-project first.');
const webhook = process.env.SLACK_WEBHOOK_URL;
const r = await checkRegressions(db, project.id, {
  notify: webhook ? slackNotifier(webhook, process.env.TRAJEKT_PUBLIC_URL) : undefined,
});
console.log(`${r.agentsChecked} agent(s) checked, ${r.regressions} regression(s), ${r.alertsCreated.length} new alert(s), ${r.suppressedByCooldown} under cooldown.`);
for (const a of r.alertsCreated) console.log(`  ${a.agentName}: ${a.comparison.label} (${a.comparison.severity})`);
process.exit(0);
