import { TC, scalarSize, type ScalarTypeCode } from './opcodes.js';

/** Type of a dataspace item. */
export type DsType =
  | { kind: 'scalar'; tc: ScalarTypeCode }
  | { kind: 'array'; element: ScalarTypeCode }
  | { kind: 'cluster'; fields: DsType[] }
  | { kind: 'mutex' };

/** Default value: a number for scalars, numbers for arrays, one per field for clusters. */
export type DsDefault = number | readonly number[] | readonly DsDefault[] | undefined;

/** One 4-byte DSTOC record before layout. */
export interface TocRecord {
  type: number;
  /** Top-level records live in the static dataspace; array element records do not. */
  element: boolean;
  /** Cluster: number of fields. */
  fieldCount?: number;
  /** Scalar or array default (array: its elements). */
  default?: number | readonly number[];
}

/** Shorthand type constructors. */
export const T = {
  ubyte: { kind: 'scalar', tc: TC.UBYTE } as DsType,
  sbyte: { kind: 'scalar', tc: TC.SBYTE } as DsType,
  uword: { kind: 'scalar', tc: TC.UWORD } as DsType,
  sword: { kind: 'scalar', tc: TC.SWORD } as DsType,
  ulong: { kind: 'scalar', tc: TC.ULONG } as DsType,
  slong: { kind: 'scalar', tc: TC.SLONG } as DsType,
  mutex: { kind: 'mutex' } as DsType,
  array: (element: ScalarTypeCode): DsType => ({ kind: 'array', element }),
  /** A text string: an array of bytes ending in a zero byte. */
  string: { kind: 'array', element: TC.UBYTE } as DsType,
  cluster: (...fields: DsType[]): DsType => ({ kind: 'cluster', fields }),
};

/** Bytes of a text string as the VM stores it (with the terminating zero). */
export function stringBytes(text: string): number[] {
  return [...Array.from(text, (c) => c.charCodeAt(0) & 0xff), 0];
}

/** An item added to the dataspace: its id and, for clusters, the ids of its fields. */
export interface DsItem {
  id: number;
  fields: DsItem[];
}

/**
 * Builds the dataspace table of contents. Items get their ids (DSTOC indexes) as they
 * are added, so code can refer to them right away; offsets are worked out by
 * {@link layoutDataspace} when the file is written.
 */
export class Dataspace {
  readonly records: TocRecord[] = [];

  /** Adds a top-level item and returns its id (and its fields' ids for clusters). */
  add(type: DsType, value?: DsDefault): DsItem {
    const id = this.records.length;
    switch (type.kind) {
      case 'scalar':
        this.records.push({
          type: type.tc,
          element: false,
          ...(typeof value === 'number' ? { default: value } : {}),
        });
        return { id, fields: [] };
      case 'mutex':
        this.records.push({ type: TC.MUTEX, element: false });
        return { id, fields: [] };
      case 'array':
        this.records.push({
          type: TC.ARRAY,
          element: false,
          default: Array.isArray(value) ? (value as number[]) : [],
        });
        this.records.push({ type: type.element, element: true });
        return { id, fields: [] };
      case 'cluster': {
        this.records.push({ type: TC.CLUSTER, element: false, fieldCount: type.fields.length });
        const values = Array.isArray(value) ? (value as DsDefault[]) : [];
        const fields = type.fields.map((f, i) => this.add(f, values[i]));
        return { id, fields };
      }
    }
  }
}

/** Where everything ended up in RAM, plus the default data streams. */
export interface DataspaceLayout {
  /** DSTOC records as written: [type, flags, data descriptor]. */
  toc: [number, number, number][];
  staticSize: number;
  staticDefaults: Uint8Array;
  dynamicDefaults: Uint8Array;
  initialSize: number;
  dopeVectorOffset: number;
  memMgrHead: number;
  memMgrTail: number;
}

const align = (n: number, to: number) => Math.ceil(n / to) * to;

/** Works out offsets, dope vectors and default data for a dataspace (spec: "Dataspace"). */
export function layoutDataspace(ds: Dataspace): DataspaceLayout {
  const toc: [number, number, number][] = [];
  const staticBytes: number[] = [];
  const arrays: { elementSize: number; values: readonly number[]; dvIndexOffset: number }[] = [];
  let offset = 0;
  const push = (n: number, size: number) => {
    for (let i = 0; i < size; i++) staticBytes.push((n >>> (8 * i)) & 0xff);
  };

  for (const r of ds.records) {
    if (r.element) {
      // Array element type: descriptor is the offset inside an element (0 for scalars).
      toc.push([r.type, 0, 0]);
      continue;
    }
    switch (r.type) {
      case TC.CLUSTER:
        toc.push([r.type, 0, r.fieldCount ?? 0]);
        break;
      case TC.ARRAY: {
        offset = align(offset, 2);
        toc.push([r.type, 0, offset]);
        arrays.push({
          elementSize: 0,
          values: (r.default as readonly number[] | undefined) ?? [],
          dvIndexOffset: offset,
        });
        // DV index defaults are always stored; DV 0 is the root, so arrays start at 1.
        push(arrays.length, 2);
        offset += 2;
        break;
      }
      case TC.MUTEX:
        offset = align(offset, 4);
        toc.push([r.type, 0, offset]);
        push(0xffffffff, 4);
        offset += 4;
        break;
      default: {
        const size = scalarSize(r.type);
        offset = align(offset, size);
        const value = typeof r.default === 'number' ? r.default : 0;
        toc.push([r.type, value === 0 ? 1 : 0, offset]);
        if (value !== 0) push(value, size);
        offset += size;
      }
    }
  }
  // Element sizes: each array's element record directly follows it.
  let a = 0;
  ds.records.forEach((r, i) => {
    if (r.type === TC.ARRAY && !r.element) {
      arrays[a++]!.elementSize = scalarSize(ds.records[i + 1]!.type);
    }
  });

  const staticSize = align(offset, 4);
  const dvOffset = staticSize;
  const dvCount = arrays.length + 1;
  const dynamic: number[] = [];
  const put16 = (n: number) => dynamic.push(n & 0xff, (n >>> 8) & 0xff);

  // Lay out array data after the dope vector array, each array on a 4-byte boundary.
  let cursor = align(dvOffset + dvCount * 10, 4);
  const placed = arrays.map((arr) => {
    if (arr.values.length === 0) return { ...arr, offset: 0xffff };
    const at = cursor;
    cursor = align(cursor + arr.values.length * arr.elementSize, 4);
    return { ...arr, offset: at };
  });
  // Memory manager list, by ascending offset: the root DV (the DVA itself, which sits
  // right after the static data) first, then the arrays, empty ones last. The firmware
  // compacts memory by walking this list from the end of the static data, so the root
  // must be in it, at the head (the specification's example has head = tail = 0).
  const order = [
    0,
    ...placed
      .map((p, i) => ({ dv: i + 1, offset: p.offset }))
      .sort((x, y) => x.offset - y.offset || x.dv - y.dv)
      .map((x) => x.dv),
  ];
  const next = new Map<number, number>();
  order.forEach((dv, i) => next.set(dv, order[i + 1] ?? 0xffff));

  put16(dvOffset);
  put16(10);
  put16(dvCount);
  put16(0xffff);
  put16(next.get(0) ?? 0xffff);
  placed.forEach((p, i) => {
    put16(p.offset);
    put16(p.elementSize);
    put16(p.values.length);
    put16(0xffff);
    put16(next.get(i + 1) ?? 0xffff);
  });
  for (const p of placed) {
    if (p.offset === 0xffff) continue;
    while (dvOffset + dynamic.length < p.offset) dynamic.push(0);
    for (const v of p.values) {
      for (let b = 0; b < p.elementSize; b++) dynamic.push((v >>> (8 * b)) & 0xff);
    }
  }

  return {
    toc,
    staticSize,
    staticDefaults: Uint8Array.from(staticBytes),
    dynamicDefaults: Uint8Array.from(dynamic),
    initialSize: dvOffset + dynamic.length,
    dopeVectorOffset: dvOffset,
    memMgrHead: 0,
    memMgrTail: order[order.length - 1] ?? 0,
  };
}
