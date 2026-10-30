import { RsrcFormatError, isRsrc } from './rsrc.js';

const TYPE_LIST = 0x34;

/**
 * Rewrites a resource container with some resources' data replaced. Everything else is
 * kept byte for byte: resources keep their order, ids and names; only the data section
 * is laid out again (each item `u32 size` + data, padded to 4 bytes as LabVIEW does)
 * and the offsets in the header, its copy at the start of the index and the resource
 * entries are updated. With no replacements the output equals the input.
 *
 * `replace` maps "TYPE:index" (index = position among resources of that type, in file
 * order, as `parseRsrc` lists them) to new data.
 */
export function rewriteRsrc(
  bytes: Uint8Array,
  replace: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  if (!isRsrc(bytes)) throw new RsrcFormatError('Not a LabVIEW resource file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const indexOffset = view.getUint32(16);
  const indexSize = view.getUint32(20);
  const dataOffset = view.getUint32(24);
  const dataSize = view.getUint32(28);
  if (indexOffset < dataOffset + dataSize) {
    throw new RsrcFormatError('Unexpected layout: the index is not after the data');
  }
  const listBase = indexOffset + TYPE_LIST;
  const typeCount = view.getUint32(listBase) + 1;

  // Every resource entry, with where its data is now.
  const entries: { entry: number; at: number; size: number; data: Uint8Array }[] = [];
  for (let t = 0; t < typeCount; t++) {
    const typeEntry = listBase + 4 + t * 12;
    const type = String.fromCharCode(...bytes.subarray(typeEntry, typeEntry + 4));
    const count = view.getUint32(typeEntry + 4) + 1;
    const first = listBase + view.getUint32(typeEntry + 8);
    for (let i = 0; i < count; i++) {
      const entry = first + i * 20;
      const at = view.getUint32(entry + 12);
      const size = view.getUint32(dataOffset + at);
      const original = bytes.subarray(dataOffset + at + 4, dataOffset + at + 4 + size);
      entries.push({ entry, at, size, data: replace.get(`${type}:${i}`) ?? original });
    }
  }

  // Lay out the data again in its original order.
  const order = [...entries].sort((a, b) => a.at - b.at);
  const newAt = new Map<number, number>();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (const e of order) {
    newAt.set(e.entry, length);
    const padded = Math.ceil((4 + e.data.length) / 4) * 4;
    const chunk = new Uint8Array(padded);
    new DataView(chunk.buffer).setUint32(0, e.data.length);
    chunk.set(e.data, 4);
    chunks.push(chunk);
    length += padded;
  }
  // Whatever followed the last item in the original data section (normally nothing).
  const last = order[order.length - 1];
  const tailStart = last ? dataOffset + last.at + Math.ceil((4 + last.size) / 4) * 4 : dataOffset;
  const tail = bytes.subarray(Math.min(tailStart, dataOffset + dataSize), dataOffset + dataSize);
  const gap = bytes.subarray(dataOffset + dataSize, indexOffset);

  const newDataSize = length + tail.length;
  const newIndexOffset = dataOffset + newDataSize + gap.length;
  const out = new Uint8Array(newIndexOffset + indexSize + (bytes.length - indexOffset - indexSize));
  out.set(bytes.subarray(0, dataOffset));
  let p = dataOffset;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(tail, p);
  p += tail.length;
  out.set(gap, p);
  out.set(bytes.subarray(indexOffset), newIndexOffset);

  const w = new DataView(out.buffer);
  for (const base of [0, newIndexOffset]) {
    w.setUint32(base + 16, newIndexOffset);
    w.setUint32(base + 24, dataOffset);
    w.setUint32(base + 28, newDataSize);
  }
  for (const e of entries)
    w.setUint32(newIndexOffset + (e.entry - indexOffset) + 12, newAt.get(e.entry)!);
  return out;
}
