/**
 * Reader for the LabVIEW resource container ("RSRC") that classic NXT-G .rbt
 * files use. There is no published specification; the layout below was worked
 * out from sample files and is documented in docs/rbt-compat.md. All values
 * are big-endian.
 *
 *   0x00  "RSRC\r\n"  u16 format version  4cc file type ("LVIN")  4cc creator ("LBVW")
 *   0x10  u32 index offset   u32 index size   u32 data offset   u32 data size
 *
 * The index starts with a copy of that header. At index+0x34 is the number of
 * resource types minus one, followed by 12-byte type entries
 * (4cc type, u32 count-1, u32 offset from index+0x34). Each type points to
 * 20-byte resource entries (i32 id, i32 name offset, u32 ?, u32 data offset
 * from the data section, u32 ?). A resource's data is a u32 size then bytes.
 */

/** One resource in the container. */
export interface Resource {
  type: string;
  id: number;
  data: Uint8Array;
}

/** A parsed container: file type and all resources. */
export interface RsrcFile {
  version: number;
  fileType: string;
  creator: string;
  resources: Resource[];
}

/** The file is not a resource container or is damaged. */
export class RsrcFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RsrcFormatError';
  }
}

const MAGIC = [0x52, 0x53, 0x52, 0x43, 0x0d, 0x0a]; // "RSRC\r\n"
const TYPE_LIST = 0x34;

class Reader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  check(offset: number, length: number): void {
    if (offset < 0 || offset + length > this.bytes.length) {
      throw new RsrcFormatError(`File is truncated (needed bytes ${offset}–${offset + length})`);
    }
  }
  u16(o: number): number {
    this.check(o, 2);
    return this.view.getUint16(o);
  }
  u32(o: number): number {
    this.check(o, 4);
    return this.view.getUint32(o);
  }
  i32(o: number): number {
    this.check(o, 4);
    return this.view.getInt32(o);
  }
  fourCC(o: number): string {
    this.check(o, 4);
    return String.fromCharCode(...this.bytes.subarray(o, o + 4));
  }
}

/** True if the bytes start with the resource container signature. */
export function isRsrc(bytes: Uint8Array): boolean {
  return MAGIC.every((b, i) => bytes[i] === b);
}

/** Parses a resource container. Throws {@link RsrcFormatError} if it is not one. */
export function parseRsrc(bytes: Uint8Array): RsrcFile {
  if (!isRsrc(bytes)) throw new RsrcFormatError('Not a LabVIEW resource file (.rbt)');
  const r = new Reader(bytes);
  const version = r.u16(6);
  const fileType = r.fourCC(8);
  const creator = r.fourCC(12);
  const indexOffset = r.u32(16);
  const dataOffset = r.u32(24);

  const listBase = indexOffset + TYPE_LIST;
  const typeCount = r.u32(listBase) + 1;
  if (typeCount > 1000) throw new RsrcFormatError('Implausible resource type count');
  const resources: Resource[] = [];
  for (let t = 0; t < typeCount; t++) {
    const entry = listBase + 4 + t * 12;
    const type = r.fourCC(entry);
    const count = r.u32(entry + 4) + 1;
    const first = listBase + r.u32(entry + 8);
    if (count > 100000) throw new RsrcFormatError('Implausible resource count');
    for (let i = 0; i < count; i++) {
      const e = first + i * 20;
      const id = r.i32(e);
      const at = dataOffset + r.u32(e + 12);
      const size = r.u32(at);
      r.check(at + 4, size);
      resources.push({ type, id, data: bytes.subarray(at + 4, at + 4 + size) });
    }
  }
  return { version, fileType, creator, resources };
}

/** Resources of one type, in file order. */
export function resourcesOfType(file: RsrcFile, type: string): Resource[] {
  return file.resources.filter((res) => res.type === type);
}

/**
 * Names of the sub-VIs a program links to (e.g. "Sound.vi", "Display.vi").
 * A first, heuristic look at which blocks a program uses: it scans the
 * linker-info and VI-instance resources for ".vi" names.
 */
export function linkedViNames(file: RsrcFile): string[] {
  const names = new Set<string>();
  for (const res of file.resources) {
    if (!['LIvi', 'LIbd', 'LIds', 'VINS'].includes(res.type)) continue;
    let current = '';
    for (const byte of res.data) {
      if (byte >= 0x20 && byte < 0x7f) {
        current += String.fromCharCode(byte);
      } else {
        const match = /([A-Za-z0-9 _#.-]+\.vi)$/i.exec(current);
        const name = match?.[1]?.trim();
        if (name && name.length > 3 && !/Instance|Saved/.test(name)) names.add(name);
        current = '';
      }
    }
  }
  return [...names].sort();
}
