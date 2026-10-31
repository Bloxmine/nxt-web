import { unzip } from '@nxt/rbt';
import { describe, expect, it } from 'vitest';
import { storeZip } from '../lib/zip';
import { fitSize, toMono } from './frames';

const grey = (values: number[], alpha = 255) => values.flatMap((v) => [v, v, v, alpha]);

describe('GIF frames to pictures', () => {
  it('fits a frame on the screen keeping its shape', () => {
    expect(fitSize(200, 100, 100, 64)).toEqual({ width: 100, height: 50 });
    expect(fitSize(64, 128, 100, 64)).toEqual({ width: 32, height: 64 });
    expect(fitSize(10, 10, 100, 64)).toEqual({ width: 64, height: 64 });
  });

  it('turns dark pixels black, transparent ones white, and can invert', () => {
    const rgba = [...grey([0, 200, 100, 255]), ...grey([0], 0)];
    const base = { threshold: 128, dither: false, invert: false };
    expect([...toMono(rgba, 5, 1, base).pixels]).toEqual([1, 0, 1, 0, 0]);
    expect([...toMono(rgba, 5, 1, { ...base, invert: true }).pixels]).toEqual([0, 1, 0, 1, 1]);
  });

  it('dithers a mid grey into a mix of black and white', () => {
    const rgba = grey(Array<number>(16 * 16).fill(128));
    const px = toMono(rgba, 16, 16, { threshold: 128, dither: true, invert: false }).pixels;
    const dark = px.reduce((a, p) => a + p, 0);
    expect(dark).toBeGreaterThan(100);
    expect(dark).toBeLessThan(156);
    const flat = toMono(rgba, 16, 16, { threshold: 128, dither: false, invert: false }).pixels;
    expect(flat.reduce((a, p) => a + p, 0)).toBe(0);
  });

  it('packs frames into a zip that reads back', async () => {
    const files = [
      { name: 'cat01.ric', bytes: Uint8Array.of(1, 2, 3) },
      { name: 'cat02.ric', bytes: Uint8Array.of(4, 5) },
    ];
    const back = await unzip(storeZip(files));
    expect(back.map((f) => [f.name, [...f.bytes]])).toEqual([
      ['cat01.ric', [1, 2, 3]],
      ['cat02.ric', [4, 5]],
    ]);
  });
});
