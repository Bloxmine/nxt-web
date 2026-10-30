import { BaseTransport } from './base.js';
import type { Transport } from './transport.js';

/**
 * Decides how the mock brick answers a telegram. Return the reply telegram, an
 * array of telegrams, or `undefined` for no reply.
 */
export type MockResponder = (request: Uint8Array) => Uint8Array | Uint8Array[] | undefined;

/**
 * An in-memory brick for tests and offline development. Records every telegram
 * sent and answers using a responder function.
 */
export class MockTransport extends BaseTransport implements Transport {
  readonly kind = 'Mock';

  /** Every telegram sent, in order. */
  readonly sent: Uint8Array[] = [];

  /** When set, the next `send` rejects with this error (then it is cleared). */
  failNextSend: Error | undefined;

  constructor(private responder: MockResponder = () => undefined) {
    super();
  }

  /** Replaces the responder. */
  respondWith(responder: MockResponder): void {
    this.responder = responder;
  }

  async connect(): Promise<void> {
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected');
  }

  async send(bytes: Uint8Array): Promise<void> {
    this.assertConnected();
    if (this.failNextSend) {
      const error = this.failNextSend;
      this.failNextSend = undefined;
      throw error;
    }
    const copy = bytes.slice();
    this.sent.push(copy);
    const reply = this.responder(copy);
    if (reply === undefined) return;
    for (const packet of Array.isArray(reply) ? reply : [reply]) this.inbox.push(packet);
  }

  /** Delivers a telegram as if the brick sent it unprompted (e.g. a late reply). */
  inject(packet: Uint8Array): void {
    this.inbox.push(packet);
  }

  /** Simulates the cable being pulled. */
  unplug(): void {
    this.setState('disconnected');
  }
}
