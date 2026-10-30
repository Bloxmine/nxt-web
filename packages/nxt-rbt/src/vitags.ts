import { ByteReader } from './bytes.js';
import { parseTypeDesc, readFlattened, type LvValue } from './lvtype.js';

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
