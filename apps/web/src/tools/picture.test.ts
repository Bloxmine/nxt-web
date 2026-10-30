import { describe, expect, it } from 'vitest';
import {
  blank,
  ellipse,
  flip,
  flood,
  fromRic,
  get,
  line,
  rect,
  resize,
  text,
  toRic,
} from './picture';

const dark = (b: ReturnType<typeof blank>) => b.pixels.reduce((n, p) => n + p, 0);

describe('picture editor', () => {
  it('draws lines, boxes and ellipses', () => {
    const b = blank(20, 10);
    line(b, 0, 0, 9, 0, true);
    expect(dark(b)).toBe(10);
    rect(b, 0, 2, 4, 6, false, true);
    expect(get(b, 2, 4)).toBe(false);
    rect(b, 0, 2, 4, 6, true, true);
    expect(get(b, 2, 4)).toBe(true);
    const e = blank(20, 20);
    ellipse(e, 2, 2, 17, 17, true);
    expect(get(e, 2, 10) || get(e, 2, 9)).toBe(true);
    expect(get(e, 10, 10)).toBe(false);
  });

  it('fills an enclosed area only', () => {
    const b = blank(10, 10);
    rect(b, 2, 2, 7, 7, false, true);
    flood(b, 4, 4, true);
    expect(get(b, 4, 4)).toBe(true);
    expect(get(b, 0, 0)).toBe(false);
    expect(dark(b)).toBe(36);
  });

  it('writes text in the brick font', () => {
    const b = blank(12, 8);
    text(b, 0, 0, 'I', true);
    expect(get(b, 2, 0)).toBe(true);
    expect(get(b, 0, 7)).toBe(false);
  });

  it('flips and resizes', () => {
    const b = blank(4, 2);
    b.pixels[0] = 1;
    expect(flip(b, 'horizontal').pixels[3]).toBe(1);
    expect(flip(b, 'vertical').pixels[4]).toBe(1);
    const r = resize(b, 2, 3);
    expect([r.width, r.height, r.pixels[0]]).toEqual([2, 3, 1]);
  });

  it('round-trips through a .ric file', () => {
    const b = blank(100, 64);
    text(b, 10, 20, 'NXT!', true);
    rect(b, 0, 0, 99, 63, false, true);
    const back = fromRic(toRic(b));
    expect([back.width, back.height]).toEqual([100, 64]);
    expect([...back.pixels]).toEqual([...b.pixels]);
  });
});
