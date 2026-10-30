import { RXE_SIGNATURE, RXE_VERSION } from './writer.js';
import { TC, scalarSize } from './opcodes.js';

/** A DSTOC record as stored. */
export interface TocEntry {
  type: number;
  flags: number;
  descriptor: number;
}

/** A clump record as stored. */
export interface ClumpRecord {
  fireCount: number;
  dependents: number[];
  /** Index of the clump's first code word. */
  codeStart: number;
}

/** A parsed .rxe file. */
export interface RxeFile {
  dataspace: {
    count: number;
    initialSize: number;
    staticSize: number;
    defaultDataSize: number;
    dynamicDefaultOffset: number;
    dynamicDefaultSize: number;
    memMgrHead: number;
    memMgrTail: number;
    dopeVectorOffset: number;
  };
  toc: TocEntry[];
  staticDefaults: Uint8Array;
  dynamicDefaults: Uint8Array;
  clumps: ClumpRecord[];
  code: number[];
}

/** Parses an executable file (for tests and the simulator's VM). Throws on bad files. */
export function readRxe(bytes: Uint8Array): RxeFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = String.fromCharCode(...bytes.subarray(0, RXE_SIGNATURE.length));
  if (signature !== RXE_SIGNATURE || view.getUint16(14, false) !== RXE_VERSION) {
    throw new Error('Not an NXT executable (.rxe) file');
  }
  const w = (at: number) => view.getUint16(at, true);
  const dataspace = {
    count: w(16),
    initialSize: w(18),
    staticSize: w(20),
    defaultDataSize: w(22),
    dynamicDefaultOffset: w(24),
    dynamicDefaultSize: w(26),
    memMgrHead: w(28),
    memMgrTail: w(30),
    dopeVectorOffset: w(32),
  };
  const clumpCount = w(34);
  const codeCount = w(36);
  let p = 38;
  const toc: TocEntry[] = [];
  for (let i = 0; i < dataspace.count; i++, p += 4) {
    toc.push({ type: bytes[p]!, flags: bytes[p + 1]!, descriptor: w(p + 2) });
  }
  const staticDefaults = bytes.slice(p, p + dataspace.dynamicDefaultOffset);
  p += dataspace.dynamicDefaultOffset;
  const dynamicDefaults = bytes.slice(p, p + dataspace.dynamicDefaultSize);
  p += dataspace.dynamicDefaultSize;
  if (p % 2) p++;
  const clumps: ClumpRecord[] = [];
  for (let i = 0; i < clumpCount; i++, p += 4) {
    clumps.push({
      fireCount: bytes[p]!,
      dependents: new Array<number>(bytes[p + 1]!),
      codeStart: w(p + 2),
    });
  }
  for (const c of clumps) {
    for (let i = 0; i < c.dependents.length; i++) c.dependents[i] = bytes[p++]!;
  }
  if (p % 2) p++;
  const code: number[] = [];
  for (let i = 0; i < codeCount; i++, p += 2) code.push(w(p));
  if (p > bytes.length) throw new Error('The .rxe file is cut short');
  return { dataspace, toc, staticDefaults, dynamicDefaults, clumps, code };
}

/**
 * The value every addressable scalar and array starts with, by DSTOC index, worked out
 * the way the firmware activates a program: static defaults are unpacked in DSTOC
 * order, then arrays are found through their dope vectors in the dynamic image.
 */
export function initialValues(file: RxeFile): Map<number, number | number[]> {
  const { toc, staticDefaults, dynamicDefaults } = file;
  const dvOffset = file.dataspace.dopeVectorOffset;
  const values = new Map<number, number | number[]>();
  const signed = (v: number, size: number) => {
    const bits = size * 8;
    return v >= 2 ** (bits - 1) ? v - 2 ** bits : v;
  };
  let s = 0;
  const take = (size: number) => {
    let v = 0;
    for (let i = 0; i < size; i++) v += staticDefaults[s++]! * 2 ** (8 * i);
    return v;
  };
  const dyn16 = (ramOffset: number) => {
    const at = ramOffset - dvOffset;
    return dynamicDefaults[at]! | (dynamicDefaults[at + 1]! << 8);
  };
  for (let i = 0; i < toc.length; i++) {
    const r = toc[i]!;
    if (r.type === TC.CLUSTER || r.type === TC.VOID) continue;
    if (r.type === TC.MUTEX) {
      take(4);
      continue;
    }
    if (r.type === TC.ARRAY) {
      const dv = take(2);
      const element = toc[i + 1]!.type;
      const base = dvOffset + dv * 10;
      const offset = dyn16(base);
      const size = dyn16(base + 2);
      const count = dyn16(base + 4);
      const items: number[] = [];
      for (let k = 0; k < count && offset !== 0xffff; k++) {
        let v = 0;
        for (let b = 0; b < size; b++)
          v += dynamicDefaults[offset - dvOffset + k * size + b]! * 2 ** (8 * b);
        items.push(
          element === TC.SBYTE || element === TC.SWORD || element === TC.SLONG
            ? signed(v, size)
            : v,
        );
      }
      values.set(i, items);
      i++; // skip the element record
      continue;
    }
    const size = scalarSize(r.type);
    const raw = r.flags & 1 ? 0 : take(size);
    values.set(
      i,
      r.type === TC.SBYTE || r.type === TC.SWORD || r.type === TC.SLONG ? signed(raw, size) : raw,
    );
  }
  return values;
}
