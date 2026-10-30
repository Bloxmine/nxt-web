import { FILE_NAME_FIELD_LENGTH } from './constants.js';
import { NxtProtocolError } from './errors.js';

/** Builds a telegram with little-endian helpers (docs/spec/telegram.md). */
export class TelegramWriter {
  private readonly bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  s8(value: number): this {
    return this.u8(value < 0 ? value + 0x100 : value);
  }

  u16(value: number): this {
    return this.u8(value).u8(value >> 8);
  }

  u32(value: number): this {
    return this.u8(value)
      .u8(value >>> 8)
      .u8(value >>> 16)
      .u8(value >>> 24);
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  /** Writes a null-padded ASCII string into a fixed-size field. */
  ascii(text: string, fieldLength: number): this {
    const max = fieldLength - 1;
    if (text.length > max) throw new RangeError(`"${text}" is longer than ${max} characters`);
    for (let i = 0; i < fieldLength; i++) {
      const code = i < text.length ? text.charCodeAt(i) : 0;
      if (code > 0x7e || (code < 0x20 && code !== 0)) {
        throw new RangeError(`"${text}" contains a non-ASCII character`);
      }
      this.u8(code);
    }
    return this;
  }

  /** Writes a 20-byte file-name field. */
  fileName(name: string): this {
    return this.ascii(name, FILE_NAME_FIELD_LENGTH);
  }

  raw(data: Uint8Array): this {
    for (const b of data) this.bytes.push(b);
    return this;
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Reads little-endian fields from a reply, with bounds checks. */
export class TelegramReader {
  constructor(private readonly bytes: Uint8Array) {}

  private at(offset: number): number {
    const value = this.bytes[offset];
    if (value === undefined) {
      throw new NxtProtocolError(
        `Reply too short: needed byte ${offset}, got ${this.bytes.length}`,
      );
    }
    return value;
  }

  u8(offset: number): number {
    return this.at(offset);
  }

  s8(offset: number): number {
    const v = this.at(offset);
    return v >= 0x80 ? v - 0x100 : v;
  }

  u16(offset: number): number {
    return this.at(offset) | (this.at(offset + 1) << 8);
  }

  s16(offset: number): number {
    const v = this.u16(offset);
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  u32(offset: number): number {
    return this.s32(offset) >>> 0;
  }

  s32(offset: number): number {
    return (
      this.at(offset) |
      (this.at(offset + 1) << 8) |
      (this.at(offset + 2) << 16) |
      (this.at(offset + 3) << 24)
    );
  }

  bool(offset: number): boolean {
    return this.at(offset) !== 0;
  }

  /** Reads a null-terminated ASCII string from a fixed-size field. */
  ascii(offset: number, fieldLength: number): string {
    let text = '';
    for (let i = 0; i < fieldLength; i++) {
      const code = this.at(offset + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  }

  slice(start: number, end?: number): Uint8Array {
    return this.bytes.slice(start, end);
  }
}
