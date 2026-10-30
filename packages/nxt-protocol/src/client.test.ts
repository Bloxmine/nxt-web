import { MockTransport, TransportTimeoutError } from '@nxt/transport';
import { describe, expect, it } from 'vitest';
import { NxtClient, NxtStatusError } from './index.js';

const reply = (opcode: number, status = 0, ...rest: number[]) =>
  new Uint8Array([0x02, opcode, status, ...rest]);

async function setup(responder: (req: Uint8Array) => Uint8Array | Uint8Array[] | undefined) {
  const mock = new MockTransport(responder);
  await mock.connect();
  return { mock, client: new NxtClient(mock, { timeoutMs: 50 }) };
}

describe('NxtClient', () => {
  it('uploads a program in 61-byte chunks, replacing an existing file', async () => {
    let exists = true;
    const { mock, client } = await setup((req) => {
      switch (req[1]) {
        case 0x89: // OPEN WRITE LINEAR
          return exists ? reply(0x89, 0x8f) : reply(0x89, 0, 7);
        case 0x85: // DELETE
          exists = false;
          return reply(0x85, 0, ...new Array(20).fill(0));
        case 0x83: // WRITE: echo the handle and the byte count
          return reply(0x83, 0, req[2]!, req.length - 3, 0);
        default: // CLOSE
          return reply(req[1]!, 0, req[2]!);
      }
    });
    const data = Uint8Array.from({ length: 150 }, (_, i) => i);
    const progress: number[] = [];
    await client.uploadFile('Prog.rxe', data, (sent) => progress.push(sent));
    expect(mock.sent.map((t) => t[1])).toEqual([0x89, 0x85, 0x89, 0x83, 0x83, 0x83, 0x84]);
    expect(progress).toEqual([61, 122, 150]);
    const written = mock.sent.filter((t) => t[1] === 0x83).flatMap((t) => [...t.subarray(3)]);
    expect(written).toEqual([...data]);
    expect(mock.sent.every((t) => t.length <= 64)).toBe(true);
  });

  it('reads the battery level', async () => {
    const { client } = await setup(() => reply(0x0b, 0, 0x40, 0x1f));
    expect(await client.getBatteryLevel()).toBe(8000);
  });

  it('serialises concurrent requests', async () => {
    const { mock, client } = await setup((req) =>
      req[1] === 0x0b ? reply(0x0b, 0, 0x10, 0x27) : reply(req[1]!, 0, 0, 0, 0, 0),
    );
    const [battery, sleep] = await Promise.all([client.getBatteryLevel(), client.keepAlive()]);
    expect(battery).toBe(10000);
    expect(sleep).toBe(0);
    expect(mock.sent.map((t) => t[1])).toEqual([0x0b, 0x0d]);
  });

  it('throws NxtStatusError with a readable message', async () => {
    const { client } = await setup(() => reply(0x00, 0xbd));
    await expect(client.startProgram('x.rxe')).rejects.toThrow('Request failed (file not found)');
  });

  it('skips a stale reply from an earlier timed-out request', async () => {
    const { mock, client } = await setup(() => undefined);
    await expect(client.getBatteryLevel()).rejects.toBeInstanceOf(TransportTimeoutError);
    mock.respondWith(() => [reply(0x0b, 0, 1, 0), reply(0x0d, 0, 0x60, 0xea, 0, 0)]);
    expect(await client.keepAlive()).toBe(60000);
  });

  it('keeps working after a failed request', async () => {
    const { mock, client } = await setup(() => reply(0x0b, 0, 1, 0));
    mock.failNextSend = new Error('USB error');
    await expect(client.getBatteryLevel()).rejects.toThrow('USB error');
    expect(await client.getBatteryLevel()).toBe(1);
  });

  it('returns null when no program is running', async () => {
    const { client } = await setup(() => reply(0x11, 0xec, ...new Array(20).fill(0)));
    expect(await client.getCurrentProgramName()).toBeNull();
  });

  it('treats "no active program" as success when stopping', async () => {
    const { client } = await setup(() => reply(0x01, 0xec));
    await expect(client.stopProgram()).resolves.toBeUndefined();
  });

  it('does not wait for a reply on no-reply telegrams', async () => {
    const { mock, client } = await setup(() => undefined);
    await client.request(new Uint8Array([0x80, 0x03, 0xb8, 0x01, 0x64, 0x00]));
    expect(mock.sent).toHaveLength(1);
  });

  it('lists files until the brick reports none left', async () => {
    const files = ['a.rxe', 'b.rso'];
    let i = 0;
    const { client } = await setup((req) => {
      const name = files[i++];
      if (!name) return reply(req[1]!, 0x83);
      const r = new Uint8Array(28);
      r.set([0x02, req[1]!, 0x00, 0x05]);
      r.set(
        Array.from(name, (c) => c.charCodeAt(0)),
        4,
      );
      r.set([100 * i, 0, 0, 0], 24);
      return r;
    });
    expect(await client.listFiles('*.*')).toEqual([
      { name: 'a.rxe', size: 100 },
      { name: 'b.rso', size: 200 },
    ]);
  });

  it('returns an empty list when FIND FIRST finds nothing', async () => {
    const { client } = await setup(() => reply(0x86, 0x87));
    expect(await client.listFiles()).toEqual([]);
  });

  it('builds a device summary', async () => {
    const { client } = await setup((req) => {
      if (req[1] === 0x9b) {
        const r = new Uint8Array(33);
        r.set([0x02, 0x9b, 0x00, 0x42, 0x6f, 0x62]); // "Bob"
        return r;
      }
      if (req[1] === 0x88) return reply(0x88, 0, 0x7c, 0x01, 0x1f, 0x01);
      return reply(0x0b, 0, 0xa0, 0x1f);
    });
    expect(await client.getSummary()).toMatchObject({
      name: 'Bob',
      firmware: '1.31',
      protocol: '1.124',
      batteryMillivolts: 8096,
    });
  });

  it('exposes the status code on errors', async () => {
    const { client } = await setup(() => reply(0x0b, 0xff));
    const error = await client.getBatteryLevel().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NxtStatusError);
    expect((error as NxtStatusError).status).toBe(0xff);
  });
});
