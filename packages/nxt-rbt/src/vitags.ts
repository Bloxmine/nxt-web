import { ByteReader } from './bytes.js';
import { parseTypeDesc, readFlattened, type LvValue, type TypeDesc } from './lvtype.js';

/**
 * VI tags ("VITS" resource): u32 count, then per tag
 *   u32 name length, name, u32 size (including itself), type descriptor, data.
 * The original software keeps a block's template path and, for several
 * blocks, its settings here (e.g. "MerlotMoveBlockConfig").
 */
export function parseViTags(bytes: Uint8Array): Map<string, LvValue | Uint8Array> {
  const r = new ByteReader(bytes);
  const tags = new Map<string, LvValue | Uint8Array>();
  if (bytes.length < 4) return tags;
  const count = r.u32(0);
  let p = 4;
  for (let i = 0; i < count; i++) {
    const nameLength = r.u32(p);
    const name = r.text(p + 4, nameLength);
    p += 4 + nameLength;
    const size = r.u32(p);
    const blob = bytes.subarray(p + 4, p + size);
    p += size;
    try {
      const br = new ByteReader(blob);
      const [td, q] = parseTypeDesc(br, 0);
      tags.set(name, readFlattened(td, br, q)[0]);
    } catch {
      tags.set(name, blob);
    }
  }
  return tags;
}

/** A value to write into a settings cluster field (enums take an item name or index). */
export type TagFieldValue = number | boolean | string;

function encodeField(td: TypeDesc, value: TagFieldValue): Uint8Array {
  const t = td.type === 0xf1 && td.inner ? td.inner : td;
  const out = (n: number) => {
    const b = new Uint8Array(n);
    return [b, new DataView(b.buffer)] as const;
  };
  switch (t.type) {
    case 0x30: {
      const s = String(value);
      const [b, v] = out(4 + s.length);
      v.setUint32(0, s.length);
      for (let i = 0; i < s.length; i++) b[4 + i] = s.charCodeAt(i) & 0xff;
      return b;
    }
    case 0x21: {
      const [b] = out(1);
      b[0] = value ? 1 : 0;
      return b;
    }
    case 0x15:
    case 0x16:
    case 0x17: {
      const index = typeof value === 'number' ? value : (t.items ?? []).indexOf(String(value));
      if (index < 0)
        throw new Error(`"${String(value)}" is not one of ${(t.items ?? []).join(', ')}`);
      const n = t.type === 0x15 ? 1 : t.type === 0x16 ? 2 : 4;
      const [b, v] = out(n);
      if (n === 1) v.setUint8(0, index);
      else if (n === 2) v.setUint16(0, index);
      else v.setUint32(0, index);
      return b;
    }
    default: {
      const n = Number(value);
      const sizes: Record<number, number> = { 1: 1, 2: 2, 3: 4, 5: 1, 6: 2, 7: 4, 9: 4, 10: 8 };
      const size = sizes[t.type];
      if (size === undefined)
        throw new Error(`Cannot write a field of type 0x${t.type.toString(16)}`);
      const [b, v] = out(size);
      if (t.type === 1) v.setInt8(0, n);
      else if (t.type === 2) v.setInt16(0, n);
      else if (t.type === 3) v.setInt32(0, n);
      else if (t.type === 5) v.setUint8(0, n);
      else if (t.type === 6) v.setUint16(0, n);
      else if (t.type === 7) v.setUint32(0, n);
      else if (t.type === 9) v.setFloat32(0, n);
      else v.setFloat64(0, n);
      return b;
    }
  }
}

/**
 * Changes fields of a settings cluster in a VI tags resource (e.g. "Power" in
 * "MerlotMoveBlockConfig") and returns the new resource. Other tags and fields keep their
 * exact bytes. Throws if the tag or a field does not exist.
 */
export function writeViTagFields(
  bytes: Uint8Array,
  tagName: string,
  fields: Record<string, TagFieldValue>,
): Uint8Array {
  const r = new ByteReader(bytes);
  const count = r.u32(0);
  const parts: Uint8Array[] = [bytes.subarray(0, 4)];
  let p = 4;
  let found = false;
  for (let i = 0; i < count; i++) {
    const nameLength = r.u32(p);
    const name = r.text(p + 4, nameLength);
    const head = bytes.subarray(p, p + 4 + nameLength);
    p += 4 + nameLength;
    const size = r.u32(p);
    const blob = bytes.subarray(p + 4, p + size);
    p += size;
    if (name !== tagName) {
      parts.push(head, bytes.subarray(p - size, p));
      continue;
    }
    found = true;
    const br = new ByteReader(blob);
    const [td, dataStart] = parseTypeDesc(br, 0);
    const cluster = td.type === 0xf1 && td.inner ? td.inner : td;
    if (cluster.type !== 0x50) throw new Error(`Tag "${tagName}" is not a settings cluster`);
    const pieces: Uint8Array[] = [blob.subarray(0, dataStart)];
    let q = dataStart;
    const remaining = new Set(Object.keys(fields));
    for (const f of cluster.fields ?? []) {
      const [, next] = readFlattened(f, br, q);
      const label = f.label ?? '';
      if (label in fields) {
        pieces.push(encodeField(f, fields[label]!));
        remaining.delete(label);
      } else {
        pieces.push(blob.subarray(q, next));
      }
      q = next;
    }
    pieces.push(blob.subarray(q));
    if (remaining.size)
      throw new Error(`Tag "${tagName}" has no field ${[...remaining].join(', ')}`);
    const body = concat(pieces);
    const sizeBytes = new Uint8Array(4);
    new DataView(sizeBytes.buffer).setUint32(0, body.length + 4);
    parts.push(head, sizeBytes, body);
  }
  if (!found) throw new Error(`The block has no "${tagName}" tag`);
  parts.push(bytes.subarray(p));
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of parts) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}
