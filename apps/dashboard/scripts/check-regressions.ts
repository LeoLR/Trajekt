// pnpm check-regressions — même chose que POST /api/alerts/check, depuis un cron système :
// détection sur tous les projets, notification Slack, purge (TRAJEKT_RETENTION_DAYS).
import 'dotenv/config';
import { getDb } from '../src/server/db';
import { runMaintenance } from '../src/server/maintenance';

const r = await runMaintenance(getDb(), { webhook: process.env.SLACK_WEBHOOK_URL, publicUrl: process.env.TRAJEKT_PUBLIC_URL });
console.log(`${r.projects} project(s), ${r.agentsChecked} agent(s) checked, ${r.regressions} regression(s), ${r.alertsCreated} new alert(s), ${r.suppressedByCooldown} under cooldown, ${r.purgedRuns} old run(s) purged.`);
for (const a of r.newAlerts) console.log(`  ${a.project} / ${a.agent}: ${a.metric} (${a.severity})`);
process.exit(0);
