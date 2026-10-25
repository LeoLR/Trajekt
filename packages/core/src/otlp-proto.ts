/**
 * trajekt/core — Décodage OTLP protobuf (ExportTraceServiceRequest).
 *
 * Plusieurs SDK OpenTelemetry (Python, Java, Go…) exportent en protobuf
 * par défaut. Ce décodeur, sans dépendance et utilisable dans le
 * navigateur, convertit le binaire vers la forme OTLP/JSON officielle :
 * le reste de la librairie n'a qu'un format à connaître.
 *
 * Seuls les champs utiles aux traces sont lus ; les champs inconnus sont
 * sautés, comme le veut protobuf (compatibilité avec les versions futures).
 */

class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array, readonly end = buf.length) {}

  done(): boolean {
    return this.pos >= this.end;
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (this.pos >= this.end) throw new Error('Truncated protobuf varint');
      const b = this.buf[this.pos++];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 70n) throw new Error('Invalid protobuf varint');
    }
  }

  uint32(): number {
    return Number(this.varint() & 0xffffffffn);
  }

  fixed64(): bigint {
    if (this.pos + 8 > this.end) throw new Error('Truncated protobuf fixed64');
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return view.getBigUint64(0, true);
  }

  double(): number {
    if (this.pos + 8 > this.end) throw new Error('Truncated protobuf double');
    const view = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return view.getFloat64(0, true);
  }

  bytes(): Uint8Array {
    const len = this.uint32();
    if (this.pos + len > this.end) throw new Error('Truncated protobuf bytes');
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  sub(): Reader {
    const len = this.uint32();
    if (this.pos + len > this.end) throw new Error('Truncated protobuf message');
    const r = new Reader(this.buf, this.pos + len);
    r.pos = this.pos;
    this.pos += len;
    return r;
  }

  string(): string {
    return utf8.decode(this.bytes());
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0: this.varint(); return;
      case 1: this.pos += 8; return;
      case 2: {
        const len = this.uint32(); // lire la longueur avant de déplacer pos
        this.pos += len;
        return;
      }
      case 5: this.pos += 4; return;
      default: throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }

  /** Itère sur les champs : (numéro, type de fil). */
  *fields(): Generator<[number, number]> {
    while (!this.done()) {
      const tag = this.uint32();
      yield [tag >>> 3, tag & 7];
    }
  }
}

const utf8 = new TextDecoder('utf-8');
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function base64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
/** int64 encodé en varint (complément à deux sur 64 bits). */
const int64 = (v: bigint) => BigInt.asIntN(64, v).toString();

type Json = Record<string, unknown>;

function anyValue(r: Reader): Json {
  for (const [f, w] of r.fields()) {
    switch (f) {
      case 1: return { stringValue: r.string() };
      case 2: return { boolValue: r.varint() !== 0n };
      case 3: return { intValue: int64(r.varint()) };
      case 4: return { doubleValue: r.double() };
      case 5: {
        const values: Json[] = [];
        const a = r.sub();
        for (const [ff, ww] of a.fields()) (ff === 1 ? values.push(anyValue(a.sub())) : a.skip(ww));
        return { arrayValue: { values } };
      }
      case 6: return { kvlistValue: { values: keyValues(r.sub()) } };
      case 7: return { bytesValue: base64(r.bytes()) };
      default: r.skip(w);
    }
  }
  return {};
}

function keyValue(r: Reader): Json {
  let key = '';
  let value: Json = {};
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 2) key = r.string();
    else if (f === 2 && w === 2) value = anyValue(r.sub());
    else r.skip(w);
  }
  return { key, value };
}

/** Les KeyValue répétés (champ 1) d'un KeyValueList. */
function keyValues(r: Reader): Json[] {
  const out: Json[] = [];
  for (const [f, w] of r.fields()) (f === 1 && w === 2 ? out.push(keyValue(r.sub())) : r.skip(w));
  return out;
}


function event(r: Reader): Json {
  const e: Json = { attributes: [] as Json[] };
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 1) e.timeUnixNano = r.fixed64().toString();
    else if (f === 2 && w === 2) e.name = r.string();
    else if (f === 3 && w === 2) (e.attributes as Json[]).push(keyValue(r.sub()));
    else r.skip(w);
  }
  return e;
}

function status(r: Reader): Json {
  const s: Json = {};
  for (const [f, w] of r.fields()) {
    if (f === 2 && w === 2) s.message = r.string();
    else if (f === 3 && w === 0) s.code = r.uint32();
    else r.skip(w);
  }
  return s;
}

function span(r: Reader): Json {
  const s: Json = { traceId: '', spanId: '', parentSpanId: '', attributes: [] as Json[], events: [] as Json[] };
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 2) s.traceId = hex(r.bytes());
    else if (f === 2 && w === 2) s.spanId = hex(r.bytes());
    else if (f === 3 && w === 2) s.traceState = r.string();
    else if (f === 4 && w === 2) s.parentSpanId = hex(r.bytes());
    else if (f === 5 && w === 2) s.name = r.string();
    else if (f === 6 && w === 0) s.kind = r.uint32();
    else if (f === 7 && w === 1) s.startTimeUnixNano = r.fixed64().toString();
    else if (f === 8 && w === 1) s.endTimeUnixNano = r.fixed64().toString();
    else if (f === 9 && w === 2) (s.attributes as Json[]).push(keyValue(r.sub()));
    else if (f === 11 && w === 2) (s.events as Json[]).push(event(r.sub()));
    else if (f === 15 && w === 2) s.status = status(r.sub());
    else r.skip(w);
  }
  return s;
}

function scope(r: Reader): Json {
  const s: Json = {};
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 2) s.name = r.string();
    else if (f === 2 && w === 2) s.version = r.string();
    else r.skip(w);
  }
  return s;
}

function scopeSpans(r: Reader): Json {
  const out: Json = { spans: [] as Json[] };
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 2) out.scope = scope(r.sub());
    else if (f === 2 && w === 2) (out.spans as Json[]).push(span(r.sub()));
    else r.skip(w);
  }
  return out;
}

function resource(r: Reader): Json {
  const attributes: Json[] = [];
  for (const [f, w] of r.fields()) (f === 1 && w === 2 ? attributes.push(keyValue(r.sub())) : r.skip(w));
  return { attributes };
}

function resourceSpans(r: Reader): Json {
  const out: Json = { scopeSpans: [] as Json[] };
  for (const [f, w] of r.fields()) {
    if (f === 1 && w === 2) out.resource = resource(r.sub());
    else if (f === 2 && w === 2) (out.scopeSpans as Json[]).push(scopeSpans(r.sub()));
    else r.skip(w);
  }
  return out;
}

/**
 * Décode un ExportTraceServiceRequest protobuf (corps d'un POST /v1/traces
 * en application/x-protobuf) vers sa forme OTLP/JSON :
 * { resourceSpans: [{ resource, scopeSpans: [{ scope, spans }] }] }.
 * Identifiants en hexadécimal, horodatages et int64 en chaînes, comme en JSON.
 */
export function decodeOtlpProtobuf(bytes: Uint8Array): { resourceSpans: Json[] } {
  const r = new Reader(bytes);
  const resourceSpansList: Json[] = [];
  for (const [f, w] of r.fields()) (f === 1 && w === 2 ? resourceSpansList.push(resourceSpans(r.sub())) : r.skip(w));
  return { resourceSpans: resourceSpansList };
}
