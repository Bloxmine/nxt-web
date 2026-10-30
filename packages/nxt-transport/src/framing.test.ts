import { describe, expect, it } from 'vitest';
import { BluetoothDeframer, frameBluetooth } from './framing.js';

// docs/spec/telegram.md, "Bluetooth framing": 2-byte LE length, excluding itself.
describe('frameBluetooth', () => {
  it('prefixes the little-endian length', () => {
    // GETBATTERYLEVEL with reply: 0x00 0x0B
    expect(frameBluetooth(new Uint8Array([0x00, 0x0b]))).toEqual(
      new Uint8Array([0x02, 0x00, 0x00, 0x0b]),
    );
  });

  it('encodes lengths above 255', () => {
    const framed = frameBluetooth(new Uint8Array(300));
    expect([framed[0], framed[1]]).toEqual([300 & 0xff, 300 >> 8]);
  });
});

describe('BluetoothDeframer', () => {
  it('splits a stream into telegrams across chunk boundaries', () => {
    const d = new BluetoothDeframer();
    // Battery reply 0x02 0x0B 0x00 <mV LE>, 5 bytes, then a 3-byte status reply.
    expect(d.push(new Uint8Array([0x05, 0x00, 0x02, 0x0b]))).toEqual([]);
    const out = d.push(new Uint8Array([0x00, 0x40, 0x1f, 0x03, 0x00, 0x02, 0x03, 0x00]));
    expect(out).toEqual([
      new Uint8Array([0x02, 0x0b, 0x00, 0x40, 0x1f]),
      new Uint8Array([0x02, 0x03, 0x00]),
    ]);
  });

  it('round-trips with frameBluetooth', () => {
    const d = new BluetoothDeframer();
    const t = new Uint8Array([0x00, 0x03, 0xb8, 0x01, 0xe8, 0x03]);
    expect(d.push(frameBluetooth(t))).toEqual([t]);
  });
});
