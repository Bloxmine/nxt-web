/**
 * .ric picture files (docs/spec/media.md): a list of drawing instructions. Each starts
 * with a little-endian u16 length (bytes after the length field) and a u16 opcode.
 */

export const RIC_OP = {
  DESCRIPTION: 0,
  SPRITE: 1,
  VARMAP: 2,
  COPYBITS: 3,
  PIXEL: 4,
  LINE: 5,
  RECT: 6,
  CIRCLE: 7,
  NUMBOX: 8,
  ELLIPSE: 9,
  POLYGON: 10,
} as const;

/** One instruction of a picture file. */
export type RicOp =
  | { op: 'description'; options: number; width: number; height: number }
  | { op: 'sprite'; address: number; rows: number; bytesPerRow: number; data: Uint8Array }
  | { op: 'varmap'; address: number; points: [number, number][] }
  | {
      op: 'copybits';
      options: number;
      address: number;
      src: { x: number; y: number; w: number; h: number };
      dest: { x: number; y: number };
    }
  | { op: 'pixel'; options: number; x: number; y: number }
  | { op: 'line'; options: number; x1: number; y1: number; x2: number; y2: number }
  | { op: 'rect'; options: number; x: number; y: number; w: number; h: number }
  | { op: 'circle'; options: number; x: number; y: number; r: number }
  | { op: 'numbox'; options: number; x: number; y: number; value: number }
  | { op: 'ellipse'; options: number; x: number; y: number; rx: number; ry: number }
  | { op: 'polygon'; options: number; points: [number, number][] }
  | { op: 'unknown'; code: number };

/** Reads a picture file into its instructions. */
export function decodeRic(bytes: Uint8Array): RicOp[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ops: RicOp[] = [];
  let p = 0;
  while (p + 4 <= bytes.length) {
    const length = view.getUint16(p, true);
    const code = view.getUint16(p + 2, true);
    const end = p + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error('The picture file is damaged');
    const w = (i: number) => view.getInt16(p + 4 + 2 * i, true);
    switch (code) {
      case RIC_OP.DESCRIPTION:
        ops.push({ op: 'description', options: w(0), width: w(1), height: w(2) });
        break;
      case RIC_OP.SPRITE: {
        const rows = w(1);
        const bytesPerRow = w(2);
        ops.push({
          op: 'sprite',
          address: w(0),
          rows,
          bytesPerRow,
          data: bytes.slice(p + 10, p + 10 + rows * bytesPerRow),
        });
        break;
      }
      case RIC_OP.VARMAP: {
        const count = w(1);
        ops.push({
          op: 'varmap',
          address: w(0),
          points: Array.from({ length: count }, (_, i) => [w(2 + 2 * i), w(3 + 2 * i)]),
        });
        break;
      }
      case RIC_OP.COPYBITS:
        ops.push({
          op: 'copybits',
          options: w(0),
          address: w(1),
          src: { x: w(2), y: w(3), w: w(4), h: w(5) },
          dest: { x: w(6), y: w(7) },
        });
        break;
      case RIC_OP.PIXEL:
        ops.push({ op: 'pixel', options: w(0), x: w(1), y: w(2) });
        break;
      case RIC_OP.LINE:
        ops.push({ op: 'line', options: w(0), x1: w(1), y1: w(2), x2: w(3), y2: w(4) });
        break;
      case RIC_OP.RECT:
        ops.push({ op: 'rect', options: w(0), x: w(1), y: w(2), w: w(3), h: w(4) });
        break;
      case RIC_OP.CIRCLE:
        ops.push({ op: 'circle', options: w(0), x: w(1), y: w(2), r: w(3) });
        break;
      case RIC_OP.NUMBOX:
        ops.push({ op: 'numbox', options: w(0), x: w(1), y: w(2), value: w(3) });
        break;
      case RIC_OP.ELLIPSE:
        ops.push({ op: 'ellipse', options: w(0), x: w(1), y: w(2), rx: w(3), ry: w(4) });
        break;
      case RIC_OP.POLYGON: {
        const count = w(1);
        ops.push({
          op: 'polygon',
          options: w(0),
          points: Array.from({ length: count }, (_, i) => [w(2 + 2 * i), w(3 + 2 * i)]),
        });
        break;
      }
      default:
        ops.push({ op: 'unknown', code });
    }
    p = end;
  }
  return ops;
}

/** Something to draw on: brick coordinates, y = 0 at the bottom. */
export interface RicCanvas {
  set(x: number, y: number, on: boolean): void;
}

function line(c: RicCanvas, x0: number, y0: number, x1: number, y1: number, on: boolean) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 1000; guard++) {
    c.set(x0, y0, on);
    if (x0 === x1 && y0 === y1) break;
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

/**
 * Draws a picture at (x, y) (its bottom-left corner). Sprites are rows of bits, most
 * significant bit = leftmost pixel, first row at the top; CopyBits places the source
 * rectangle with its bottom-left corner at the destination. Options bit 2 (0x04) clears
 * pixels instead of setting them (enhanced firmware). Parameters are not supported.
 */
export function renderRic(ops: readonly RicOp[], canvas: RicCanvas, x = 0, y = 0): void {
  const sprites = new Map<number, Extract<RicOp, { op: 'sprite' }>>();
  const on = (options: number) => (options & 0x04) === 0;
  for (const o of ops) {
    switch (o.op) {
      case 'sprite':
        sprites.set(o.address, o);
        break;
      case 'copybits': {
        const s = sprites.get(o.address);
        if (!s) break;
        for (let row = 0; row < o.src.h; row++) {
          // Source row counted from the top of the sprite; destination y grows upwards.
          const srcRow = s.rows - 1 - (o.src.y + row);
          for (let col = 0; col < o.src.w; col++) {
            const sx = o.src.x + col;
            const byte = s.data[srcRow * s.bytesPerRow + (sx >> 3)] ?? 0;
            if ((byte >> (7 - (sx & 7))) & 1) {
              canvas.set(x + o.dest.x + col, y + o.dest.y + row, on(o.options));
            }
          }
        }
        break;
      }
      case 'pixel':
        canvas.set(x + o.x, y + o.y, on(o.options));
        break;
      case 'line':
        line(canvas, x + o.x1, y + o.y1, x + o.x2, y + o.y2, on(o.options));
        break;
      case 'rect': {
        const [x0, y0, x1, y1] = [x + o.x, y + o.y, x + o.x + o.w, y + o.y + o.h];
        line(canvas, x0, y0, x1, y0, on(o.options));
        line(canvas, x1, y0, x1, y1, on(o.options));
        line(canvas, x1, y1, x0, y1, on(o.options));
        line(canvas, x0, y1, x0, y0, on(o.options));
        break;
      }
      case 'circle':
      case 'ellipse': {
        const rx = o.op === 'circle' ? o.r : o.rx;
        const ry = o.op === 'circle' ? o.r : o.ry;
        const steps = Math.max(16, Math.round((rx + ry) * 4));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          canvas.set(
            Math.round(x + o.x + rx * Math.cos(a)),
            Math.round(y + o.y + ry * Math.sin(a)),
            on(o.options),
          );
        }
        break;
      }
      case 'polygon':
        o.points.forEach(([px, py], i) => {
          const [qx, qy] = o.points[(i + 1) % o.points.length]!;
          line(canvas, x + px, y + py, x + qx, y + qy, on(o.options));
        });
        break;
      default:
        break;
    }
  }
}

/** Size a picture says it has (its description), or the extent of its sprites. */
export function ricSize(ops: readonly RicOp[]): { width: number; height: number } {
  const d = ops.find((o) => o.op === 'description');
  if (d && d.op === 'description' && d.width > 0) return { width: d.width, height: d.height };
  let width = 0;
  let height = 0;
  for (const o of ops) {
    if (o.op === 'copybits') {
      width = Math.max(width, o.dest.x + o.src.w);
      height = Math.max(height, o.dest.y + o.src.h);
    }
  }
  return { width: width || 100, height: height || 64 };
}

/**
 * Makes a picture file from a black-and-white bitmap (`pixels[row * width + col]`,
 * first row at the top): a description, one sprite and one CopyBits.
 */
export function encodeRic(
  width: number,
  height: number,
  pixels: ArrayLike<boolean | number>,
): Uint8Array {
  if (width < 1 || height < 1 || width > 100 || height > 64) {
    throw new Error('Pictures must be 1–100 pixels wide and 1–64 high');
  }
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (pixels[row * width + col]) data[row * bytesPerRow + (col >> 3)]! |= 0x80 >> (col & 7);
    }
  }
  const out: number[] = [];
  const u16 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff);
  // Description: options 0, width, height.
  [8, RIC_OP.DESCRIPTION, 0, width, height].forEach(u16);
  // Sprite 1 (data padded to an even length).
  const padded = data.length + (data.length % 2);
  [padded + 8, RIC_OP.SPRITE, 1, height, bytesPerRow].forEach(u16);
  out.push(...data);
  if (data.length % 2) out.push(0);
  // CopyBits: whole sprite to (0, 0).
  [18, RIC_OP.COPYBITS, 0, 1, 0, 0, width, height, 0, 0].forEach(u16);
  return Uint8Array.from(out);
}
