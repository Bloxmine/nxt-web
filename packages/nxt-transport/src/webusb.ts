/// <reference lib="dom" />
/// <reference types="w3c-web-usb" />
import { BaseTransport } from './base.js';
import type { Transport } from './transport.js';

/**
 * USB IDs of a brick running the standard firmware.
 * Source: docs/spec/usb.md (cross-checked against nxt-python).
 */
export const NXT_USB_FILTER: USBDeviceFilter = { vendorId: 0x0694, productId: 0x0002 };

/** Largest bulk transfer the brick accepts (docs/spec/usb.md). */
export const NXT_USB_PACKET_SIZE = 64;

const INTERFACE_NUMBER = 0;

/** Talks to a brick over WebUSB bulk endpoints. Telegrams are sent raw. */
export class WebUsbTransport extends BaseTransport implements Transport {
  readonly kind = 'USB';
  private endpointIn = 0;
  private endpointOut = 0;
  private readLoopRunning = false;
  private readonly handleDisconnect = (event: USBConnectionEvent) => {
    if (event.device === this.device) this.markDisconnected();
  };

  constructor(
    readonly device: USBDevice,
    private readonly usb: USB = navigator.usb,
  ) {
    super();
  }

  /** Shows the browser's device picker filtered to NXT bricks. */
  static async request(usb: USB = navigator.usb): Promise<WebUsbTransport> {
    const device = await usb.requestDevice({ filters: [NXT_USB_FILTER] });
    return new WebUsbTransport(device, usb);
  }

  /** Bricks this site already has permission for, so no picker is needed. */
  static async paired(usb: USB = navigator.usb): Promise<WebUsbTransport[]> {
    const devices = await usb.getDevices();
    return devices
      .filter(
        (d) => d.vendorId === NXT_USB_FILTER.vendorId && d.productId === NXT_USB_FILTER.productId,
      )
      .map((d) => new WebUsbTransport(d, usb));
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.setState('connecting');
    try {
      if (!this.device.opened) await this.device.open();
      if (this.device.configuration === null) await this.device.selectConfiguration(1);
      await this.device.claimInterface(INTERFACE_NUMBER);
      this.findEndpoints();
    } catch (error) {
      this.setState('disconnected');
      throw error;
    }
    this.usb.addEventListener('disconnect', this.handleDisconnect);
    this.setState('connected');
    void this.readLoop();
  }

  async disconnect(): Promise<void> {
    this.markDisconnected();
    try {
      if (this.device.opened) {
        await this.device.releaseInterface(INTERFACE_NUMBER).catch(() => {});
        await this.device.close();
      }
    } catch {
      // Device already gone; nothing to clean up.
    }
  }

  async send(bytes: Uint8Array): Promise<void> {
    this.assertConnected();
    if (bytes.length > NXT_USB_PACKET_SIZE) {
      throw new RangeError(`Telegram is ${bytes.length} bytes; USB limit is 64`);
    }
    const result = await this.device.transferOut(
      this.endpointOut,
      bytes as Uint8Array<ArrayBuffer>,
    );
    if (result.status !== 'ok') throw new Error(`USB write failed: ${result.status}`);
  }

  private findEndpoints(): void {
    const iface = this.device.configuration?.interfaces.find(
      (i) => i.interfaceNumber === INTERFACE_NUMBER,
    );
    const endpoints = iface?.alternate.endpoints ?? [];
    const bulkIn = endpoints.find((e) => e.type === 'bulk' && e.direction === 'in');
    const bulkOut = endpoints.find((e) => e.type === 'bulk' && e.direction === 'out');
    if (!bulkIn || !bulkOut) throw new Error('Brick has no bulk USB endpoints');
    this.endpointIn = bulkIn.endpointNumber;
    this.endpointOut = bulkOut.endpointNumber;
  }

  private async readLoop(): Promise<void> {
    if (this.readLoopRunning) return;
    this.readLoopRunning = true;
    try {
      while (this.state === 'connected') {
        const result = await this.device.transferIn(this.endpointIn, NXT_USB_PACKET_SIZE);
        if (result.status === 'stall') {
          await this.device.clearHalt('in', this.endpointIn);
          continue;
        }
        if (result.data && result.data.byteLength > 0) {
          this.inbox.push(
            new Uint8Array(
              result.data.buffer.slice(
                result.data.byteOffset,
                result.data.byteOffset + result.data.byteLength,
              ),
            ),
          );
        }
      }
    } catch {
      // Transfer errors mean the device went away or was closed.
      this.markDisconnected();
    } finally {
      this.readLoopRunning = false;
    }
  }

  private markDisconnected(): void {
    this.usb.removeEventListener('disconnect', this.handleDisconnect);
    this.setState('disconnected');
  }
}
