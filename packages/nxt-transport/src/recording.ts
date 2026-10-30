import { MockTransport } from './mock.js';
import type { Transport, TransportStateListener } from './transport.js';

/** One telegram in a capture. */
export interface CapturedTelegram {
  /** 'out' = sent to the brick, 'in' = received from it. */
  dir: 'out' | 'in';
  /** Milliseconds since recording started. */
  at: number;
  /** Bytes as lowercase hex, e.g. "010b". */
  hex: string;
}

/** A recorded session with a brick, saved as JSON under fixtures/captures/. */
export interface Capture {
  format: 'nxt-capture';
  version: 1;
  /** Link type, e.g. "USB". */
  kind: string;
  recordedAt: string;
  /** What was done, e.g. "Battery, firmware version, upload Hello.rxe". */
  note: string;
  telegrams: CapturedTelegram[];
}

const clock = globalThis as unknown as { performance?: { now(): number } };
const now = () => clock.performance?.now() ?? Date.now();

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

/**
 * Wraps a transport and records every telegram in both directions, so real brick
 * traffic can be saved as a test fixture (docs/hardware-tests.md, "Recording").
 */
export class RecordingTransport implements Transport {
  readonly telegrams: CapturedTelegram[] = [];
  private readonly start = now();

  constructor(private readonly inner: Transport) {}

  get kind(): string {
    return this.inner.kind;
  }

  get state() {
    return this.inner.state;
  }

  connect(): Promise<void> {
    return this.inner.connect();
  }

  disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  async send(bytes: Uint8Array): Promise<void> {
    this.telegrams.push({ dir: 'out', at: Math.round(now() - this.start), hex: toHex(bytes) });
    await this.inner.send(bytes);
  }

  async receive(timeoutMs: number): Promise<Uint8Array> {
    const bytes = await this.inner.receive(timeoutMs);
    this.telegrams.push({ dir: 'in', at: Math.round(now() - this.start), hex: toHex(bytes) });
    return bytes;
  }

  drain(): void {
    this.inner.drain();
  }

  onStateChange(listener: TransportStateListener): () => void {
    return this.inner.onStateChange(listener);
  }

  /** The recording so far as a capture file. */
  capture(note = ''): Capture {
    return {
      format: 'nxt-capture',
      version: 1,
      kind: this.inner.kind,
      recordedAt: new Date().toISOString(),
      note,
      telegrams: [...this.telegrams],
    };
  }
}

/**
 * A mock brick that replays a capture: each request must match the next recorded 'out'
 * telegram, and is answered with the 'in' telegrams that followed it. Throws when a
 * request differs from the recording, so tests notice protocol changes.
 */
export function replayCapture(capture: Capture): MockTransport {
  let i = 0;
  return new MockTransport((request) => {
    while (i < capture.telegrams.length && capture.telegrams[i]!.dir === 'in') i++;
    const expected = capture.telegrams[i];
    if (!expected) throw new Error(`Capture ended; unexpected request ${toHex(request)}`);
    if (expected.hex !== toHex(request)) {
      throw new Error(`Request ${toHex(request)} differs from the capture (${expected.hex})`);
    }
    i++;
    const replies: Uint8Array[] = [];
    while (i < capture.telegrams.length && capture.telegrams[i]!.dir === 'in') {
      replies.push(fromHex(capture.telegrams[i++]!.hex));
    }
    return replies.length ? replies : undefined;
  });
}
