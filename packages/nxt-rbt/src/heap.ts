import { ByteReader } from './bytes.js';

/**
 * Block-diagram heap ("BDHP", LabVIEW 5–7). Not documented anywhere; the
 * layout below was worked out from sample files (see docs/rbt-compat.md).
 *
 * After a 56-byte header the heap is a run of blocks:
 *   - used block:  u32 size (even, includes header), u32 ?, u32 class id, body…
 *   - free block:  u32 size | 1, …
 * Objects refer to each other by the offset of their body (block + 12).
 * Every object's body starts with u32 flags, u32 owner.
 */
export interface HeapObject {
  /** Offset of the body; other objects use this as the pointer. */
  ptr: number;
  size: number;
  cls: number;
}

/** Object classes identified so far. */
export const HeapClass = {
  Label: 7,
  Connection: 21,
  FrontPanelTerminal: 22,
  Wire: 23,
  WireGeometry: 24,
  Diagram: 27,
  DiagramTerminals: 29,
  Loop: 33,
  LoopTunnel: 34,
  LoopIteration: 36,
  LoopCondition: 37,
  Switch: 44,
  SwitchTunnel: 45,
  SwitchSelector: 46,
  Node: 49,
  NodeTerminal: 51,
  NodeIcon: 204,
} as const;

export class Heap {
  readonly r: ByteReader;
  readonly objects = new Map<number, HeapObject>();
  private readonly byOwner = new Map<number, HeapObject[]>();

  constructor(bytes: Uint8Array) {
    this.r = new ByteReader(bytes);
    let o = 56;
    while (o + 8 <= bytes.length) {
      const s = this.r.u32(o);
      if (s & 1) {
        const size = s & ~1;
        if (size < 8) break;
        o += size;
        continue;
      }
      if (s < 12 || o + s > bytes.length) break;
      const obj: HeapObject = { ptr: o + 12, size: s, cls: this.r.u32(o + 8) };
      this.objects.set(obj.ptr, obj);
      o += s;
    }
    for (const obj of this.objects.values()) {
      const owner = this.owner(obj.ptr);
      const list = this.byOwner.get(owner);
      if (list) list.push(obj);
      else this.byOwner.set(owner, [obj]);
    }
  }

  /** u32 field at byte `offset` of an object's body. */
  field(ptr: number, offset: number): number {
    return this.r.u32(ptr + offset);
  }

  /** The object's owner pointer (second body word). */
  owner(ptr: number): number {
    return this.r.u32(ptr + 4);
  }

  get(ptr: number): HeapObject | undefined {
    return this.objects.get(ptr);
  }

  cls(ptr: number): number | undefined {
    return this.objects.get(ptr)?.cls;
  }

  /** Objects owned by `ptr`, optionally of one class. */
  children(ptr: number, cls?: number): HeapObject[] {
    const all = this.byOwner.get(ptr) ?? [];
    return cls === undefined ? all : all.filter((o) => o.cls === cls);
  }

  /** Screen rectangle (top, left, bottom, right) stored at `offset` in a body. */
  rect(ptr: number, offset: number): { top: number; left: number; bottom: number; right: number } {
    return {
      top: this.r.i16(ptr + offset),
      left: this.r.i16(ptr + offset + 2),
      bottom: this.r.i16(ptr + offset + 4),
      right: this.r.i16(ptr + offset + 6),
    };
  }

  ofClass(cls: number): HeapObject[] {
    return [...this.objects.values()].filter((o) => o.cls === cls);
  }
}
