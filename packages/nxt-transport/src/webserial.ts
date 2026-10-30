/// <reference lib="dom" />
/// <reference types="w3c-web-serial" />
import { BaseTransport } from './base.js';
import { BluetoothDeframer, frameBluetooth } from './framing.js';
import type { Transport } from './transport.js';

/**
 * Talks to a brick over an OS-paired Bluetooth serial port (RFCOMM) using Web
 * Serial. Experimental: the brick's Bluetooth stack is unreliable on modern hosts.
 */
export class WebSerialTransport extends BaseTransport implements Transport {
  readonly kind = 'Bluetooth';
  private readonly deframer = new BluetoothDeframer();
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(readonly port: SerialPort) {
    super();
  }

  /** Shows the browser's serial port picker. */
  static async request(serial: Serial = navigator.serial): Promise<WebSerialTransport> {
    return new WebSerialTransport(await serial.requestPort());
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    try {
      // RFCOMM ignores the baud rate, but Web Serial requires one.
      await this.port.open({ baudRate: 115200 });
    } catch (error) {
      this.setState('disconnected');
      throw error;
    }
    this.deframer.reset();
    this.setState('connected');
    void this.readLoop();
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected');
    try {
      await this.reader?.cancel();
      await this.port.close();
    } catch {
      // Port already closed.
    }
  }

  async send(bytes: Uint8Array): Promise<void> {
    this.assertConnected();
    const writer = this.port.writable?.getWriter();
    if (!writer) throw new Error('Serial port is not writable');
    try {
      await writer.write(frameBluetooth(bytes));
    } finally {
      writer.releaseLock();
    }
  }

  private async readLoop(): Promise<void> {
    while (this.state === 'connected' && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          for (const telegram of this.deframer.push(value)) this.inbox.push(telegram);
        }
      } catch {
        break;
      } finally {
        this.reader.releaseLock();
      }
    }
    this.setState('disconnected');
  }
}
