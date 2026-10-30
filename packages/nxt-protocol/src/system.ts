// System command encoders and reply decoders.
// Every layout here is from docs/spec/system-commands.md (BDK Appendix 1).
import { TelegramReader, TelegramWriter } from './bytes.js';
import { FILE_NAME_FIELD_LENGTH, SystemOpcode, TelegramType } from './constants.js';

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

/** CLOSE (0x84). */
export function encodeClose(handle: number): Uint8Array {
  return system(SystemOpcode.Close).u8(handle).done();
}

/** DELETE (0x85). */
export function encodeDelete(fileName: string): Uint8Array {
  return system(SystemOpcode.Delete).fileName(fileName).done();
}
