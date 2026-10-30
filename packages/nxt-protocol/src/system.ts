// System command encoders and reply decoders.
// Every layout here is from docs/spec/system-commands.md (BDK Appendix 1).
import { TelegramReader, TelegramWriter } from './bytes.js';
import { Display, FILE_NAME_FIELD_LENGTH, SystemOpcode, TelegramType } from './constants.js';

function system(opcode: number, reply = true): TelegramWriter {
  return new TelegramWriter()
    .u8(reply ? TelegramType.SystemReply : TelegramType.SystemNoReply)
    .u8(opcode);
}

/** GET FIRMWARE VERSION (0x88). */
export function encodeGetFirmwareVersion(): Uint8Array {
  return system(SystemOpcode.GetFirmwareVersion).done();
}

/** Decoded firmware and protocol versions. */
export interface FirmwareVersion {
  protocol: { major: number; minor: number };
  firmware: { major: number; minor: number };
}

/** Decodes a GET FIRMWARE VERSION reply. */
export function decodeGetFirmwareVersion(reply: Uint8Array): FirmwareVersion {
  const r = new TelegramReader(reply);
  return {
    protocol: { minor: r.u8(3), major: r.u8(4) },
    firmware: { minor: r.u8(5), major: r.u8(6) },
  };
}

/** Formats a firmware version the way the brick shows it, e.g. "1.31". */
export function formatVersion(v: { major: number; minor: number }): string {
  return `${v.major}.${v.minor.toString().padStart(2, '0')}`;
}

/** GET DEVICE INFO (0x9B). */
export function encodeGetDeviceInfo(): Uint8Array {
  return system(SystemOpcode.GetDeviceInfo).done();
}

/** Decoded GET DEVICE INFO reply. */
export interface DeviceInfo {
  name: string;
  /** Bluetooth address as "00:16:53:xx:xx:xx". */
  bluetoothAddress: string;
  bluetoothSignalStrength: number;
  freeFlashBytes: number;
}

/** Decodes a GET DEVICE INFO reply (33 bytes). */
export function decodeGetDeviceInfo(reply: Uint8Array): DeviceInfo {
  const r = new TelegramReader(reply);
  const address = Array.from(r.slice(18, 24), (b) => b.toString(16).padStart(2, '0'));
  return {
    name: r.ascii(3, 15),
    bluetoothAddress: address.join(':').toUpperCase(),
    bluetoothSignalStrength: r.u32(25),
    freeFlashBytes: r.u32(29),
  };
}

/** SET BRICK NAME (0x98). Up to 15 characters. */
export function encodeSetBrickName(name: string): Uint8Array {
  return system(SystemOpcode.SetBrickName).ascii(name, 16).done();
}

/** FIND FIRST (0x86). */
export function encodeFindFirst(pattern: string): Uint8Array {
  return system(SystemOpcode.FindFirst).fileName(pattern).done();
}

/** FIND NEXT (0x87). */
export function encodeFindNext(handle: number): Uint8Array {
  return system(SystemOpcode.FindNext).u8(handle).done();
}

/** One FIND FIRST / FIND NEXT result. */
export interface FoundFile {
  handle: number;
  name: string;
  size: number;
}

/** Decodes a FIND FIRST or FIND NEXT reply (28 bytes). */
export function decodeFind(reply: Uint8Array): FoundFile {
  const r = new TelegramReader(reply);
  return { handle: r.u8(3), name: r.ascii(4, FILE_NAME_FIELD_LENGTH), size: r.u32(24) };
}

/** OPEN READ (0x80). */
export function encodeOpenRead(fileName: string): Uint8Array {
  return system(SystemOpcode.OpenRead).fileName(fileName).done();
}

/** Decodes an OPEN READ reply. */
export function decodeOpenRead(reply: Uint8Array): { handle: number; size: number } {
  const r = new TelegramReader(reply);
  return { handle: r.u8(3), size: r.u32(4) };
}

/** OPEN WRITE (0x81). */
export function encodeOpenWrite(fileName: string, size: number): Uint8Array {
  return system(SystemOpcode.OpenWrite).fileName(fileName).u32(size).done();
}

/** OPEN WRITE LINEAR (0x89). */
export function encodeOpenWriteLinear(fileName: string, size: number): Uint8Array {
  return system(SystemOpcode.OpenWriteLinear).fileName(fileName).u32(size).done();
}

/** Decodes the handle from an OPEN WRITE / OPEN WRITE LINEAR / OPEN WRITE DATA reply. */
export function decodeHandle(reply: Uint8Array): number {
  return new TelegramReader(reply).u8(3);
}

/** READ (0x82): reads up to `count` bytes from an open file. */
export function encodeRead(handle: number, count: number): Uint8Array {
  return system(SystemOpcode.Read).u8(handle).u16(count).done();
}

/** Decodes the data from a READ reply (bytes 4–5 count, 6.. data). */
export function decodeRead(reply: Uint8Array): Uint8Array {
  const count = new TelegramReader(reply).u16(4);
  return reply.slice(6, 6 + count);
}

/** WRITE (0x83): appends data to an open file. */
export function encodeWrite(handle: number, data: Uint8Array): Uint8Array {
  return system(SystemOpcode.Write).u8(handle).raw(data).done();
}

/** Decodes the number of bytes written from a WRITE reply. */
export function decodeWrite(reply: Uint8Array): number {
  return new TelegramReader(reply).u16(4);
}

/** CLOSE (0x84). */
export function encodeClose(handle: number): Uint8Array {
  return system(SystemOpcode.Close).u8(handle).done();
}

/** DELETE (0x85). */
export function encodeDelete(fileName: string): Uint8Array {
  return system(SystemOpcode.Delete).fileName(fileName).done();
}

/** READ IO MAP (0x94): `count` bytes at `offset` in a module's IO map. */
export function encodeReadIoMap(moduleId: number, offset: number, count: number): Uint8Array {
  return system(SystemOpcode.ReadIoMap).u32(moduleId).u16(offset).u16(count).done();
}

/** Decodes the data from a READ IO MAP reply (bytes 7–8 count, 9.. data). */
export function decodeReadIoMap(reply: Uint8Array): Uint8Array {
  const count = new TelegramReader(reply).u16(7);
  return reply.slice(9, 9 + count);
}

/**
 * Turns the display module's 800-byte screen buffer into one byte per pixel (1 = dark),
 * rows from the top. Layout: docs/spec/display-iomap.md.
 */
export function decodeScreen(buffer: Uint8Array): Uint8Array {
  const pixels = new Uint8Array(Display.Width * Display.Height);
  for (let y = 0; y < Display.Height; y++) {
    const line = (y >> 3) * Display.Width;
    const bit = 1 << (y & 7);
    for (let x = 0; x < Display.Width; x++) {
      pixels[y * Display.Width + x] = (buffer[line + x] ?? 0) & bit ? 1 : 0;
    }
  }
  return pixels;
}
