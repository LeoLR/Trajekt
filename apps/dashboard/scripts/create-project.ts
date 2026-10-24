// pnpm create-project "my-project" — crée un projet et affiche sa clé API UNE SEULE FOIS.
import 'dotenv/config';
import { getDb } from '../src/server/db';
import { createProject } from '../src/server/auth';

const name = process.argv[2] ?? 'default';
const { project, apiKey } = await createProject(getDb(), name);
console.log(`Project created: ${project.name} (${project.id})\n`);
console.log('API key — copy it now, it will not be shown again:\n');
console.log(`  ${apiKey}\n`);
console.log('OpenTelemetry exporter:');
console.log('  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3000');
console.log('  OTEL_EXPORTER_OTLP_PROTOCOL=http/json');
console.log(`  OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${apiKey}"`);
process.exit(0);
