// Direct command encoders and reply decoders.
// Every layout here is from docs/spec/direct-commands.md (BDK Appendix 2).
import { TelegramReader, TelegramWriter } from './bytes.js';
import {
  type ALL_OUTPUTS,
  DirectOpcode,
  TelegramType,
  type InputPort,
  type OutputPort,
} from './constants.js';

function direct(opcode: number, reply: boolean): TelegramWriter {
  return new TelegramWriter()
    .u8(reply ? TelegramType.DirectReply : TelegramType.DirectNoReply)
    .u8(opcode);
}

/** STARTPROGRAM (0x00). */
export function encodeStartProgram(fileName: string, reply = true): Uint8Array {
  return direct(DirectOpcode.StartProgram, reply).fileName(fileName).done();
}

/** STOPPROGRAM (0x01). */
export function encodeStopProgram(reply = true): Uint8Array {
  return direct(DirectOpcode.StopProgram, reply).done();
}

/** PLAYSOUNDFILE (0x02). */
export function encodePlaySoundFile(fileName: string, loop: boolean, reply = true): Uint8Array {
  return direct(DirectOpcode.PlaySoundFile, reply).bool(loop).fileName(fileName).done();
}

/** PLAYTONE (0x03). Frequency 200–14000 Hz, duration in ms. */
export function encodePlayTone(frequencyHz: number, durationMs: number, reply = true): Uint8Array {
  if (frequencyHz < 200 || frequencyHz > 14000) {
    throw new RangeError('Tone frequency must be 200–14000 Hz');
  }
  return direct(DirectOpcode.PlayTone, reply).u16(frequencyHz).u16(durationMs).done();
}

/** Fields of SETOUTPUTSTATE / GETOUTPUTSTATE. */
export interface OutputState {
  /** −100..100 */
  power: number;
  /** Bit field of OutputMode values. */
  mode: number;
  /** A RegulationMode value. */
  regulationMode: number;
  /** −100..100 */
  turnRatio: number;
  /** A RunState value. */
  runState: number;
  /** Degrees to turn before stopping; 0 runs forever. */
  tachoLimit: number;
}

/**
 * SETOUTPUTSTATE (0x04). The tacho limit is a 4-byte ULONG, so the telegram is
 * 12 bytes (see the note in docs/spec/direct-commands.md).
 */
export function encodeSetOutputState(
  port: OutputPort | typeof ALL_OUTPUTS,
  state: OutputState,
  reply = true,
): Uint8Array {
  return direct(DirectOpcode.SetOutputState, reply)
    .u8(port)
    .s8(clamp(state.power, -100, 100))
    .u8(state.mode)
    .u8(state.regulationMode)
    .s8(clamp(state.turnRatio, -100, 100))
    .u8(state.runState)
    .u32(state.tachoLimit)
    .done();
}

/** SETINPUTMODE (0x05). */
export function encodeSetInputMode(
  port: InputPort,
  sensorType: number,
  sensorMode: number,
  reply = true,
): Uint8Array {
  return direct(DirectOpcode.SetInputMode, reply).u8(port).u8(sensorType).u8(sensorMode).done();
}

/** GETOUTPUTSTATE (0x06). */
export function encodeGetOutputState(port: OutputPort): Uint8Array {
  return direct(DirectOpcode.GetOutputState, true).u8(port).done();
}

/** Decoded GETOUTPUTSTATE reply. */
export interface OutputStateReply extends OutputState {
  port: number;
  tachoCount: number;
  blockTachoCount: number;
  rotationCount: number;
}

/** Decodes a GETOUTPUTSTATE reply (25 bytes). */
export function decodeGetOutputState(reply: Uint8Array): OutputStateReply {
  const r = new TelegramReader(reply);
  return {
    port: r.u8(3),
    power: r.s8(4),
    mode: r.u8(5),
    regulationMode: r.u8(6),
    turnRatio: r.s8(7),
    runState: r.u8(8),
    tachoLimit: r.u32(9),
    tachoCount: r.s32(13),
    blockTachoCount: r.s32(17),
    rotationCount: r.s32(21),
  };
}

/** GETINPUTVALUES (0x07). */
export function encodeGetInputValues(port: InputPort): Uint8Array {
  return direct(DirectOpcode.GetInputValues, true).u8(port).done();
}

/** Decoded GETINPUTVALUES reply. */
export interface InputValues {
  port: number;
  valid: boolean;
  calibrated: boolean;
  sensorType: number;
  sensorMode: number;
  raw: number;
  normalized: number;
  scaled: number;
  calibratedValue: number;
}

/** Decodes a GETINPUTVALUES reply (16 bytes). */
export function decodeGetInputValues(reply: Uint8Array): InputValues {
  const r = new TelegramReader(reply);
  return {
    port: r.u8(3),
    valid: r.bool(4),
    calibrated: r.bool(5),
    sensorType: r.u8(6),
    sensorMode: r.u8(7),
    raw: r.u16(8),
    normalized: r.u16(10),
    scaled: r.s16(12),
    calibratedValue: r.s16(14),
  };
}

/** RESETINPUTSCALEDVALUE (0x08). */
export function encodeResetInputScaledValue(port: InputPort, reply = true): Uint8Array {
  return direct(DirectOpcode.ResetInputScaledValue, reply).u8(port).done();
}

/** RESETMOTORPOSITION (0x0A). */
export function encodeResetMotorPosition(
  port: OutputPort,
  relative: boolean,
  reply = true,
): Uint8Array {
  return direct(DirectOpcode.ResetMotorPosition, reply).u8(port).bool(relative).done();
}

/** GETBATTERYLEVEL (0x0B). */
export function encodeGetBatteryLevel(): Uint8Array {
  return direct(DirectOpcode.GetBatteryLevel, true).done();
}

/** Decodes a GETBATTERYLEVEL reply into millivolts. */
export function decodeGetBatteryLevel(reply: Uint8Array): number {
  return new TelegramReader(reply).u16(3);
}

/** STOPSOUNDPLAYBACK (0x0C). */
export function encodeStopSoundPlayback(reply = true): Uint8Array {
  return direct(DirectOpcode.StopSoundPlayback, reply).done();
}

/** KEEPALIVE (0x0D). */
export function encodeKeepAlive(reply = true): Uint8Array {
  return direct(DirectOpcode.KeepAlive, reply).done();
}

/** Decodes a KEEPALIVE reply into the sleep time limit in ms. */
export function decodeKeepAlive(reply: Uint8Array): number {
  return new TelegramReader(reply).u32(3);
}

/** LSGETSTATUS (0x0E). */
export function encodeLsGetStatus(port: InputPort): Uint8Array {
  return direct(DirectOpcode.LsGetStatus, true).u8(port).done();
}

/** Decodes an LSGETSTATUS reply into the number of bytes ready. */
export function decodeLsGetStatus(reply: Uint8Array): number {
  return new TelegramReader(reply).u8(3);
}

/** LSWRITE (0x0F). At most 16 bytes each way. */
export function encodeLsWrite(
  port: InputPort,
  tx: Uint8Array,
  rxLength: number,
  reply = true,
): Uint8Array {
  if (tx.length > 16 || rxLength > 16) throw new RangeError('LS transfers are limited to 16 bytes');
  return direct(DirectOpcode.LsWrite, reply).u8(port).u8(tx.length).u8(rxLength).raw(tx).done();
}

/** LSREAD (0x10). */
export function encodeLsRead(port: InputPort): Uint8Array {
  return direct(DirectOpcode.LsRead, true).u8(port).done();
}

/** Decodes an LSREAD reply into the bytes read. */
export function decodeLsRead(reply: Uint8Array): Uint8Array {
  const r = new TelegramReader(reply);
  const count = r.u8(3);
  return r.slice(4, 4 + count);
}

/** GETCURRENTPROGRAMNAME (0x11). */
export function encodeGetCurrentProgramName(): Uint8Array {
  return direct(DirectOpcode.GetCurrentProgramName, true).done();
}

/** Decodes a GETCURRENTPROGRAMNAME reply. */
export function decodeGetCurrentProgramName(reply: Uint8Array): string {
  return new TelegramReader(reply).ascii(3, 20);
}

/** MESSAGEWRITE (0x09). The text is sent null-terminated; at most 58 characters. */
export function encodeMessageWrite(inbox: number, text: string, reply = true): Uint8Array {
  if (inbox < 0 || inbox > 9) throw new RangeError('Inbox must be 0–9');
  const size = text.length + 1;
  if (size > 59) throw new RangeError('Message must be at most 58 characters');
  return direct(DirectOpcode.MessageWrite, reply).u8(inbox).u8(size).ascii(text, size).done();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
