/// <reference lib="dom" />
/// <reference types="w3c-web-serial" />
import { BaseTransport } from './base.js';
import { BluetoothDeframer, frameBluetooth } from './framing.js';
import type { Transport } from './transport.js';

/** Bluetooth Serial Port Profile service class, the serial service a paired brick offers. */
export const SERIAL_PORT_PROFILE = '00001101-0000-1000-8000-00805f9b34fb';

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

  /**
   * Shows the browser's serial port picker. By default it lists only Bluetooth devices
   * that offer the Serial Port Profile, so the computer's own serial ports (ttyS0…) stay
   * out of the way; `anyPort` lists every port, for a port bound by hand (/dev/rfcomm0).
   */
  static async request(
    serial: Serial = navigator.serial,
    { anyPort = false }: { anyPort?: boolean } = {},
  ): Promise<WebSerialTransport> {
    const options: SerialPortRequestOptions = anyPort
      ? {}
      : { filters: [{ bluetoothServiceClassId: SERIAL_PORT_PROFILE }] };
    return new WebSerialTransport(await serial.requestPort(options));
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
