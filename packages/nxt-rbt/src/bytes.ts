/** Big-endian byte reader with bounds checks. LabVIEW files are big-endian. */
export class ByteReader {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length(): number {
    return this.bytes.length;
  }
  check(offset: number, length: number): void {
    if (offset < 0 || offset + length > this.bytes.length) {
      throw new RangeError(
        `Read past end (offset ${offset}, length ${length}, size ${this.bytes.length})`,
      );
    }
  }
  u8(o: number): number {
    this.check(o, 1);
    return this.bytes[o]!;
  }
  i8(o: number): number {
    this.check(o, 1);
    return this.view.getInt8(o);
  }
  u16(o: number): number {
    this.check(o, 2);
    return this.view.getUint16(o);
  }
  i16(o: number): number {
    this.check(o, 2);
    return this.view.getInt16(o);
  }
  u32(o: number): number {
    this.check(o, 4);
    return this.view.getUint32(o);
  }
  i32(o: number): number {
    this.check(o, 4);
    return this.view.getInt32(o);
  }
  f32(o: number): number {
    this.check(o, 4);
    return this.view.getFloat32(o);
  }
  f64(o: number): number {
    this.check(o, 8);
    return this.view.getFloat64(o);
  }
  /** Latin-1 text of `length` bytes. */
  text(o: number, length: number): string {
    this.check(o, length);
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(this.bytes[o + i]!);
    return s;
  }
  /** Pascal string: one length byte, then text. Returns the string and the offset after it. */
  pstr(o: number): [string, number] {
    const n = this.u8(o);
    return [this.text(o + 1, n), o + 1 + n];
  }
  slice(start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, end);
  }
}
