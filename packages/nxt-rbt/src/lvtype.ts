import type { ByteReader } from './bytes.js';

/**
 * LabVIEW 7 type descriptors and flattened data, as used by VI tags and
 * linker info inside .rbt files. Layout (big-endian), worked out from files:
 *
 *   u16 size (whole descriptor)  u8 flags  u8 type  …type-specific…  [label]
 *
 * Flag 0x40 means the descriptor ends with a Pascal-string label.
 */
export const LvType = {
  I8: 0x01,
  I16: 0x02,
  I32: 0x03,
  I64: 0x04,
  U8: 0x05,
  U16: 0x06,
  U32: 0x07,
  U64: 0x08,
  SGL: 0x09,
  DBL: 0x0a,
  EnumU8: 0x15,
  EnumU16: 0x16,
  EnumU32: 0x17,
  Boolean: 0x21,
  String: 0x30,
  Path: 0x32,
  Array: 0x40,
  Cluster: 0x50,
  Function: 0xf0,
  TypeDef: 0xf1,
} as const;

/** A parsed type descriptor. */
export interface TypeDesc {
  type: number;
  flags: number;
  label?: string;
  /** Enum item names. */
  items?: string[];
  /** Cluster fields. */
  fields?: TypeDesc[];
  /** Array element type. */
  element?: TypeDesc;
  /** Type definition (.ctl) name and wrapped type. */
  typedefName?: string;
  inner?: TypeDesc;
}

const NUMERIC_SIZE: Record<number, number> = {
  0x01: 1,
  0x02: 2,
  0x03: 4,
  0x04: 8,
  0x05: 1,
  0x06: 2,
  0x07: 4,
  0x08: 8,
  0x09: 4,
  0x0a: 8,
};

/** Parses a type descriptor at `offset`. Returns it and the offset after it. */
export function parseTypeDesc(r: ByteReader, offset: number): [TypeDesc, number] {
  const size = r.u16(offset);
  const flags = r.u8(offset + 2);
  const type = r.u8(offset + 3);
  const end = offset + size;
  if (size < 4) throw new RangeError(`Bad type descriptor size ${size} at ${offset}`);
  let p = offset + 4;
  const td: TypeDesc = { type, flags };
  if (type === LvType.EnumU8 || type === LvType.EnumU16 || type === LvType.EnumU32) {
    const n = r.u16(p);
    p += 2;
    td.items = [];
    for (let i = 0; i < n; i++) {
      const [s, q] = r.pstr(p);
      td.items.push(s);
      p = q;
    }
  } else if (type === LvType.String || type === 0x31 || type === LvType.Path) {
    p += 4;
  } else if (type === LvType.Array) {
    const dims = r.u16(p);
    p += 2 + 4 * dims;
    const [el, q] = parseTypeDesc(r, p);
    td.element = el;
    p = q;
  } else if (type === LvType.Cluster) {
    const n = r.u16(p);
    p += 2;
    td.fields = [];
    for (let i = 0; i < n; i++) {
      const [f, q] = parseTypeDesc(r, p);
      td.fields.push(f);
      p = q;
    }
  } else if (type === LvType.TypeDef) {
    p += 4;
    const [name, q] = r.pstr(p);
    td.typedefName = name;
    p = q;
    if (p % 2) p++;
    const [inner, q2] = parseTypeDesc(r, p);
    td.inner = inner;
    p = q2;
  }
  if (flags & 0x40 && p < end) {
    td.label = r.pstr(p)[0];
  }
  return [td, end];
}

/** A decoded flattened value. */
export type LvValue = number | boolean | string | LvValue[] | { [field: string]: LvValue };

/** Reads flattened (big-endian) data of type `td` at `offset`. */
export function readFlattened(td: TypeDesc, r: ByteReader, offset: number): [LvValue, number] {
  const t = td.type;
  if (t === LvType.TypeDef && td.inner) return readFlattened(td.inner, r, offset);
  const numSize = NUMERIC_SIZE[t];
  if (numSize !== undefined) {
    const v =
      t === LvType.I8
        ? r.i8(offset)
        : t === LvType.I16
          ? r.i16(offset)
          : t === LvType.I32
            ? r.i32(offset)
            : t === LvType.U8
              ? r.u8(offset)
              : t === LvType.U16
                ? r.u16(offset)
                : t === LvType.U32
                  ? r.u32(offset)
                  : t === LvType.SGL
                    ? r.f32(offset)
                    : t === LvType.DBL
                      ? r.f64(offset)
                      : Number(r.u32(offset + numSize - 4));
    return [v, offset + numSize];
  }
  if (t === LvType.EnumU8 || t === LvType.EnumU16 || t === LvType.EnumU32) {
    const n = t === LvType.EnumU8 ? 1 : t === LvType.EnumU16 ? 2 : 4;
    const v = n === 1 ? r.u8(offset) : n === 2 ? r.u16(offset) : r.u32(offset);
    return [td.items?.[v] ?? v, offset + n];
  }
  if (t === LvType.Boolean) return [r.u8(offset) !== 0, offset + 1];
  if (t === LvType.String) {
    const n = r.u32(offset);
    return [r.text(offset + 4, n), offset + 4 + n];
  }
  if (t === LvType.Path || t === 0x31) {
    // "PTH0", u32 length, u16 type, u16 count, then Pascal strings.
    const n = r.u32(offset + 4);
    const start = offset + 8;
    const parts: string[] = [];
    if (n >= 4) {
      const count = r.u16(start + 2);
      let p = start + 4;
      for (let i = 0; i < count && p < start + n; i++) {
        const [s, q] = r.pstr(p);
        parts.push(s);
        p = q;
      }
    }
    return [parts.join('/'), start + n];
  }
  if (t === LvType.Cluster) {
    const out: { [field: string]: LvValue } = {};
    let p = offset;
    (td.fields ?? []).forEach((f, i) => {
      const [v, q] = readFlattened(f, r, p);
      out[f.label ?? `#${i}`] = v;
      p = q;
    });
    return [out, p];
  }
  if (t === LvType.Array && td.element) {
    const n = r.u32(offset);
    const arr: LvValue[] = [];
    let p = offset + 4;
    for (let i = 0; i < n; i++) {
      const [v, q] = readFlattened(td.element, r, p);
      arr.push(v);
      p = q;
    }
    return [arr, p];
  }
  throw new RangeError(`Unsupported LabVIEW type 0x${t.toString(16)}`);
}
