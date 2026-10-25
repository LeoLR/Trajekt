import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeOtlpProtobuf, normalize, computeMetrics } from '../src/index.js';
import { otlpPayload, otlpSpan } from './fixtures.js';

/* Encodeur protobuf minimal, pour les tests : JSON OTLP → binaire. */
class W {
  out: number[] = [];
  varint(v: bigint) { let x = BigInt.asUintN(64, v); do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; this.out.push(b); } while (x); }
  tag(f: number, w: number) { this.varint(BigInt((f << 3) | w)); }
  bytes(f: number, b: Uint8Array | number[]) { this.tag(f, 2); this.varint(BigInt(b.length)); this.out.push(...b); }
  str(f: number, s: string) { this.bytes(f, [...new TextEncoder().encode(s)]); }
  msg(f: number, w: W) { this.bytes(f, w.out); }
  fixed64(f: number, v: bigint) { this.tag(f, 1); for (let i = 0; i < 8; i++) this.out.push(Number((v >> BigInt(8 * i)) & 0xffn)); }
  double(f: number, v: number) { this.tag(f, 1); const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); this.out.push(...b); }
  uint(f: number, v: number | bigint) { this.tag(f, 0); this.varint(BigInt(v)); }
}
const hexBytes = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
function anyValue(v: any): W {
  const w = new W();
  if ('stringValue' in v) w.str(1, v.stringValue);
  else if ('boolValue' in v) w.uint(2, v.boolValue ? 1 : 0);
  else if ('intValue' in v) w.uint(3, BigInt(v.intValue));
  else if ('doubleValue' in v) w.double(4, v.doubleValue);
  else if ('arrayValue' in v) { const a = new W(); for (const x of v.arrayValue.values) a.msg(1, anyValue(x)); w.msg(5, a); }
  return w;
}
function kv(a: any): W { const w = new W(); w.str(1, a.key); w.msg(2, anyValue(a.value)); return w; }
function encode(json: any): Uint8Array {
  const req = new W();
  for (const rs of json.resourceSpans) {
    const r = new W();
    const res = new W(); for (const a of rs.resource?.attributes ?? []) res.msg(1, kv(a)); r.msg(1, res);
    for (const ss of rs.scopeSpans) {
      const sw = new W();
      const sc = new W(); sc.str(1, 'test'); sw.msg(1, sc);
      for (const sp of ss.spans) {
        const s = new W();
        s.bytes(1, hexBytes(sp.traceId.padStart(32, '0'))); s.bytes(2, hexBytes(sp.spanId.padStart(16, '0')));
        if (sp.parentSpanId) s.bytes(4, hexBytes(sp.parentSpanId.padStart(16, '0')));
        s.str(5, sp.name); s.uint(6, 1);
        s.fixed64(7, BigInt(sp.startTimeUnixNano)); s.fixed64(8, BigInt(sp.endTimeUnixNano));
        for (const a of sp.attributes) s.msg(9, kv(a));
        s.uint(10, 0); // champ ignoré
        for (const e of sp.events) { const ew = new W(); ew.str(2, e.name); for (const a of e.attributes) ew.msg(3, kv(a)); s.msg(11, ew); }
        const st = new W(); if (sp.status.message) st.str(2, sp.status.message); st.uint(3, sp.status.code); s.msg(15, st);
        sw.msg(2, s);
      }
      r.msg(2, sw);
    }
    req.msg(1, r);
  }
  return Uint8Array.from(req.out);
}

test('protobuf : même trajectoire que le JSON équivalent', () => {
  const tid = 'aa'.repeat(16);
  const json = otlpPayload([
    otlpSpan(tid, { spanId: '01'.repeat(8), name: 'invoke_agent triage', startMs: 1_700_000_000_000, endMs: 1_700_000_004_000, attrs: { 'gen_ai.agent.name': { stringValue: 'triage' }, 'trajekt.score.correct': { doubleValue: 0.5 } } }),
    otlpSpan(tid, { spanId: '02'.repeat(8), parentSpanId: '01'.repeat(8), name: 'chat', startMs: 1_700_000_000_010, endMs: 1_700_000_001_000, attrs: { 'gen_ai.request.model': { stringValue: 'claude-sonnet-4-5' }, 'gen_ai.usage.input_tokens': { intValue: '1200' }, 'gen_ai.usage.output_tokens': { intValue: '80' } } }),
    otlpSpan(tid, { spanId: '03'.repeat(8), parentSpanId: '01'.repeat(8), name: 'execute_tool', startMs: 1_700_000_001_100, endMs: 1_700_000_001_400, attrs: { 'gen_ai.tool.name': { stringValue: 'jira.createIssue' }, 'gen_ai.tool.call.arguments': { stringValue: '{"project":"PAY"}' } }, error: '429 Too Many Requests', exception: 'rate limited' }),
  ], { 'service.name': 'triage', 'service.version': '2.0.0' });
  const decoded = decodeOtlpProtobuf(encode(json));
  const fromProto = normalize(decoded);
  const fromJson = normalize(json);
  assert.deepEqual(fromProto.metadata, fromJson.metadata);
  assert.deepEqual(computeMetrics(fromProto), computeMetrics(fromJson));
  assert.equal(fromProto.steps.length, 3);
  const tool = fromProto.steps.find((s) => s.type === 'tool_call')!;
  assert.deepEqual((tool as any).args, { project: 'PAY' });
  assert.equal((tool as any).error, '429 Too Many Requests');
  assert.equal(fromProto.metadata.scores?.correct, 0.5);
  assert.equal(fromProto.metadata.appVersion, '2.0.0');
});

test('protobuf : int64 négatifs, tableaux, champs inconnus et données tronquées', () => {
  const w = new W();
  const rs = new W(); const sw = new W(); const s = new W();
  s.bytes(1, hexBytes('ff'.repeat(16))); s.bytes(2, hexBytes('ee'.repeat(8))); s.str(5, 'x');
  s.fixed64(7, 1n); s.fixed64(8, 2n);
  s.msg(9, kv({ key: 'n', value: { intValue: '-5' } }));
  s.msg(9, kv({ key: 'tags', value: { arrayValue: { values: [{ stringValue: 'a' }, { boolValue: true }] } } }));
  s.str(99, 'future field'); // inconnu : ignoré
  sw.msg(2, s); rs.msg(2, sw); w.msg(1, rs);
  const d = decodeOtlpProtobuf(Uint8Array.from(w.out)) as any;
  const attrs = d.resourceSpans[0].scopeSpans[0].spans[0].attributes;
  assert.deepEqual(attrs[0], { key: 'n', value: { intValue: '-5' } });
  assert.deepEqual(attrs[1].value.arrayValue.values, [{ stringValue: 'a' }, { boolValue: true }]);
  assert.equal(d.resourceSpans[0].scopeSpans[0].spans[0].traceId, 'ff'.repeat(16));
  assert.throws(() => decodeOtlpProtobuf(Uint8Array.from(w.out.slice(0, w.out.length - 3))), /Truncated/);
});

test('OpenInference (LangChain, LlamaIndex…) et OpenLLMetry sont compris', () => {
  const tid = 'oi';
  const t = normalize(otlpPayload([
    otlpSpan(tid, { spanId: 'a', name: 'SupportAgent', startMs: 0, endMs: 100, attrs: { 'openinference.span.kind': { stringValue: 'AGENT' } } }),
    otlpSpan(tid, { spanId: 'b', parentSpanId: 'a', name: 'ChatOpenAI', startMs: 1, endMs: 40, attrs: {
      'openinference.span.kind': { stringValue: 'LLM' }, 'llm.model_name': { stringValue: 'gpt-4o-mini' },
      'llm.token_count.prompt': { intValue: '900' }, 'llm.token_count.completion': { intValue: '60' },
      'llm.input_messages.0.message.role': { stringValue: 'system' }, 'llm.input_messages.0.message.content': { stringValue: 'You are support.' },
      'llm.input_messages.1.message.role': { stringValue: 'user' }, 'llm.input_messages.1.message.content': { stringValue: 'Where is my order?' },
      'llm.output_messages.0.message.role': { stringValue: 'assistant' }, 'llm.output_messages.0.message.content': { stringValue: 'Checking.' },
    } }),
    otlpSpan(tid, { spanId: 'c', parentSpanId: 'a', name: 'orders_lookup', startMs: 41, endMs: 60, attrs: {
      'openinference.span.kind': { stringValue: 'TOOL' }, 'tool.name': { stringValue: 'orders_lookup' },
      'input.value': { stringValue: '{"order_id": 42}' }, 'output.value': { stringValue: '{"status":"shipped"}' },
    } }),
    otlpSpan(tid, { spanId: 'd', parentSpanId: 'a', name: 'send_email.tool', startMs: 61, endMs: 70, attrs: {
      'traceloop.span.kind': { stringValue: 'tool' }, 'traceloop.entity.name': { stringValue: 'send_email' }, 'traceloop.entity.input': { stringValue: '{"to":"a@b.c"}' },
    } }),
  ], { 'service.name': 'unknown_service:python' }));
  assert.equal(t.metadata.agentName, 'SupportAgent');
  const llm = t.steps.find((s) => s.type === 'llm_call') as any;
  assert.equal(llm.model, 'gpt-4o-mini');
  assert.deepEqual(llm.usage, { inputTokens: 900, outputTokens: 60 });
  assert.deepEqual(llm.input.map((m: any) => m.role), ['system', 'user']);
  assert.equal(llm.output.content, 'Checking.');
  const tools = t.steps.filter((s) => s.type === 'tool_call') as any[];
  assert.deepEqual(tools.map((x) => [x.name, x.args]), [['orders_lookup', { order_id: 42 }], ['send_email', { to: 'a@b.c' }]]);
  assert.deepEqual(tools[0].result, { status: 'shipped' });
  assert.ok((computeMetrics(t).costUsd ?? 0) > 0, 'coût estimé depuis les tokens');
});
