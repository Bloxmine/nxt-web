import { describe, expect, it } from 'vitest';
import { encodeGif, lcdGif, toWebPalette, webPalette } from './gifEncoder';

describe('GIF encoder', () => {
  it('writes a GIF89a with the size, a loop extension and a trailer', () => {
    const gif = encodeGif(
      3,
      2,
      [
        [0, 0, 0],
        [255, 255, 255],
      ],
      [{ indexes: Uint8Array.of(0, 1, 0, 1, 0, 1), delayMs: 100 }],
    );
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect([gif[6], gif[7], gif[8], gif[9]]).toEqual([3, 0, 2, 0]);
    expect(String.fromCharCode(...gif.slice(13 + 6 + 3, 13 + 6 + 14))).toBe('NETSCAPE2.0');
    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it('maps colours to the web palette', () => {
    const palette = webPalette();
    expect(palette).toHaveLength(256);
    const idx = toWebPalette([255, 0, 0, 255, 128, 128, 128, 255, 0, 0, 0, 255], 3);
    expect(palette[idx[0]!]).toEqual([255, 0, 0]);
    expect(Math.abs(palette[idx[1]!]![0] - 128)).toBeLessThan(8);
    expect(palette[idx[2]!]).toEqual([0, 0, 0]);
  });

  it('merges screen shots that did not change', () => {
    const blank = new Uint8Array(6400);
    const dot = blank.slice();
    dot[0] = 1;
    const once = lcdGif([{ pixels: blank, at: 0 }], 1, 100);
    const merged = lcdGif(
      [
        { pixels: blank, at: 0 },
        { pixels: blank, at: 100 },
        { pixels: dot, at: 200 },
      ],
      1,
      300,
    );
    const frames = (g: Uint8Array) => g.filter((b, i) => b === 0x2c && g[i - 1] === 0).length;
    expect(frames(once)).toBe(1);
    expect(frames(merged)).toBe(2);
  });
});
