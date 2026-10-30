import type { Transport } from '@nxt/transport';
import { TelegramReader } from './bytes.js';
import {
  type ALL_OUTPUTS,
  OutputMode,
  RegulationMode,
  RunState,
  MAX_READ_CHUNK,
  MAX_WRITE_CHUNK,
  SensorMode,
  SensorType,
  Status,
  TelegramType,
  type InputPort,
  type OutputPort,
} from './constants.js';
import * as d from './direct.js';
import { NxtProtocolError, NxtStatusError } from './errors.js';
import * as s from './system.js';

/** Options for {@link NxtClient}. */
export interface NxtClientOptions {
  /** How long to wait for each reply. Default 1000 ms. */
  timeoutMs?: number;
}

/** Brick name, versions and battery, as shown in the device panel. */
export interface BrickSummary {
  name: string;
  firmware: string;
  protocol: string;
  batteryMillivolts: number;
  bluetoothAddress: string;
  freeFlashBytes: number;
}

/**
 * High-level access to one brick. Every request goes through a single queue,
 * so callers never interleave telegrams. Each reply is matched to its request
 * by opcode; stale replies from timed-out requests are discarded.
 */
export class NxtClient {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly timeoutMs: number;

  constructor(
    readonly transport: Transport,
    options: NxtClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 1000;
  }

  /**
   * Sends a telegram. If byte 0 asks for a reply, waits for it, checks the
   * status byte and returns the reply. Throws {@link NxtStatusError} on a
   * non-zero status.
   */
  request(telegram: Uint8Array, timeoutMs = this.timeoutMs): Promise<Uint8Array | undefined> {
    const run = this.queue.then(() => this.exchange(telegram, timeoutMs));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Like {@link request} but always expects a reply. */
  async call(telegram: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const reply = await this.request(telegram, timeoutMs);
    if (!reply) throw new NxtProtocolError('Expected a reply but the command asked for none');
    return reply;
  }

  private async exchange(telegram: Uint8Array, timeoutMs: number): Promise<Uint8Array | undefined> {
    const type = telegram[0];
    const opcode = telegram[1];
    if (type === undefined || opcode === undefined) throw new RangeError('Empty telegram');
    const wantsReply = (type & 0x80) === 0;
    const isSystem = (type & 0x01) === 1;

    if (wantsReply) this.transport.drain();
    await this.transport.send(telegram);
    if (!wantsReply) return undefined;

    // Skip any reply that does not belong to this request (e.g. a late reply).
    for (;;) {
      const reply = await this.transport.receive(timeoutMs);
      if (reply[0] !== TelegramType.Reply || reply[1] !== opcode) continue;
      const status = new TelegramReader(reply).u8(2);
      if (status !== Status.Success) throw new NxtStatusError(opcode, status, isSystem);
      return reply;
    }
  }

  // ----- Direct commands -----

  /** Plays a tone. Frequency 200–14000 Hz. */
  async playTone(frequencyHz: number, durationMs: number): Promise<void> {
    await this.request(d.encodePlayTone(frequencyHz, durationMs));
  }

  /** Stops any sound that is playing. */
  async stopSound(): Promise<void> {
    await this.request(d.encodeStopSoundPlayback());
  }

  /** Battery voltage in millivolts. */
  async getBatteryLevel(): Promise<number> {
    return d.decodeGetBatteryLevel(await this.call(d.encodeGetBatteryLevel()));
  }

  /** Keeps the brick from going to sleep; returns its sleep timeout in ms. */
  async keepAlive(): Promise<number> {
    return d.decodeKeepAlive(await this.call(d.encodeKeepAlive()));
  }

  /** Sets an output's state. */
  async setOutputState(port: OutputPort | typeof ALL_OUTPUTS, state: d.OutputState): Promise<void> {
    await this.request(d.encodeSetOutputState(port, state));
  }

  /** Runs a motor at a speed-regulated power (−100..100) until stopped. */
  async runMotor(port: OutputPort, power: number): Promise<void> {
    await this.setOutputState(port, {
      power,
      mode: OutputMode.MotorOn | OutputMode.Brake | OutputMode.Regulated,
      regulationMode: RegulationMode.MotorSpeed,
      turnRatio: 0,
      runState: RunState.Running,
      tachoLimit: 0,
    });
  }

  /** Stops a motor (or all with 0xFF), braking or coasting. */
  async stopMotor(port: OutputPort | typeof ALL_OUTPUTS, brake = true): Promise<void> {
    await this.setOutputState(port, {
      power: 0,
      mode: brake ? OutputMode.MotorOn | OutputMode.Brake | OutputMode.Regulated : 0,
      regulationMode: brake ? RegulationMode.MotorSpeed : RegulationMode.Idle,
      turnRatio: 0,
      runState: brake ? RunState.Running : RunState.Idle,
      tachoLimit: 0,
    });
  }

  /** Reads an output's state and tacho counters. */
  async getOutputState(port: OutputPort): Promise<d.OutputStateReply> {
    return d.decodeGetOutputState(await this.call(d.encodeGetOutputState(port)));
  }

  /** Resets a motor's position counter. */
  async resetMotorPosition(port: OutputPort, relative = false): Promise<void> {
    await this.request(d.encodeResetMotorPosition(port, relative));
  }

  /** Configures a sensor port. */
  async setInputMode(port: InputPort, sensorType: number, sensorMode: number): Promise<void> {
    await this.request(d.encodeSetInputMode(port, sensorType, sensorMode));
  }

  /** Reads a sensor port. */
  async getInputValues(port: InputPort): Promise<d.InputValues> {
    return d.decodeGetInputValues(await this.call(d.encodeGetInputValues(port)));
  }

  /** Starts a program already on the brick, e.g. "drive.rxe". */
  async startProgram(fileName: string): Promise<void> {
    await this.request(d.encodeStartProgram(fileName));
  }

  /** Stops the running program. Does nothing if none is running. */
  async stopProgram(): Promise<void> {
    try {
      await this.request(d.encodeStopProgram());
    } catch (error) {
      if (!(error instanceof NxtStatusError && error.status === Status.NoActiveProgram))
        throw error;
    }
  }

  /** Name of the running program, or null when none is running. */
  async getCurrentProgramName(): Promise<string | null> {
    try {
      return d.decodeGetCurrentProgramName(await this.call(d.encodeGetCurrentProgramName()));
    } catch (error) {
      if (error instanceof NxtStatusError && error.status === Status.NoActiveProgram) return null;
      throw error;
    }
  }

  // ----- System commands -----

  /** Firmware and protocol versions. */
  async getFirmwareVersion(): Promise<s.FirmwareVersion> {
    return s.decodeGetFirmwareVersion(await this.call(s.encodeGetFirmwareVersion()));
  }

  /** Name, Bluetooth address and free flash. */
  async getDeviceInfo(): Promise<s.DeviceInfo> {
    return s.decodeGetDeviceInfo(await this.call(s.encodeGetDeviceInfo()));
  }

  /** Renames the brick (up to 15 characters). */
  async setBrickName(name: string): Promise<void> {
    await this.request(s.encodeSetBrickName(name));
  }

  /** Everything the device panel shows, in one call. */
  async getSummary(): Promise<BrickSummary> {
    const info = await this.getDeviceInfo();
    const version = await this.getFirmwareVersion();
    const batteryMillivolts = await this.getBatteryLevel();
    return {
      name: info.name,
      firmware: s.formatVersion(version.firmware),
      protocol: s.formatVersion(version.protocol),
      batteryMillivolts,
      bluetoothAddress: info.bluetoothAddress,
      freeFlashBytes: info.freeFlashBytes,
    };
  }

  /**
   * Uploads a file, replacing one with the same name. Programs (.rxe) and other files
   * the firmware reads in place are written with OPEN WRITE LINEAR (docs/spec).
   */
  async uploadFile(
    fileName: string,
    data: Uint8Array,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<void> {
    const linear = /\.(rxe|ric|rso)$/i.test(fileName);
    const open = () =>
      this.call(
        linear
          ? s.encodeOpenWriteLinear(fileName, data.length)
          : s.encodeOpenWrite(fileName, data.length),
      );
    let reply: Uint8Array;
    try {
      reply = await open();
    } catch (error) {
      if (!(error instanceof NxtStatusError && error.status === Status.FileExists)) throw error;
      await this.call(s.encodeDelete(fileName));
      reply = await open();
    }
    const handle = s.decodeHandle(reply);
    try {
      for (let sent = 0; sent < data.length;) {
        const chunk = data.subarray(sent, sent + MAX_WRITE_CHUNK);
        const written = s.decodeWrite(await this.call(s.encodeWrite(handle, chunk)));
        if (written !== chunk.length)
          throw new Error(`Only ${written} of ${chunk.length} bytes were written`);
        sent += chunk.length;
        onProgress?.(sent, data.length);
      }
    } finally {
      await this.call(s.encodeClose(handle));
    }
  }

  /** Reads a whole file from the brick. */
  async downloadFile(
    fileName: string,
    onProgress?: (received: number, total: number) => void,
  ): Promise<Uint8Array> {
    const { handle, size } = s.decodeOpenRead(await this.call(s.encodeOpenRead(fileName)));
    const data = new Uint8Array(size);
    try {
      for (let got = 0; got < size;) {
        const chunk = s.decodeRead(
          await this.call(s.encodeRead(handle, Math.min(MAX_READ_CHUNK, size - got))),
        );
        if (chunk.length === 0) throw new Error(`The brick stopped sending ${fileName} early`);
        data.set(chunk, got);
        got += chunk.length;
        onProgress?.(got, size);
      }
    } finally {
      await this.call(s.encodeClose(handle));
    }
    return data;
  }

  /** Deletes a file from the brick. */
  async deleteFile(fileName: string): Promise<void> {
    await this.call(s.encodeDelete(fileName));
  }

  /**
   * Reads an ultrasonic sensor's distance in cm (255 = nothing seen). Sets the port up
   * for I2C the first time; register 0x42 at address 0x02 (Ultrasonic I2C Appendix 7).
   */
  async readUltrasonic(port: InputPort, setUp = false): Promise<number> {
    if (setUp) {
      await this.setInputMode(port, SensorType.LowSpeed9V, SensorMode.Raw);
      await sleep(60);
    }
    await this.call(d.encodeLsWrite(port, Uint8Array.of(0x02, 0x42), 1));
    for (let i = 0; i < 20; i++) {
      if (d.decodeLsGetStatus(await this.call(d.encodeLsGetStatus(port))) >= 1) {
        return d.decodeLsRead(await this.call(d.encodeLsRead(port)))[0] ?? 255;
      }
      await sleep(10);
    }
    return 255;
  }

  /** Lists files matching a wildcard such as "*.rxe" or "*.*". */
  async listFiles(pattern = '*.*'): Promise<{ name: string; size: number }[]> {
    const files: { name: string; size: number }[] = [];
    let found: s.FoundFile;
    try {
      found = s.decodeFind(await this.call(s.encodeFindFirst(pattern)));
    } catch (error) {
      if (isEndOfListing(error)) return files;
      throw error;
    }
    files.push({ name: found.name, size: found.size });
    try {
      for (;;) {
        const next = s.decodeFind(await this.call(s.encodeFindNext(found.handle)));
        files.push({ name: next.name, size: next.size });
        found = next;
      }
    } catch (error) {
      if (!isEndOfListing(error)) throw error;
      // On an error the firmware closes the handle itself (docs/spec/system-commands.md).
    }
    return files;
  }
}

// Timers are not in the core packages' lib (no DOM or Node types).
const timers = globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown };
const sleep = (ms: number) => new Promise<void>((resolve) => timers.setTimeout(resolve, ms));

function isEndOfListing(error: unknown): boolean {
  return (
    error instanceof NxtStatusError &&
    (error.status === Status.FileNotFound || error.status === Status.NoMoreFiles)
  );
}
