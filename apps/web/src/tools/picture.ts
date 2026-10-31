import { decodeRic, encodeRic, renderRic, ricSize } from '@nxt/media';
import { glyph } from '@nxt/sim';

/** A black-and-white picture: one byte per pixel (1 = black), rows from the top. */
export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export function blank(width = 100, height = 64): Bitmap {
  return { width, height, pixels: new Uint8Array(width * height) };
}

export function copy(b: Bitmap): Bitmap {
  return { ...b, pixels: b.pixels.slice() };
}

export function set(b: Bitmap, x: number, y: number, on: boolean): void {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
  b.pixels[y * b.width + x] = on ? 1 : 0;
}

export function get(b: Bitmap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < b.width && y < b.height && b.pixels[y * b.width + x] === 1;
}

/** Straight line (Bresenham). */
export function line(b: Bitmap, x0: number, y0: number, x1: number, y1: number, on: boolean) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    set(b, x0, y0, on);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Rectangle between two corners, outlined or filled. */
export function rect(
  b: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
  on: boolean,
) {
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [t, bt] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = t; y <= bt; y++) {
    for (let x = l; x <= r; x++) {
      if (filled || x === l || x === r || y === t || y === bt) set(b, x, y, on);
    }
  }
}

/** Ellipse inside the box between two corners (outline). */
export function ellipse(b: Bitmap, x0: number, y0: number, x1: number, y1: number, on: boolean) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  const steps = Math.max(16, Math.ceil(2 * Math.PI * Math.max(rx, ry)));
  let last: [number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    const p: [number, number] = [
      Math.round(cx + rx * Math.cos(a)),
      Math.round(cy + ry * Math.sin(a)),
    ];
    if (last) line(b, last[0], last[1], p[0], p[1], on);
    last = p;
  }
}

/** Fills the area of same-coloured pixels around (x, y). */
export function flood(b: Bitmap, x: number, y: number, on: boolean): void {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
  const target = get(b, x, y);
  if (target === on) return;
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= b.width || py >= b.height || get(b, px, py) !== target) continue;
    set(b, px, py, on);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

/** Text in the brick's own font, top-left corner at (x, y). */
export function text(b: Bitmap, x: number, y: number, value: string, on: boolean): void {
  let cx = x;
  for (const char of value) {
    const columns = glyph(char);
    columns.forEach((bits, col) => {
      for (let row = 0; row < 8; row++) if ((bits >> row) & 1) set(b, cx + col, y + row, on);
    });
    cx += 6;
  }
}

export function invert(b: Bitmap): Bitmap {
  return { ...b, pixels: b.pixels.map((p) => 1 - p) };
}

export function flip(b: Bitmap, axis: 'horizontal' | 'vertical'): Bitmap {
  const out = blank(b.width, b.height);
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const sx = axis === 'horizontal' ? b.width - 1 - x : x;
      const sy = axis === 'vertical' ? b.height - 1 - y : y;
      out.pixels[y * b.width + x] = b.pixels[sy * b.width + sx]!;
    }
  }
  return out;
}

/** A new size, keeping the top-left part. */
export function resize(b: Bitmap, width: number, height: number): Bitmap {
  const out = blank(width, height);
  for (let y = 0; y < Math.min(height, b.height); y++) {
    for (let x = 0; x < Math.min(width, b.width); x++) {
      out.pixels[y * width + x] = b.pixels[y * b.width + x]!;
    }
  }
  return out;
}

/**
 * The picture on a blank 100 × 64 screen with its bottom-left corner at (x, y), y counted
 * from the bottom like the brick does.
 */
export function place(b: Bitmap, x: number, y: number): Bitmap {
  const screen = blank();
  const top = 64 - y - b.height;
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) {
      if (b.pixels[r * b.width + c]) set(screen, x + c, top + r, true);
    }
  }
  return screen;
}

/** Reads a .ric picture file. */
export function fromRic(bytes: Uint8Array): Bitmap {
  const ops = decodeRic(bytes);
  const { width, height } = ricSize(ops);
  const b = blank(Math.min(100, width), Math.min(64, height));
  // renderRic uses brick coordinates: y = 0 at the bottom.
  renderRic(ops, { set: (x, y, on) => set(b, x, b.height - 1 - y, on) });
  return b;
}

export function toRic(b: Bitmap): Uint8Array {
  return encodeRic(b.width, b.height, b.pixels);
}
