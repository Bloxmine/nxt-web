import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromHex, replayCapture, type Capture } from '@nxt/transport';
import { describe, expect, it } from 'vitest';
import { NxtClient } from './index.js';

const dir = join(import.meta.dirname, '../../../fixtures/captures');
const captures = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as Capture] as const);

describe('recorded brick traffic', () => {
  it.each(captures)('%s replays through the client', async (_name, capture) => {
    expect(capture.format).toBe('nxt-capture');
    const mock = replayCapture(capture);
    await mock.connect();
    const client = new NxtClient(mock, { timeoutMs: 50 });
    // Every request that got a reply must decode as a successful reply to it.
    for (const t of capture.telegrams.filter((x) => x.dir === 'out')) {
      const request = fromHex(t.hex);
      const wantsReply = (request[0]! & 0x80) === 0;
      if (wantsReply) {
        const reply = await client.call(request);
        expect(reply[1]).toBe(request[1]);
      } else {
        await client.request(request);
      }
    }
  });

  it('the synthetic capture decodes to the documented values', async () => {
    const capture = captures.find(([n]) => n.startsWith('synthetic'))![1];
    const mock = replayCapture(capture);
    await mock.connect();
    const client = new NxtClient(mock);
    expect(await client.getBatteryLevel()).toBe(8000);
    expect(await client.getFirmwareVersion()).toEqual({
      protocol: { major: 1, minor: 124 },
      firmware: { major: 1, minor: 31 },
    });
  });
});

describe('RecordingTransport', () => {
  it('records both directions', async () => {
    const { RecordingTransport, MockTransport } = await import('@nxt/transport');
    const rec = new RecordingTransport(new MockTransport(() => Uint8Array.of(2, 0x0b, 0, 1, 0)));
    await rec.connect();
    await new NxtClient(rec).getBatteryLevel();
    expect(rec.capture('test').telegrams.map((t) => [t.dir, t.hex])).toEqual([
      ['out', '000b'],
      ['in', '020b000100'],
    ]);
  });
});
