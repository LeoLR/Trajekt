import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedactor, redactTrajectory, normalize, computeMetrics } from '../src/index.js';
import { otlpPayload, otlpSpan } from './fixtures.js';

test('masquage : emails, IBAN, cartes (Luhn), téléphones, secrets, motifs maison', () => {
  const r = createRedactor({ builtIn: ['email', 'iban', 'card', 'phone', 'secrets'], patterns: [{ name: 'customer', pattern: 'CUST-\\d{6}' }] });
  const text = [
    'Contact jean.dupont@example.fr about CUST-004211,',
    'IBAN FR76 3000 6000 0112 3456 7890 189, card 4111 1111 1111 1111,',
    'not a card 1234 5678 9012 3456, call +33 6 12 34 56 78 or 06 12 34 56 78,',
    'key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv, header Bearer abcdefghijklmnop12345,',
    'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  ].join(' ');
  const out = r(text) as string;
  assert.match(out, /Contact \[email\] about \[customer\],/);
  assert.match(out, /IBAN \[iban\], card \[card\],/);
  assert.match(out, /not a card 1234 5678 9012 3456/, 'Luhn invalide : laissé tel quel');
  assert.match(out, /call \[phone\] or \[phone\],/);
  assert.match(out, /key \[secret\], header Bearer \[secret\],/);
  assert.match(out, /jwt \[jwt\]/);
});

test('masquage : par clé, dans les objets, le JSON sérialisé et les attributs OTLP ; défaut = secrets seulement', () => {
  const r = createRedactor();
  const out = r({
    args: { user: 'a@b.co', password: 'hunter2', nested: { Authorization: 'Basic xyz' } },
    serialized: '{"api_key":"abc","q":"refund"}',
    attributes: [{ key: 'authorization', value: { stringValue: 'Bearer abcdefghijklmnop12345' } }],
    startTimeUnixNano: '1792913502338705000',
  }) as any;
  assert.equal(out.args.user, 'a@b.co', 'emails non masqués par défaut');
  assert.equal(out.args.password, '[redacted]');
  assert.equal(out.args.nested.Authorization, '[redacted]');
  assert.deepEqual(JSON.parse(out.serialized), { api_key: '[redacted]', q: 'refund' });
  assert.deepEqual(out.attributes[0].value, { stringValue: '[redacted]' });
  assert.equal(out.startTimeUnixNano, '1792913502338705000', 'horodatage intact');
});

test('masquage d’une trajectoire : déterministe, les répétitions restent détectées', () => {
  const tool = (id: string, email: string, start: number) => otlpSpan('rd', {
    spanId: id, name: 'execute_tool', startMs: start, endMs: start + 5,
    attrs: { 'gen_ai.tool.name': { stringValue: 'crm.findCustomer' }, 'gen_ai.tool.call.arguments': { stringValue: JSON.stringify({ email }) } },
  });
  const t = normalize(otlpPayload([tool('a', 'jean@ex.fr', 0), tool('b', 'jean@ex.fr', 10)]));
  const red = redactTrajectory(t, { builtIn: ['email', 'secrets'] });
  assert.deepEqual((red.steps[0] as any).args, { email: '[email]' });
  assert.ok(!JSON.stringify(red).includes('jean@ex.fr'), 'plus aucune trace, payload d’origine compris');
  assert.equal(computeMetrics(red).redundantToolCalls, 1);
  assert.equal(red.steps[0].timestamp, t.steps[0].timestamp);
});
