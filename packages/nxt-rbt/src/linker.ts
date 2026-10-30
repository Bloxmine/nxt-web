import { ByteReader } from './bytes.js';
import { parseTypeDesc, type TypeDesc } from './lvtype.js';

const LVIN = [0x4c, 0x56, 0x49, 0x4e];

function* lvinEntries(bytes: Uint8Array): Generator<{ name: string; after: number }> {
  const r = new ByteReader(bytes);
  for (let i = 0; i + 5 < bytes.length; i++) {
    if (LVIN.every((b, k) => bytes[i + k] === b)) {
      const n = bytes[i + 4]!;
      if (i + 5 + n > bytes.length) continue;
      const name = r.text(i + 5, n);
      let after = i + 5 + n;
      if ((n + 1) % 2) after++;
      yield { name, after };
    }
  }
}

function instanceNumber(name: string): number | null {
  const m = /^Instance +(\d+) /.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * Block-diagram linker info ("LIbd"): for each block instance, the heap
 * pointers of the nodes that use it. Returns node pointer → instance number.
 */
export function parseInstanceNodes(bytes: Uint8Array): Map<number, number> {
  const r = new ByteReader(bytes);
  const map = new Map<number, number>();
  for (const { name, after } of lvinEntries(bytes)) {
    const n = instanceNumber(name);
    if (n === null) continue;
    const count = r.u32(after);
    if (count > 64) continue;
    for (let k = 0; k < count; k++) map.set(r.u32(after + 4 + 4 * k), n);
  }
  return map;
}

/**
 * VI linker info ("LIvi"): for each instance, its connector pane — the
 * plugs in slot order. A node terminal's slot number indexes this list.
 */
export function parseConnectorPanes(bytes: Uint8Array): Map<number, TypeDesc[]> {
  const r = new ByteReader(bytes);
  const map = new Map<number, TypeDesc[]>();
  for (const { name, after } of lvinEntries(bytes)) {
    const n = instanceNumber(name);
    if (n === null || map.has(n)) continue;
    try {
      // u32 count (1), i32 -1, then a connector-pane descriptor (type 0xF0):
      //   u16 size, u8 flags, u8 0xF0, u16 slot count, u16 ?, u16 per slot
      //   (0 = unused; high byte = usage flags, low byte = paired slot),
      // then one type descriptor per slot. The list runs past the 0xF0 size.
      const td = after + 8;
      if (r.u8(td + 3) !== 0xf0) continue;
      const slots = r.u16(td + 4);
      const entries: number[] = [];
      for (let k = 0; k < slots; k++) entries.push(r.u16(td + 8 + 2 * k));
      // One descriptor per slot follows (unused slots: an empty 4-byte one).
      let p = td + 8 + 2 * slots;
      const plugs: TypeDesc[] = new Array(slots);
      for (let k = 0; k < slots; k++) {
        const [t, q] = parseTypeDesc(r, p);
        if (entries[k] !== 0) plugs[k] = t;
        p = q;
      }
      map.set(n, plugs);
    } catch {
      // Unknown layout: leave this instance without plug names.
    }
  }
  return map;
}
