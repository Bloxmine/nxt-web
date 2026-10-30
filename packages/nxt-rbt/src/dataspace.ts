/**
 * The data space of a LabVIEW 7 VI as NXT-G block instances store it (docs/rbt-compat.md,
 * "Front-panel default data"): the type map `DSTM` (one cluster of type descriptors) and
 * the default data `DFDS`.
 *
 * Worked out from the 1,326 block instances in the test corpus, all of which decode to
 * exactly their DFDS length:
 *  - a type descriptor flagged 0x20 has default data; with 0x08 as well, the default is
 *    zero and is left out of DFDS (no stored default is ever all zero bytes);
 *  - DFDS is the flattened default of every such descriptor, in type-map order (a
 *    flagged descriptor's children are not visited);
 *  - each front-panel control is a cluster [udf, value, dfd, txd, old, ext]; `dfd` holds
 *    the control's default, i.e. the block's setting.
 */

/** Type codes used in data-space type maps (LabVIEW 7). */
export const DsType = {
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
  BoolU16: 0x20,
  Bool: 0x21,
  String: 0x30,
  Path: 0x32,
  Array: 0x40,
  Cluster: 0x50,
  Block: 0x60,
  AlignedBlock: 0x63,
  RepeatedBlock: 0x64,
  Refnum: 0x70,
  TypeDef: 0xf1,
} as const;

/** Flag: the descriptor has default data. */
export const HAS_DEFAULT = 0x20;
/** Flag (with HAS_DEFAULT): the default is zero and not stored. */
export const ZERO_DEFAULT = 0x08;

const FIXED: Record<number, number> = {
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
  0x15: 1,
  0x16: 2,
  0x17: 4,
  0x20: 2,
  0x21: 1,
};

/** A type descriptor in a type map, with its position (to change its flags). */
export interface DsTd {
  type: number;
  flags: number;
  /** Offset of the descriptor in the type map. */
  offset: number;
  size: number;
  label?: string;
  children: DsTd[];
  /** Enum item names. */
  items?: string[];
  /** Array dimension count. */
  dims?: number;
  /** Byte size of a Block / AlignedBlock. */
  blockSize?: number;
  /** Repeat count of a RepeatedBlock. */
  repeats?: number;
}

const u16 = (b: Uint8Array, p: number) => (b[p]! << 8) | b[p + 1]!;
const u32 = (b: Uint8Array, p: number) =>
  ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0;

function pstr(b: Uint8Array, p: number): [string, number] {
  const n = b[p]!;
  return [String.fromCharCode(...b.subarray(p + 1, p + 1 + n)), p + 1 + n];
}

/** Parses the descriptor at `p`. Unknown types are kept (their size is known). */
export function parseDsTd(b: Uint8Array, p: number): DsTd {
  const size = u16(b, p);
  if (size < 4 || p + size > b.length) throw new RangeError(`Bad type descriptor at ${p}`);
  const td: DsTd = { type: b[p + 3]!, flags: b[p + 2]!, offset: p, size, children: [] };
  const end = p + size;
  let q = p + 4;
  switch (td.type) {
    case DsType.EnumU8:
    case DsType.EnumU16:
    case DsType.EnumU32: {
      const n = u16(b, q);
      q += 2;
      td.items = [];
      for (let i = 0; i < n; i++) {
        const [s, r] = pstr(b, q);
        td.items.push(s);
        q = r;
      }
      break;
    }
    case DsType.Array: {
      td.dims = u16(b, q);
      q += 2 + 4 * td.dims;
      const el = parseDsTd(b, q);
      td.children = [el];
      q += el.size;
      break;
    }
    case DsType.Cluster: {
      const n = u16(b, q);
      q += 2;
      for (let i = 0; i < n; i++) {
        const c = parseDsTd(b, q);
        td.children.push(c);
        q += c.size;
      }
      break;
    }
    case DsType.TypeDef: {
      q += 4;
      const [, r] = pstr(b, q);
      q = r + ((r - p) % 2);
      const inner = parseDsTd(b, q);
      td.children = [inner];
      q += inner.size;
      break;
    }
    case DsType.Block:
    case DsType.AlignedBlock:
      td.blockSize = u32(b, q);
      break;
    case DsType.RepeatedBlock: {
      td.repeats = u16(b, q);
      q += 2;
      const el = parseDsTd(b, q);
      td.children = [el];
      q += el.size;
      break;
    }
    default:
      break;
  }
  if (td.flags & 0x40) {
    // The label is the Pascal string that ends the descriptor (possibly one pad byte).
    for (let k = end - 1; k >= q; k--) {
      const n = b[k]!;
      if (n > 0 && k + 1 + n >= end - 1 && k + 1 + n <= end) {
        const text = b.subarray(k + 1, k + 1 + n);
        if (text.every((c) => c >= 32 && c < 127)) {
          td.label = String.fromCharCode(...text);
          break;
        }
      }
    }
  }
  return td;
}

/** Size of one flattened value of `td` starting at `p` in `data`. */
export function flatSize(td: DsTd, data: Uint8Array, p: number): number {
  if (p > data.length) throw new RangeError('Default data is shorter than its type map');
  const fixed = FIXED[td.type];
  if (fixed !== undefined) return fixed;
  switch (td.type) {
    case DsType.String:
      return 4 + u32(data, p);
    case DsType.Path:
      return 8 + u32(data, p + 4);
    case DsType.Array: {
      let count = 1;
      let q = p;
      for (let i = 0; i < (td.dims ?? 1); i++) {
        count *= u32(data, q);
        q += 4;
      }
      if (count > data.length) throw new RangeError('Implausible array size in default data');
      for (let i = 0; i < count; i++) q += flatSize(td.children[0]!, data, q);
      return q - p;
    }
    case DsType.Cluster: {
      let q = p;
      for (const c of td.children) q += flatSize(c, data, q);
      return q - p;
    }
    case DsType.TypeDef:
      return flatSize(td.children[0]!, data, p);
    case DsType.Block:
    case DsType.AlignedBlock:
      return td.blockSize ?? 0;
    case DsType.RepeatedBlock: {
      let q = p;
      for (let i = 0; i < (td.repeats ?? 0); i++) q += flatSize(td.children[0]!, data, q);
      return q - p;
    }
    default:
      throw new RangeError(`No default-data layout for type 0x${td.type.toString(16)}`);
  }
}

/** Descriptors that may carry default data, in type-map order. */
function defaultSlots(td: DsTd, out: DsTd[], depth = 0): DsTd[] {
  if (depth > 0 && td.flags & HAS_DEFAULT) {
    out.push(td);
    return out;
  }
  for (const c of td.children) defaultSlots(c, out, depth + 1);
  return out;
}

/** A front-panel control of a block: its setting lives in `dfd`. */
export interface Control {
  label: string;
  value: DsTd;
  dfd: DsTd;
}

/**
 * An instance's data space: the type map plus its default data, split into one byte
 * string per descriptor that has default data (empty when the default is zero).
 */
export class DataSpace {
  readonly top: DsTd;
  private readonly slots: DsTd[];
  private readonly values: Uint8Array[];

  constructor(
    private dstm: Uint8Array,
    dfds: Uint8Array,
  ) {
    this.dstm = dstm.slice();
    this.top = parseDsTd(this.dstm, 0);
    this.slots = defaultSlots(this.top, []);
    this.values = [];
    let p = 0;
    for (const td of this.slots) {
      if (td.flags & ZERO_DEFAULT) {
        this.values.push(new Uint8Array());
        continue;
      }
      const n = flatSize(td, dfds, p);
      this.values.push(dfds.slice(p, p + n));
      p += n;
    }
    if (p !== dfds.length) {
      throw new RangeError(`Default data has ${dfds.length - p} unexplained bytes`);
    }
  }

  /** Front-panel controls by label (the first one wins when labels repeat). */
  controls(): Map<string, Control> {
    const map = new Map<string, Control>();
    for (const c of this.top.children) {
      if (c.type !== DsType.Cluster || c.children.length !== 6 || c.children[0]!.label !== 'udf')
        continue;
      const value = c.children[1]!;
      const label = value.label;
      if (label && !map.has(label)) map.set(label, { label, value, dfd: c.children[2]! });
    }
    return map;
  }

  /** The stored default bytes of a descriptor (empty if zero or not a default slot). */
  defaultBytes(td: DsTd): Uint8Array {
    const i = this.slots.indexOf(td);
    return i < 0 ? new Uint8Array() : this.values[i]!;
  }

  /** Replaces a descriptor's default; all-zero bytes are stored as "zero default". */
  setDefaultBytes(td: DsTd, bytes: Uint8Array): void {
    const i = this.slots.indexOf(td);
    if (i < 0) throw new Error(`"${td.label ?? 'value'}" has no default data`);
    const zero = bytes.every((x) => x === 0);
    this.values[i] = zero ? new Uint8Array() : bytes.slice();
    td.flags = zero ? td.flags | ZERO_DEFAULT : td.flags & ~ZERO_DEFAULT;
    this.dstm[td.offset + 2] = td.flags;
  }

  /**
   * Where the setting called `label` lives: a front-panel control's default, or else a
   * labelled top-level value with default data (e.g. a loop's "MilliSeconds").
   */
  slot(label: string): DsTd | undefined {
    const c = this.controls().get(label);
    if (c) return c.dfd;
    return this.top.children.find((t) => t.label === label && t.flags & HAS_DEFAULT);
  }

  /** True if the block has a setting called `label`. */
  has(label: string): boolean {
    return this.slot(label) !== undefined;
  }

  /** Reads a setting. */
  get(label: string): number | boolean | string | undefined {
    const td = this.slot(label);
    if (!td) return undefined;
    return decodeScalar(scalarOf(td), this.defaultBytes(td));
  }

  /** Changes a setting. */
  set(label: string, value: number | boolean | string): void {
    const td = this.slot(label);
    if (!td) throw new Error(`The block has no "${label}" setting`);
    this.setDefaultBytes(td, encodeScalar(scalarOf(td), value));
  }

  /** The type map and default data as stored. */
  encode(): { dstm: Uint8Array; dfds: Uint8Array } {
    const length = this.values.reduce((n, v) => n + v.length, 0);
    const dfds = new Uint8Array(length);
    let p = 0;
    for (const v of this.values) {
      dfds.set(v, p);
      p += v.length;
    }
    return { dstm: this.dstm.slice(), dfds };
  }
}

function scalarOf(td: DsTd): DsTd {
  return td.type === DsType.TypeDef ? scalarOf(td.children[0]!) : td;
}

/** Decodes a stored scalar default (empty bytes = zero / false / ""). */
export function decodeScalar(td: DsTd, b: Uint8Array): number | boolean | string {
  const zero = b.length === 0;
  const view = zero ? null : new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (td.type) {
    case DsType.Bool:
    case DsType.BoolU16:
      return zero ? false : b.some((x) => x !== 0);
    case DsType.String:
    case DsType.Path:
      return zero ? '' : String.fromCharCode(...b.subarray(td.type === DsType.Path ? 8 : 4));
    case DsType.I8:
      return view ? view.getInt8(0) : 0;
    case DsType.I16:
      return view ? view.getInt16(0) : 0;
    case DsType.I32:
      return view ? view.getInt32(0) : 0;
    case DsType.U8:
    case DsType.EnumU8:
      return view ? view.getUint8(0) : 0;
    case DsType.U16:
    case DsType.EnumU16:
      return view ? view.getUint16(0) : 0;
    case DsType.U32:
    case DsType.EnumU32:
      return view ? view.getUint32(0) : 0;
    case DsType.SGL:
      return view ? view.getFloat32(0) : 0;
    case DsType.DBL:
      return view ? view.getFloat64(0) : 0;
    default:
      throw new Error(`Settings of type 0x${td.type.toString(16)} cannot be read`);
  }
}

/** Encodes a scalar default as stored (big-endian; strings with a u32 length). */
export function encodeScalar(td: DsTd, value: number | boolean | string): Uint8Array {
  const n = FIXED[td.type];
  if (td.type === DsType.String) {
    const s = String(value);
    const out = new Uint8Array(4 + s.length);
    new DataView(out.buffer).setUint32(0, s.length);
    for (let i = 0; i < s.length; i++) out[4 + i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  if (n === undefined)
    throw new Error(`Settings of type 0x${td.type.toString(16)} cannot be written`);
  const out = new Uint8Array(n);
  const view = new DataView(out.buffer);
  const v = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
  switch (td.type) {
    case DsType.Bool:
      out[0] = v ? 1 : 0;
      break;
    case DsType.BoolU16:
      view.setUint16(0, v ? 1 : 0);
      break;
    case DsType.I8:
      view.setInt8(0, v);
      break;
    case DsType.I16:
      view.setInt16(0, v);
      break;
    case DsType.I32:
      view.setInt32(0, v);
      break;
    case DsType.U8:
    case DsType.EnumU8:
      view.setUint8(0, v);
      break;
    case DsType.U16:
    case DsType.EnumU16:
      view.setUint16(0, v);
      break;
    case DsType.U32:
    case DsType.EnumU32:
      view.setUint32(0, v);
      break;
    case DsType.SGL:
      view.setFloat32(0, v);
      break;
    case DsType.DBL:
      view.setFloat64(0, v);
      break;
    default:
      throw new Error(`Settings of type 0x${td.type.toString(16)} cannot be written`);
  }
  return out;
}
