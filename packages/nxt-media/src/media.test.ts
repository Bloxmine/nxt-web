import { describe, expect, it } from 'vitest';
import { decodeRic, encodeRic, renderRic, ricSize } from './ric.js';
import { decodeRso, encodeRso, toPcm8 } from './rso.js';

describe('.rso', () => {
  it('writes and reads the 8-byte big-endian header', () => {
    const file = encodeRso(Uint8Array.of(128, 200, 50), 8000);
    expect([...file.slice(0, 8)]).toEqual([0x01, 0x00, 0x00, 0x03, 0x1f, 0x40, 0x00, 0x00]);
    expect(decodeRso(file)).toMatchObject({ codec: 0x100, sampleRate: 8000, loop: false });
    expect([...decodeRso(file).samples]).toEqual([128, 200, 50]);
  });

  it('resamples audio to 8 kHz bytes', () => {
    const tone = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i / 10));
    const pcm = toPcm8(tone, 44100);
    expect(pcm.length).toBe(8000);
    expect(Math.max(...pcm)).toBeGreaterThan(220);
    expect(Math.min(...pcm)).toBeLessThan(35);
  });

  it('rejects other files', () => {
    expect(() => decodeRso(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8))).toThrow();
  });
});

describe('.ric', () => {
  it('round-trips a bitmap through description, sprite and copybits', () => {
    // 10×3 bitmap: an X-ish pattern, first row at the top.
    const rows = ['1000000001', '0100000010', '0011111100'];
    const pixels = rows
      .join('')
      .split('')
      .map((c) => c === '1');
    const file = encodeRic(10, 3, pixels);
    const ops = decodeRic(file);
    expect(ops.map((o) => o.op)).toEqual(['description', 'sprite', 'copybits']);
    expect(ricSize(ops)).toEqual({ width: 10, height: 3 });
    const set = new Set<string>();
    renderRic(ops, { set: (x, y, on) => (on ? set.add(`${x},${y}`) : set.delete(`${x},${y}`)) });
    // Top row (row 0) lands at y = 2; the bottom row at y = 0.
    expect(set.has('0,2') && set.has('9,2')).toBe(true);
    expect(set.has('2,0') && set.has('7,0')).toBe(true);
    expect(set.has('0,0')).toBe(false);
    expect(set.size).toBe(pixels.filter(Boolean).length);
  });

  it('matches the NXC macro layout for CopyBits (length 18, opcode 3)', () => {
    const file = encodeRic(8, 1, [1, 0, 0, 0, 0, 0, 0, 1]);
    // description (10 bytes) + sprite (2 + 8 + 2 padded bytes) + copybits.
    expect([...file.slice(22, 26)]).toEqual([18, 0, 3, 0]);
  });
});
