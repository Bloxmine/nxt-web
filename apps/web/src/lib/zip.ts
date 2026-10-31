/** CRC-32 (the zip polynomial). */
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

/** A .zip archive holding the files uncompressed (enough for a handful of small files). */
export function storeZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], n: number) => a.push(n & 0xff, (n >>> 8) & 0xff);
  const u32 = (a: number[], n: number) => {
    u16(a, n & 0xffff);
    u16(a, n >>> 16);
  };
  for (const f of files) {
    const name = Array.from(new TextEncoder().encode(f.name));
    const crc = crc32(f.bytes);
    const offset = out.length;
    // Local file header: version 10, no flags, stored, no date.
    u32(out, 0x04034b50);
    [10, 0, 0, 0, 0x21].forEach((n) => u16(out, n));
    u32(out, crc);
    u32(out, f.bytes.length);
    u32(out, f.bytes.length);
    u16(out, name.length);
    u16(out, 0);
    out.push(...name, ...f.bytes);
    // Central directory entry.
    u32(central, 0x02014b50);
    [20, 10, 0, 0, 0, 0x21].forEach((n) => u16(central, n));
    u32(central, crc);
    u32(central, f.bytes.length);
    u32(central, f.bytes.length);
    [name.length, 0, 0, 0, 0].forEach((n) => u16(central, n));
    u32(central, 0);
    u32(central, offset);
    central.push(...name);
  }
  const centralOffset = out.length;
  out.push(...central);
  // End of central directory.
  u32(out, 0x06054b50);
  [0, 0, files.length, files.length].forEach((n) => u16(out, n));
  u32(out, central.length);
  u32(out, centralOffset);
  u16(out, 0);
  return Uint8Array.from(out);
}
