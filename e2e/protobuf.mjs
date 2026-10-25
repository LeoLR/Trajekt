// Encodeur OTLP protobuf minimal (JSON OTLP → ExportTraceServiceRequest), pour les tests.
class W {
  out = [];
  varint(v) { let x = BigInt.asUintN(64, BigInt(v)); do { let b = Number(x & 0x7fn); x >>= 7n; if (x) b |= 0x80; this.out.push(b); } while (x); }
  tag(f, w) { this.varint((f << 3) | w); }
  bytes(f, b) { this.tag(f, 2); this.varint(b.length); this.out.push(...b); }
  str(f, s) { this.bytes(f, [...new TextEncoder().encode(s)]); }
  msg(f, w) { this.bytes(f, w.out); }
  fixed64(f, v) { this.tag(f, 1); const x = BigInt(v); for (let i = 0; i < 8; i++) this.out.push(Number((x >> BigInt(8 * i)) & 0xffn)); }
  double(f, v) { this.tag(f, 1); const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); this.out.push(...b); }
  uint(f, v) { this.tag(f, 0); this.varint(v); }
}
const hexBytes = (h) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
function anyValue(v) {
  const w = new W();
  if ('stringValue' in v) w.str(1, v.stringValue);
  else if ('boolValue' in v) w.uint(2, v.boolValue ? 1 : 0);
  else if ('intValue' in v) w.uint(3, BigInt(v.intValue));
  else if ('doubleValue' in v) w.double(4, v.doubleValue);
  return w;
}
function kv(a) { const w = new W(); w.str(1, a.key); w.msg(2, anyValue(a.value)); return w; }
export function encodeOtlp(json) {
  const req = new W();
  for (const rs of json.resourceSpans) {
    const r = new W();
    const res = new W(); for (const a of rs.resource?.attributes ?? []) res.msg(1, kv(a)); r.msg(1, res);
    for (const ss of rs.scopeSpans) {
      const sw = new W();
      for (const sp of ss.spans) {
        const s = new W();
        s.bytes(1, hexBytes(sp.traceId)); s.bytes(2, hexBytes(sp.spanId));
        if (sp.parentSpanId) s.bytes(4, hexBytes(sp.parentSpanId));
        s.str(5, sp.name);
        s.fixed64(7, sp.startTimeUnixNano); s.fixed64(8, sp.endTimeUnixNano);
        for (const a of sp.attributes ?? []) s.msg(9, kv(a));
        const st = new W(); if (sp.status?.message) st.str(2, sp.status.message); st.uint(3, sp.status?.code ?? 0); s.msg(15, st);
        sw.msg(2, s);
      }
      r.msg(2, sw);
    }
    req.msg(1, r);
  }
  return Uint8Array.from(req.out);
}
