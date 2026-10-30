import { describe, expect, it } from 'vitest';
import { MockTransport } from './mock.js';
import { TransportClosedError, TransportTimeoutError } from './transport.js';

describe('MockTransport', () => {
  it('records sent telegrams and returns scripted replies', async () => {
    const t = new MockTransport((req) => new Uint8Array([0x02, req[1]!, 0x00]));
    await t.connect();
    await t.send(new Uint8Array([0x00, 0x0d]));
    expect(t.sent).toEqual([new Uint8Array([0x00, 0x0d])]);
    expect(await t.receive(50)).toEqual(new Uint8Array([0x02, 0x0d, 0x00]));
  });

  it('times out without swallowing a later reply', async () => {
    const t = new MockTransport();
    await t.connect();
    await expect(t.receive(10)).rejects.toBeInstanceOf(TransportTimeoutError);
    t.inject(new Uint8Array([1]));
    expect(await t.receive(10)).toEqual(new Uint8Array([1]));
  });

  it('rejects pending receives and reports state when unplugged', async () => {
    const t = new MockTransport();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    await t.connect();
    const pending = t.receive(1000);
    t.unplug();
    await expect(pending).rejects.toBeInstanceOf(TransportClosedError);
    expect(states).toEqual(['connected', 'disconnected']);
    await expect(t.send(new Uint8Array([0]))).rejects.toBeInstanceOf(TransportClosedError);
  });

  it('can reconnect after unplugging', async () => {
    const t = new MockTransport(() => new Uint8Array([2]));
    await t.connect();
    t.unplug();
    await t.connect();
    await t.send(new Uint8Array([0]));
    expect(await t.receive(10)).toEqual(new Uint8Array([2]));
  });
});
